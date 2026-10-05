package payments

// NOWPayments (https://nowpayments.io) crypto gateway: the player is sent to a hosted
// invoice page, picks a coin and pays; NOWPayments then reports the payment status to
// our IPN endpoint. The sandbox (api-sandbox.nowpayments.io) works the same way with
// test coins. Deposits only; payouts are a later step.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

var nowPaymentsMethod = Method{Code: "nowpayments", Title: "Crypto: USDT, BTC, ETH and more (NOWPayments)", Kind: "gateway", Provider: "nowpayments", MinCents: 1000}

var npClient = &http.Client{Timeout: 20 * time.Second}

func (s *Service) nowPaymentsDeposit(w http.ResponseWriter, r *http.Request, pid uuid.UUID, m Method, amount int64) error {
	if amount < m.MinCents {
		return httpx.Err(400, "amount_too_small", fmt.Sprintf("minimum deposit is $%.2f", float64(m.MinCents)/100))
	}
	ctx := r.Context()
	id := uuid.New()
	if _, err := s.Wallet.Pool.Exec(ctx, `INSERT INTO payments (id, player_id, direction, method, provider, amount, status) VALUES ($1,$2,'deposit',$3,$4,$5,'pending')`,
		id, pid, m.Code, m.Provider, amount); err != nil {
		return err
	}
	inv, err := s.npCreateInvoice(ctx, map[string]any{
		"price_amount":      float64(amount) / 100,
		"price_currency":    "usd",
		"order_id":          id.String(),
		"order_description": "A2Casino deposit",
		"ipn_callback_url":  s.Cfg.PublicURL + "/api/webhooks/nowpayments",
		"success_url":       s.Cfg.WebURL + "/wallet?deposit=processing",
		"cancel_url":        s.Cfg.WebURL + "/wallet?deposit=cancelled",
	})
	if err != nil {
		_, _ = s.Wallet.Pool.Exec(ctx, `UPDATE payments SET status='failed', meta=meta || $2, updated_at=now() WHERE id=$1`, id, map[string]any{"error": err.Error()})
		return httpx.Err(502, "gateway_unavailable", "the payment gateway is not available, try again later")
	}
	if _, err := s.Wallet.Pool.Exec(ctx, `UPDATE payments SET external_ref=$2, updated_at=now() WHERE id=$1`, id, inv.ID); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"type": "redirect", "payment_id": id, "url": inv.URL})
	return nil
}

type npInvoice struct {
	ID  string
	URL string
}

func (s *Service) npCreateInvoice(ctx context.Context, body map[string]any) (npInvoice, error) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(s.Cfg.NOWPaymentsBaseURL, "/")+"/v1/invoice", bytes.NewReader(b))
	req.Header.Set("x-api-key", s.Cfg.NOWPaymentsAPIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := npClient.Do(req)
	if err != nil {
		return npInvoice{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode/100 != 2 {
		return npInvoice{}, fmt.Errorf("nowpayments invoice: %d %s", resp.StatusCode, raw)
	}
	var out struct {
		ID         json.Number `json:"id"`
		InvoiceURL string      `json:"invoice_url"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.InvoiceURL == "" {
		return npInvoice{}, fmt.Errorf("nowpayments invoice: unexpected response %s", raw)
	}
	return npInvoice{ID: out.ID.String(), URL: out.InvoiceURL}, nil
}

// NPSignature is NOWPayments' IPN signature: HMAC-SHA512 over the body re-serialised
// with object keys sorted (Go's encoding/json sorts map keys) and no extra whitespace.
func NPSignature(secret string, body []byte) (string, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber() // keep numbers exactly as sent
	var v any
	if err := dec.Decode(&v); err != nil {
		return "", err
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return "", err
	}
	m := hmac.New(sha512.New, []byte(secret))
	m.Write(bytes.TrimRight(buf.Bytes(), "\n"))
	return hex.EncodeToString(m.Sum(nil)), nil
}

type npIPN struct {
	PaymentID     json.Number `json:"payment_id"`
	InvoiceID     json.Number `json:"invoice_id"`
	PaymentStatus string      `json:"payment_status"`
	OrderID       string      `json:"order_id"`
	PriceAmount   json.Number `json:"price_amount"`
	ActuallyPaid  json.Number `json:"actually_paid"`
	PayCurrency   string      `json:"pay_currency"`
	PayAddress    string      `json:"pay_address"`
}

// NOWPaymentsIPN receives payment status updates. Only "finished" credits the balance;
// a partial payment is left for staff to review.
func (s *Service) NOWPaymentsIPN(w http.ResponseWriter, r *http.Request) error {
	if s.Cfg.NOWPaymentsIPNKey == "" {
		return httpx.Err(404, "not_found", "not configured")
	}
	body, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 1<<16))
	if err != nil {
		return httpx.Err(400, "bad_body", "cannot read body")
	}
	want, err := NPSignature(s.Cfg.NOWPaymentsIPNKey, body)
	if err != nil {
		return httpx.Err(400, "bad_json", "invalid JSON")
	}
	if !hmac.Equal([]byte(strings.ToLower(r.Header.Get("x-nowpayments-sig"))), []byte(want)) {
		return httpx.Err(401, "bad_signature", "invalid signature")
	}
	var ipn npIPN
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	if err := dec.Decode(&ipn); err != nil {
		return httpx.Err(400, "bad_json", "invalid JSON")
	}
	id, err := uuid.Parse(ipn.OrderID)
	if err != nil {
		return httpx.Err(400, "bad_order", "unknown order_id")
	}
	meta := map[string]any{"np_payment_id": ipn.PaymentID.String(), "np_status": ipn.PaymentStatus, "pay_currency": ipn.PayCurrency,
		"actually_paid": ipn.ActuallyPaid.String(), "pay_address": ipn.PayAddress}
	ctx := r.Context()
	err = s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		var amount int64
		var status string
		err := tx.QueryRow(ctx, `SELECT player_id, amount, status FROM payments WHERE id=$1 AND direction='deposit' AND provider='nowpayments' FOR UPDATE`, id).Scan(&pid, &amount, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "not_found", "unknown payment")
		}
		if err != nil {
			return err
		}
		if status == "completed" || status == "failed" {
			return nil // final already; IPNs are retried and may arrive out of order
		}
		next := status
		switch ipn.PaymentStatus {
		case "waiting", "confirming", "confirmed", "sending":
			next = "confirming"
		case "partially_paid":
			next = "partially_paid"
		case "failed", "expired", "refunded":
			next = "failed"
		case "finished":
			if _, err := s.Wallet.Deposit(ctx, tx, pid, amount, wallet.HouseCryptoClearing, "np:"+id.String(), map[string]any{"payment_id": id, "method": "nowpayments", "pay_currency": ipn.PayCurrency}); err != nil {
				return err
			}
			if err := s.Promo.OnDeposit(ctx, tx, pid, amount); err != nil {
				return err
			}
			next = "completed"
		}
		paid := ""
		if a := ipn.ActuallyPaid.String(); a != "" {
			paid = a + " " + strings.ToUpper(ipn.PayCurrency)
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status=$2, crypto_amount=NULLIF($3,''), address=COALESCE(NULLIF($4,''), address), meta=meta || $5, updated_at=now() WHERE id=$1`,
			id, next, paid, ipn.PayAddress, meta)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}
