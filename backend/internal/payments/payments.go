// Package payments handles deposits and withdrawals through a connector per
// provider: mock connectors for development (a fiat PSP with a hosted checkout page
// and a crypto processor that notifies us by webhook), the NOWPayments gateway for
// deposits and manual crypto payouts for withdrawals (payouts.go).
package payments

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
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

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/promo"
	"github.com/mbobrenko/a2casino/backend/internal/rg"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

type Method struct {
	Code     string `json:"code"`
	Title    string `json:"title"`
	Kind     string `json:"kind"` // fiat | crypto | gateway (hosted page, deposits only)
	Provider string `json:"provider"`
	Network  string `json:"network,omitempty"`
	Coin     string `json:"coin,omitempty"`
	MinCents int64  `json:"min_cents"`
	Deposit  bool   `json:"deposit"`  // offered on the deposit tab
	Withdraw bool   `json:"withdraw"` // offered on the withdrawal tab
}

// Methods are the mock connectors, offered only with DEV_TOOLS. Crypto withdrawals go
// through the manual payout methods even in development, so dev and production match.
var Methods = []Method{
	{Code: "card_mock", Title: "Bank card (test PSP)", Kind: "fiat", Provider: "mockpsp", MinCents: 100, Deposit: true, Withdraw: true},
	{Code: "usdt_trc20", Title: "USDT · TRON (TRC-20)", Kind: "crypto", Provider: "mockcrypto", Network: "TRC20", Coin: "USDT", MinCents: 500, Deposit: true},
	{Code: "usdt_erc20", Title: "USDT · Ethereum (ERC-20)", Kind: "crypto", Provider: "mockcrypto", Network: "ERC20", Coin: "USDT", MinCents: 2000, Deposit: true},
	{Code: "btc", Title: "Bitcoin", Kind: "crypto", Provider: "mockcrypto", Network: "BTC", Coin: "BTC", MinCents: 1000, Deposit: true},
}

// methods is the list shown to players: the mock connectors in dev, real gateways whose
// keys are configured, and the manual crypto payouts (always available for withdrawals).
func (s *Service) methods() []Method {
	list := []Method{}
	if s.Cfg.DevTools {
		list = append(list, Methods...)
	}
	if s.Cfg.NOWPaymentsAPIKey != "" {
		list = append(list, nowPaymentsMethod)
	}
	return append(list, PayoutMethods...)
}

// methodBy finds a method for "deposit" or "withdraw" (one code can name both a mock
// deposit connector and a manual payout method).
func (s *Service) methodBy(code, direction string) (Method, bool) {
	for _, m := range s.methods() {
		if m.Code == code && ((direction == "deposit" && m.Deposit) || (direction == "withdraw" && m.Withdraw)) {
			return m, true
		}
	}
	return Method{}, false
}

type Service struct {
	Cfg    config.Config
	Wallet *wallet.Wallet
	Promo  *promo.Service
	AML    *aml.Service
}

func sign(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

func (s *Service) ListMethods(w http.ResponseWriter, r *http.Request) error {
	httpx.JSON(w, 200, map[string]any{"methods": s.methods()})
	return nil
}

type depositReq struct {
	Method string `json:"method"`
	Amount int64  `json:"amount"` // cents, fiat only
}

func (s *Service) Deposit(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req depositReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := rg.CheckDeposit(r.Context(), s.Wallet.Pool, pid, req.Amount); err != nil {
		return err
	}
	m, ok := s.methodBy(req.Method, "deposit")
	if !ok {
		return httpx.Err(400, "unknown_method", "unknown payment method")
	}
	ctx := r.Context()
	if m.Provider == "nowpayments" {
		return s.nowPaymentsDeposit(w, r, pid, m, req.Amount)
	}
	if m.Kind == "crypto" {
		// Crypto: each player has a permanent deposit address per network; the deposit
		// itself is created when the processor reports an incoming transaction.
		addr := mockAddress(m.Network, pid)
		if _, err := s.Wallet.Pool.Exec(ctx, `INSERT INTO crypto_addresses (player_id, network, address) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, pid, m.Network, addr); err != nil {
			return err
		}
		httpx.JSON(w, 200, map[string]any{"type": "address", "network": m.Network, "address": addr, "min_cents": m.MinCents,
			"note": "Send only " + m.Title + " to this address. The balance is credited in USD at the rate on arrival."})
		return nil
	}
	if req.Amount < m.MinCents {
		return httpx.Err(400, "amount_too_small", fmt.Sprintf("minimum deposit is $%.2f", float64(m.MinCents)/100))
	}
	id := uuid.New()
	if _, err := s.Wallet.Pool.Exec(ctx, `INSERT INTO payments (id, player_id, direction, method, provider, amount, status) VALUES ($1,$2,'deposit',$3,$4,$5,'pending')`,
		id, pid, m.Code, m.Provider, req.Amount); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"type": "redirect", "payment_id": id, "url": s.Cfg.PublicURL + "/mockpsp/checkout?id=" + id.String()})
	return nil
}

func mockAddress(network string, pid uuid.UUID) string {
	h := sha256.Sum256([]byte(network + pid.String()))
	x := hex.EncodeToString(h[:])
	switch network {
	case "TRC20":
		return "T" + strings.ToUpper(x[:33])
	case "ERC20":
		return "0x" + x[:40]
	default:
		return "bc1q" + x[:38]
	}
}

type withdrawReq struct {
	Method  string `json:"method"`
	Amount  int64  `json:"amount"`
	Address string `json:"address"`
}

func (s *Service) Withdraw(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req withdrawReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	m, ok := s.methodBy(req.Method, "withdraw")
	if !ok {
		if _, dep := s.methodBy(req.Method, "deposit"); dep {
			return httpx.Err(400, "deposit_only", "this method is for deposits only")
		}
		return httpx.Err(400, "unknown_method", "unknown payment method")
	}
	if req.Amount < MinWithdrawal {
		return httpx.Err(400, "amount_too_small", fmt.Sprintf("minimum withdrawal is $%.2f", float64(MinWithdrawal)/100))
	}
	addr := ""
	if m.Kind == "crypto" {
		if addr, ok = NormalizeAddress(m.Network, req.Address); !ok {
			return httpx.Err(400, "bad_address", "this is not a valid "+m.Title+" address")
		}
	}
	ctx := r.Context()
	id := uuid.New()
	// Screen the payout address first (refused with 403 address_blocked if sanctioned).
	screen := aml.Result{}
	if m.Kind == "crypto" {
		var err error
		if screen, err = s.screen(ctx, m, pid, id, addr); err != nil {
			return err
		}
	}
	err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var verification, status string
		var blocked bool
		if err := tx.QueryRow(ctx, `SELECT verification, status, withdrawals_blocked FROM players WHERE id=$1`, pid).Scan(&verification, &status, &blocked); err != nil {
			return err
		}
		if status != "active" || blocked {
			return httpx.Err(403, "withdrawals_blocked", "withdrawals are not available for this account")
		}
		if verification != "verified" {
			return httpx.Err(403, "kyc_required", "verify your identity before withdrawing")
		}
		if active, err := s.Promo.HasActive(ctx, tx, pid); err != nil {
			return err
		} else if active {
			return httpx.Err(409, "bonus_active", "finish wagering or cancel your active bonus before withdrawing")
		}
		return s.hold(ctx, tx, id, pid, m, req.Amount, addr, screen, nil)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"payment_id": id, "status": "pending"})
	return nil
}

type Payment struct {
	ID           uuid.UUID  `json:"id"`
	Direction    string     `json:"direction"`
	Method       string     `json:"method"`
	Amount       int64      `json:"amount"`
	Status       string     `json:"status"`
	Address      *string    `json:"address"`
	ExternalRef  *string    `json:"external_ref"`
	CryptoAmount *string    `json:"crypto_amount"`
	Network      *string    `json:"network"`
	PaidAt       *time.Time `json:"paid_at"`
	CreatedAt    time.Time  `json:"created_at"`
	TxURL        string     `json:"tx_url,omitempty" db:"-"` // block explorer link of a paid crypto withdrawal
}

const paymentCols = `id, direction, method, amount, status, address, external_ref, crypto_amount, network, paid_at, created_at`

func ListForPlayer(ctx context.Context, q interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, pid uuid.UUID, limit int) ([]Payment, error) {
	rows, err := q.Query(ctx, `SELECT `+paymentCols+` FROM payments WHERE player_id=$1 ORDER BY created_at DESC LIMIT $2`, pid, limit)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Payment])
	for i, p := range list {
		if p.Direction == "withdrawal" && p.Status == "completed" && p.Network != nil && p.ExternalRef != nil {
			list[i].TxURL = ExplorerURL(*p.Network, *p.ExternalRef)
		}
	}
	return list, err
}

func (s *Service) History(w http.ResponseWriter, r *http.Request) error {
	list, err := ListForPlayer(r.Context(), s.Wallet.Pool, auth.From(r.Context()).Subject, httpx.IntQuery(r, "limit", 50, 200))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

// ---- Webhooks (provider -> casino) ----

func (s *Service) readSigned(r *http.Request, secret string, v any) error {
	body, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 1<<16))
	if err != nil {
		return httpx.Err(400, "bad_body", "cannot read body")
	}
	if !hmac.Equal([]byte(r.Header.Get("X-Signature")), []byte(sign(secret, body))) {
		return httpx.Err(401, "bad_signature", "invalid signature")
	}
	if err := json.Unmarshal(body, v); err != nil {
		return httpx.Err(400, "bad_json", "invalid JSON")
	}
	return nil
}

type pspWebhook struct {
	PaymentID uuid.UUID `json:"payment_id"`
	Status    string    `json:"status"` // success | failed
	PSPRef    string    `json:"psp_ref"`
}

func (s *Service) PSPWebhook(w http.ResponseWriter, r *http.Request) error {
	var req pspWebhook
	if err := s.readSigned(r, s.Cfg.PSPWebhookSecret, &req); err != nil {
		return err
	}
	ctx := r.Context()
	err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		var amount int64
		var status string
		err := tx.QueryRow(ctx, `SELECT player_id, amount, status FROM payments WHERE id=$1 AND direction='deposit' AND provider='mockpsp' FOR UPDATE`, req.PaymentID).Scan(&pid, &amount, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "not_found", "unknown payment")
		}
		if err != nil {
			return err
		}
		if status != "pending" {
			return nil // already processed: webhooks are retried, so this must be idempotent
		}
		if req.Status != "success" {
			_, err := tx.Exec(ctx, `UPDATE payments SET status='failed', external_ref=$2, updated_at=now() WHERE id=$1`, req.PaymentID, req.PSPRef)
			return err
		}
		if _, err := s.Wallet.Deposit(ctx, tx, pid, amount, wallet.HousePSPClearing, "dep:"+req.PaymentID.String(), map[string]any{"payment_id": req.PaymentID, "method": "card_mock"}); err != nil {
			return err
		}
		if err := s.Promo.OnDeposit(ctx, tx, pid, amount); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status='completed', external_ref=$2, updated_at=now() WHERE id=$1`, req.PaymentID, req.PSPRef)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

type cryptoWebhook struct {
	Network       string `json:"network"`
	Address       string `json:"address"`
	TxHash        string `json:"tx_hash"`
	AmountCents   int64  `json:"amount_usd_cents"`
	CryptoAmount  string `json:"crypto_amount"`
	Confirmations int    `json:"confirmations"`
	Risk          string `json:"risk"` // processor's address screening: low | high
}

func (s *Service) CryptoWebhook(w http.ResponseWriter, r *http.Request) error {
	var req cryptoWebhook
	if err := s.readSigned(r, s.Cfg.CryptoWebhookSecret, &req); err != nil {
		return err
	}
	ctx := r.Context()
	var result string
	err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		err := tx.QueryRow(ctx, `SELECT player_id FROM crypto_addresses WHERE network=$1 AND address=$2`, req.Network, req.Address).Scan(&pid)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "unknown_address", "address is not ours")
		}
		if err != nil {
			return err
		}
		method := map[string]string{"TRC20": "usdt_trc20", "ERC20": "usdt_erc20", "BTC": "btc"}[req.Network]
		id := uuid.New()
		if _, err := tx.Exec(ctx, `INSERT INTO payments (id, player_id, direction, method, provider, amount, status, address, external_ref, crypto_amount, confirmations)
			VALUES ($1,$2,'deposit',$3,'mockcrypto',$4,'confirming',$5,$6,$7,$8) ON CONFLICT (provider, external_ref) WHERE external_ref IS NOT NULL DO NOTHING`,
			id, pid, method, req.AmountCents, req.Address, req.TxHash, req.CryptoAmount, req.Confirmations); err != nil {
			return err
		}
		var status string
		if err := tx.QueryRow(ctx, `SELECT id, status FROM payments WHERE provider='mockcrypto' AND external_ref=$1 FOR UPDATE`, req.TxHash).Scan(&id, &status); err != nil {
			return err
		}
		if status != "confirming" {
			result = status
			return nil
		}
		if req.Risk == "high" {
			// Dirty funds: freeze the deposit and flag the player for AML review.
			result = "frozen"
			if _, err := tx.Exec(ctx, `UPDATE payments SET status='frozen', confirmations=$2, updated_at=now() WHERE id=$1`, id, req.Confirmations); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `UPDATE players SET tags = array_append(array_remove(tags,'aml_review'),'aml_review'), withdrawals_blocked=true WHERE id=$1`, pid)
			return err
		}
		if req.Confirmations < s.Cfg.CryptoConfirmations {
			result = "confirming"
			_, err := tx.Exec(ctx, `UPDATE payments SET confirmations=$2, updated_at=now() WHERE id=$1`, id, req.Confirmations)
			return err
		}
		if _, err := s.Wallet.Deposit(ctx, tx, pid, req.AmountCents, wallet.HouseCryptoClearing, "crypto:"+req.TxHash, map[string]any{"payment_id": id, "method": method, "tx_hash": req.TxHash}); err != nil {
			return err
		}
		if err := s.Promo.OnDeposit(ctx, tx, pid, req.AmountCents); err != nil {
			return err
		}
		result = "completed"
		_, err = tx.Exec(ctx, `UPDATE payments SET status='completed', confirmations=$2, updated_at=now() WHERE id=$1`, id, req.Confirmations)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true, "status": result})
	return nil
}

// ---- Withdrawal processing (called from the back office) ----

// Approve accepts a pending withdrawal. A manual crypto payout becomes "approved" and waits
// for staff to send the coins and mark it paid (MarkPaid); the mock connectors pay out at once.
func (s *Service) Approve(ctx context.Context, paymentID, staffID uuid.UUID) error {
	return s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		var amount int64
		var status, provider string
		var address, network *string
		err := tx.QueryRow(ctx, `SELECT player_id, amount, status, provider, address, network FROM payments WHERE id=$1 AND direction='withdrawal' FOR UPDATE`, paymentID).
			Scan(&pid, &amount, &status, &provider, &address, &network)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "not_found", "withdrawal not found")
		}
		if err != nil {
			return err
		}
		if status != "pending" {
			return httpx.Err(409, "not_pending", "withdrawal is already "+status)
		}
		// Re-screen at payout time: lists change between the request and the approval.
		if address != nil {
			net := ""
			if network != nil {
				net = *network
			}
			res, err := s.AML.Screen(ctx, tx, net, *address, "approval", &pid, &paymentID)
			if err != nil {
				return err
			}
			if res.Risk == aml.Severe {
				return httpx.Err(409, "address_blocked", "this address is sanctioned or blacklisted: reject the withdrawal")
			}
		}
		if provider == "manual" {
			_, err := tx.Exec(ctx, `UPDATE payments SET status='approved', approved_by=$2, approved_at=now(), updated_at=now() WHERE id=$1`, paymentID, staffID)
			return err
		}
		clearing := wallet.HousePSPClearing
		ref := "psp-" + paymentID.String()[:8]
		if provider == "mockcrypto" {
			clearing = wallet.HouseCryptoClearing
			h := sha256.Sum256([]byte(paymentID.String()))
			ref = "0x" + hex.EncodeToString(h[:])
		}
		if _, err := s.Wallet.CompleteWithdrawal(ctx, tx, pid, amount, clearing, "wd:complete:"+paymentID.String(), map[string]any{"payment_id": paymentID}); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status='completed', approved_by=$2, approved_at=now(), external_ref=$3, updated_at=now() WHERE id=$1`, paymentID, staffID, ref)
		return err
	})
}

func (s *Service) Reject(ctx context.Context, paymentID, staffID uuid.UUID) error {
	return s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var pid uuid.UUID
		var amount int64
		var status string
		err := tx.QueryRow(ctx, `SELECT player_id, amount, status FROM payments WHERE id=$1 AND direction='withdrawal' FOR UPDATE`, paymentID).Scan(&pid, &amount, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "not_found", "withdrawal not found")
		}
		if err != nil {
			return err
		}
		// An approved manual payout can still be rejected until it is marked paid.
		if status != "pending" && status != "approved" {
			return httpx.Err(409, "not_pending", "withdrawal is already "+status)
		}
		if _, err := s.Wallet.ReleaseWithdrawal(ctx, tx, pid, amount, "wd:release:"+paymentID.String(), map[string]any{"payment_id": paymentID}); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE payments SET status='rejected', approved_by=$2, updated_at=now() WHERE id=$1`, paymentID, staffID)
		return err
	})
}

// postSigned sends a signed webhook to the casino, as the mock providers do.
func postSigned(url, secret string, payload any) (map[string]any, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", sign(secret, body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if resp.StatusCode != 200 {
		return out, fmt.Errorf("webhook returned %d: %v", resp.StatusCode, out)
	}
	return out, nil
}
