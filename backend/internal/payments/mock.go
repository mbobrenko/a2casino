package payments

// Mock connectors: a hosted checkout page for the fiat PSP and a simulator for
// incoming crypto transactions. Enabled only when DEV_TOOLS=true.

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"html/template"
	"net/http"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

var checkoutPage = template.Must(template.New("c").Parse(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Test PSP checkout</title>
<style>body{font-family:system-ui;background:#f4f4f7;display:flex;justify-content:center;padding-top:10vh}
.card{background:#fff;padding:28px 32px;border-radius:12px;box-shadow:0 2px 12px #0001;min-width:300px}
button{font-size:16px;padding:10px 18px;border-radius:8px;border:0;margin-right:8px;cursor:pointer}
.ok{background:#16a34a;color:#fff}.no{background:#e5e7eb}</style></head><body><div class="card">
<h2>Test PSP</h2><p>Payment {{.ID}}</p><p><b>Amount: ${{.Amount}}</b></p>
<form method="post" action="/mockpsp/complete"><input type="hidden" name="id" value="{{.ID}}">
<button class="ok" name="result" value="success">Pay</button><button class="no" name="result" value="failed">Decline</button></form>
</div></body></html>`))

func (s *Service) MockCheckout(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(r.URL.Query().Get("id"))
	if err != nil {
		return httpx.Err(400, "bad_id", "bad payment id")
	}
	var amount int64
	if err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT amount FROM payments WHERE id=$1 AND provider='mockpsp'`, id).Scan(&amount); err != nil {
		return httpx.Err(404, "not_found", "payment not found")
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	return checkoutPage.Execute(w, map[string]any{"ID": id, "Amount": fmt.Sprintf("%.2f", float64(amount)/100)})
}

// MockComplete is the PSP finishing the payment: it notifies the casino by webhook and redirects back.
func (s *Service) MockComplete(w http.ResponseWriter, r *http.Request) error {
	if err := r.ParseForm(); err != nil {
		return err
	}
	id, err := uuid.Parse(r.FormValue("id"))
	if err != nil {
		return httpx.Err(400, "bad_id", "bad payment id")
	}
	result := r.FormValue("result")
	if _, err := postSigned(s.Cfg.CallbackURL+"/api/webhooks/mockpsp", s.Cfg.PSPWebhookSecret,
		map[string]any{"payment_id": id, "status": result, "psp_ref": "psp-" + id.String()[:8]}); err != nil {
		return err
	}
	http.Redirect(w, r, s.Cfg.WebURL+"/wallet?deposit="+result, http.StatusSeeOther)
	return nil
}

type simulateReq struct {
	Method      string `json:"method"`
	AmountCents int64  `json:"amount_usd_cents"`
	Risk        string `json:"risk"`
}

// SimulateCrypto plays the processor's role: it reports a transaction to the
// player's address, first with 1 confirmation and then fully confirmed.
func (s *Service) SimulateCrypto(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req simulateReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	m, ok := s.methodBy(req.Method)
	if !ok || m.Kind != "crypto" {
		return httpx.Err(400, "unknown_method", "unknown crypto method")
	}
	if req.AmountCents < m.MinCents {
		return httpx.Err(400, "amount_too_small", fmt.Sprintf("minimum is $%.2f", float64(m.MinCents)/100))
	}
	addr := mockAddress(m.Network, pid)
	if _, err := s.Wallet.Pool.Exec(r.Context(), `INSERT INTO crypto_addresses (player_id, network, address) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, pid, m.Network, addr); err != nil {
		return err
	}
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	tx := hex.EncodeToString(b)
	risk := req.Risk
	if risk == "" {
		risk = "low"
	}
	payload := map[string]any{"network": m.Network, "address": addr, "tx_hash": tx, "amount_usd_cents": req.AmountCents,
		"crypto_amount": fmt.Sprintf("%.2f", float64(req.AmountCents)/100), "confirmations": 1, "risk": risk}
	url := s.Cfg.CallbackURL + "/api/webhooks/mockcrypto"
	first, err := postSigned(url, s.Cfg.CryptoWebhookSecret, payload)
	if err != nil {
		return err
	}
	payload["confirmations"] = s.Cfg.CryptoConfirmations
	final, err := postSigned(url, s.Cfg.CryptoWebhookSecret, payload)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"tx_hash": tx, "after_first_confirmation": first["status"], "final_status": final["status"]})
	return nil
}
