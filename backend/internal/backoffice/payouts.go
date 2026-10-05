package backoffice

// Manual crypto payouts: marking an approved withdrawal paid with its transaction hash,
// and paying out the balance of a blocked or self-excluded account.

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/payments"
)

// MarkPaid records that staff sent an approved withdrawal: {tx_hash, crypto_amount?, comment?}.
func (s *Service) MarkPaid(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.Err(400, "bad_id", "bad withdrawal id")
	}
	var req struct {
		TxHash       string `json:"tx_hash"`
		CryptoAmount string `json:"crypto_amount"`
		Comment      string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	staff := auth.From(r.Context()).Subject
	hash, err := s.Payments.MarkPaid(r.Context(), id, staff, req.TxHash, req.CryptoAmount)
	if err != nil {
		return err
	}
	var pid uuid.UUID
	var amount int64
	var network, sent *string
	_ = s.Wallet.Pool.QueryRow(r.Context(), `SELECT player_id, amount, network, crypto_amount FROM payments WHERE id=$1`, id).Scan(&pid, &amount, &network, &sent)
	url := ""
	if network != nil {
		url = payments.ExplorerURL(*network, hash)
	}
	_ = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		return audit(r.Context(), tx, staff, pid, "withdrawal_paid", nil,
			map[string]any{"payment_id": id, "amount": amount, "tx_hash": hash, "crypto_amount": sent, "network": network}, strings.TrimSpace(req.Comment))
	})
	httpx.JSON(w, 200, map[string]any{"ok": true, "tx_hash": hash, "tx_url": url})
	return nil
}

// PlayerPayout creates a withdrawal of a blocked or self-excluded player's real balance to an
// address staff enter: {method, address, amount? (cents, 0 or missing = whole real balance), comment}.
func (s *Service) PlayerPayout(w http.ResponseWriter, r *http.Request) error {
	pid, err := playerID(r)
	if err != nil {
		return err
	}
	var req struct {
		Method  string `json:"method"`
		Address string `json:"address"`
		Amount  int64  `json:"amount"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	id, screen, err := s.Payments.StaffPayout(r.Context(), staff, pid, req.Method, req.Amount, req.Address)
	if err != nil {
		return err
	}
	var amount int64
	_ = s.Wallet.Pool.QueryRow(r.Context(), `SELECT amount FROM payments WHERE id=$1`, id).Scan(&amount)
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		return audit(r.Context(), tx, staff, pid, "balance_payout", nil,
			map[string]any{"payment_id": id, "amount": amount, "method": req.Method, "address": strings.TrimSpace(req.Address), "risk": screen.Risk}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"payment_id": id, "status": "pending", "amount": amount, "risk": screen.Risk, "risk_reasons": screen.Reasons})
	return nil
}

// PayoutMethods lists the crypto methods staff can pay out with.
func (s *Service) PayoutMethods(w http.ResponseWriter, r *http.Request) error {
	httpx.JSON(w, 200, map[string]any{"methods": payments.PayoutMethods})
	return nil
}
