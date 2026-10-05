package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/backoffice"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// apiHarness is a test server on TEST_DATABASE_URL with JSON helpers.
type apiHarness struct {
	t    *testing.T
	ctx  context.Context
	pool *pgxpool.Pool
	cfg  config.Config
	srv  *httptest.Server
}

func newAPIHarness(t *testing.T) *apiHarness {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	cfg := config.Load()
	w := wallet.New(pool)
	if err := backoffice.SeedAdmin(ctx, w, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(Router(cfg, w, auth.NewIssuer(cfg.JWTSecret)))
	t.Cleanup(srv.Close)
	return &apiHarness{t: t, ctx: ctx, pool: pool, cfg: cfg, srv: srv}
}

func (h *apiHarness) call(path, token string, body any) (int, map[string]any) {
	var req *http.Request
	if body == nil {
		req, _ = http.NewRequest(http.MethodGet, h.srv.URL+path, nil)
	} else {
		b, _ := json.Marshal(body)
		req, _ = http.NewRequest(http.MethodPost, h.srv.URL+path, bytes.NewReader(b))
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (h *apiHarness) must(want int, path, token string, body any) map[string]any {
	h.t.Helper()
	code, out := h.call(path, token, body)
	if code != want {
		h.t.Fatalf("%s: %d %v, want %d", path, code, out, want)
	}
	return out
}

// fail expects an error status and code.
func (h *apiHarness) fail(want int, wantCode, path, token string, body any) map[string]any {
	h.t.Helper()
	code, out := h.call(path, token, body)
	if code != want || out["code"] != wantCode {
		h.t.Fatalf("%s: %d %v, want %d %s", path, code, out, want, wantCode)
	}
	return out
}

func (h *apiHarness) signed(path, secret string, body any) (int, map[string]any) {
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, h.srv.URL+path, bytes.NewReader(b))
	req.Header.Set("X-Signature", games.Sign(secret, b))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (h *apiHarness) register() (string, uuid.UUID, string) {
	email := uuid.NewString() + "@t.io"
	out := h.must(201, "/api/auth/register", "", map[string]any{"email": email, "password": "secret123", "country": "CL", "birth_date": "1990-05-05"})
	return out["token"].(string), uuid.MustParse(out["player_id"].(string)), email
}

// deposit pays a card deposit through the mock PSP webhook.
func (h *apiHarness) deposit(token string, amount int) {
	h.t.Helper()
	dep := h.must(200, "/api/payments/deposit", token, map[string]any{"method": "card_mock", "amount": amount})
	if code, out := h.signed("/api/webhooks/mockpsp", h.cfg.PSPWebhookSecret, map[string]any{"payment_id": dep["payment_id"], "status": "success", "psp_ref": "r-" + dep["payment_id"].(string)}); code != 200 {
		h.t.Fatalf("psp webhook: %d %v", code, out)
	}
}

func (h *apiHarness) exec(sql string, args ...any) {
	h.t.Helper()
	if _, err := h.pool.Exec(h.ctx, sql, args...); err != nil {
		h.t.Fatal(err)
	}
}

func (h *apiHarness) staff() string {
	return h.must(200, "/api/bo/login", "", map[string]any{"email": h.cfg.AdminEmail, "password": h.cfg.AdminPassword})["token"].(string)
}

func findLimit(st map[string]any, kind, period string) map[string]any {
	for _, x := range st["limits"].([]any) {
		if m := x.(map[string]any); m["kind"] == kind && m["period"] == period {
			return m
		}
	}
	return nil
}

// Responsible gaming: limits with cooling-off, enforcement on deposits and bets, reality check,
// time-out and self-exclusion, marketing suppression and the back-office tools.
func TestResponsibleGaming(t *testing.T) {
	h := newAPIHarness(t)
	staff := h.staff()

	// 1. Deposit limit: applies at once; unfinished deposits from the last hour count too.
	tok, pid, email := h.register()
	if out := h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "deposit", "period": "day", "amount": 15000}); out["applied"] != true {
		t.Fatalf("new limit not applied at once: %v", out)
	}
	h.deposit(tok, 10000)
	h.must(200, "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 4000}) // left pending
	out := h.fail(403, "deposit_limit", "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 2000})
	if !strings.Contains(out["message"].(string), "$10.00 left") {
		t.Fatalf("limit message: %v", out["message"])
	}
	// Raising waits 24 hours; the old limit stays in force meanwhile.
	if out := h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "deposit", "period": "day", "amount": 50000}); out["applied"] != false || out["effective_at"] == nil {
		t.Fatalf("raise applied at once: %v", out)
	}
	h.fail(403, "deposit_limit", "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 2000})
	l := findLimit(h.must(200, "/api/rg", tok, nil), "deposit", "day")
	if l["amount"].(float64) != 15000 || l["pending"] != true || l["pending_amount"].(float64) != 50000 || l["used"].(float64) != 14000 {
		t.Fatalf("pending raise: %v", l)
	}
	h.exec(`UPDATE rg_limits SET effective_at=now()-interval '1 second' WHERE player_id=$1`, pid)
	if l := findLimit(h.must(200, "/api/rg", tok, nil), "deposit", "day"); l["amount"].(float64) != 50000 || l["pending"] != false {
		t.Fatalf("raise after cooling-off: %v", l)
	}
	h.must(200, "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 2000})
	// Lowering cancels a pending raise and applies at once; crypto (amount unknown) is refused once the limit is used up.
	h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "deposit", "period": "week", "amount": 90000})
	h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "deposit", "period": "day", "amount": 16000})
	h.fail(403, "deposit_limit", "/api/payments/deposit", tok, map[string]any{"method": "usdt_trc20"})
	h.fail(400, "bad_period", "/api/rg/limits", tok, map[string]any{"kind": "session", "period": "week", "amount": 60})
	h.fail(400, "bad_amount", "/api/rg/limits", tok, map[string]any{"kind": "loss", "period": "day", "amount": -5})

	// 2. Loss and wager limits on provider bets; a retried bet is not refused.
	// The deposits above activated the welcome bonus; drop it so its $5 max bet doesn't apply here.
	h.exec(`UPDATE player_bonuses SET status='cancelled' WHERE player_id=$1`, pid)
	h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "loss", "period": "day", "amount": 1000})
	launch := h.must(200, "/api/games/mock-fruit-slot/launch", tok, map[string]any{})
	sess := launch["url"].(string)[len(h.cfg.PublicURL+"/mockprovider/game?token="):]
	u := uuid.NewString()[:8] + "-"
	bet := func(n string, amount int) (int, map[string]any) {
		return h.signed("/api/provider/mock/bet", h.cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r" + n, "tx_id": u + "t" + n, "amount": amount})
	}
	if code, out := bet("1", 600); code != 200 {
		t.Fatalf("bet 1: %d %v", code, out)
	}
	if code, out := bet("2", 500); code != 403 || out["code"] != "loss_limit" {
		t.Fatalf("bet over loss limit: %d %v", code, out)
	}
	if code, out := bet("1", 600); code != 200 { // provider retry of the accepted bet
		t.Fatalf("retried bet: %d %v", code, out)
	}
	h.signed("/api/provider/mock/win", h.cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r1", "tx_id": u + "w1", "amount": 300})
	if code, out := bet("3", 500); code != 200 { // wins offset losses: net loss 300 + 500 <= 1000
		t.Fatalf("bet after a win: %d %v", code, out)
	}
	h.must(200, "/api/rg/limits", tok, map[string]any{"kind": "wager", "period": "week", "amount": 1200})
	if code, out := bet("4", 200); code != 403 || out["code"] != "wager_limit" {
		t.Fatalf("bet over wager limit: %d %v", code, out)
	}
	h.fail(403, "wager_limit", "/api/originals/dice/bet", tok, map[string]any{"amount": 150, "target": 50})

	// 3. Reality check and session summary.
	h.must(200, "/api/rg/reality-check", tok, map[string]any{"minutes": 30})
	s := h.must(200, "/api/rg/session", tok, map[string]any{})
	if s["reality_check_minutes"].(float64) != 30 || s["bets"].(float64) != 2 || s["net"].(float64) != -800 {
		t.Fatalf("session: %v", s)
	}
	// Daily play-time limit.
	tok2, pid2, _ := h.register()
	h.deposit(tok2, 5000)
	h.must(200, "/api/rg/limits", tok2, map[string]any{"kind": "session", "period": "day", "amount": 5})
	h.must(200, "/api/originals/dice/bet", tok2, map[string]any{"amount": 100, "target": 50})
	h.exec(`UPDATE rg_sessions SET started_at=now()-interval '6 minutes' WHERE player_id=$1`, pid2)
	h.fail(403, "session_limit", "/api/originals/dice/bet", tok2, map[string]any{"amount": 100, "target": 50})
	h.fail(403, "session_limit", "/api/games/dice/launch", tok2, map[string]any{})

	// 4. Time-out: login, balance and withdrawals work; deposits, bets, games and bonuses do not.
	tok3, pid3, email3 := h.register()
	h.deposit(tok3, 5000)
	h.exec(`UPDATE players SET verification='verified' WHERE id=$1`, pid3)
	h.exec(`UPDATE player_bonuses SET status='cancelled' WHERE player_id=$1 AND status='active'`, pid3)
	h.must(200, "/api/rg/exclude", tok3, map[string]any{"duration": "24h"})
	h.fail(403, "timeout", "/api/payments/deposit", tok3, map[string]any{"method": "card_mock", "amount": 2000})
	h.fail(403, "timeout", "/api/originals/dice/bet", tok3, map[string]any{"amount": 100, "target": 50})
	h.fail(403, "timeout", "/api/games/mock-fruit-slot/launch", tok3, map[string]any{})
	h.fail(403, "timeout", "/api/promo/redeem", tok3, map[string]any{"code": "WELCOME5"})
	tok3 = h.must(200, "/api/auth/login", "", map[string]any{"email": email3, "password": "secret123"})["token"].(string)
	if me := h.must(200, "/api/me", tok3, nil); me["exclusion"].(map[string]any)["kind"] != "timeout" {
		t.Fatalf("me: %v", me)
	}
	h.must(201, "/api/payments/withdraw", tok3, map[string]any{"method": "card_mock", "amount": 1000})
	// Staff cannot give bonuses to an excluded player either.
	h.fail(403, "timeout", "/api/bo/players/"+pid3.String()+"/bonuses", staff, map[string]any{"bonus_id": 2, "comment": "test"})

	// 5. Self-exclusion replaces the time-out, cannot be shortened or ended early, reopens 24 h after a request.
	h.must(200, "/api/rg/exclude", tok3, map[string]any{"duration": "6m"})
	h.fail(409, "exclusion_active", "/api/rg/exclude", tok3, map[string]any{"duration": "6w"})
	h.fail(409, "exclusion_active", "/api/bo/players/"+pid3.String()+"/rg/exclude", staff, map[string]any{"duration": "30d", "comment": "shorter"})
	h.fail(409, "exclusion_not_over", "/api/rg/reopen", tok3, map[string]any{})
	h.fail(403, "self_excluded", "/api/originals/dice/bet", tok3, map[string]any{"amount": 100, "target": 50})
	h.exec(`UPDATE rg_exclusions SET ends_at=now()-interval '1 minute' WHERE player_id=$1 AND status='active'`, pid3)
	out = h.fail(403, "self_excluded", "/api/originals/dice/bet", tok3, map[string]any{"amount": 100, "target": 50})
	if !strings.Contains(out["message"].(string), "ask for it") {
		t.Fatalf("ended self-exclusion message: %v", out["message"])
	}
	if e := h.must(200, "/api/rg/reopen", tok3, map[string]any{})["exclusion"].(map[string]any); e["reopen_at"] == nil {
		t.Fatalf("reopen: %v", e)
	}
	h.fail(403, "self_excluded", "/api/originals/dice/bet", tok3, map[string]any{"amount": 100, "target": 50})
	h.exec(`UPDATE rg_exclusions SET reopen_requested_at=now()-interval '25 hours' WHERE player_id=$1 AND status='active'`, pid3)
	h.must(200, "/api/originals/dice/bet", tok3, map[string]any{"amount": 100, "target": 50})
	if st := h.must(200, "/api/rg", tok3, nil); st["exclusion"] != nil {
		t.Fatalf("exclusion after reopening: %v", st["exclusion"])
	}

	// 6. Marketing suppression: a pending welcome bonus is cancelled and a deposit activates nothing.
	tok4, pid4, _ := h.register()
	h.must(200, "/api/bo/players/"+pid4.String()+"/rg/exclude", staff, map[string]any{"duration": "permanent", "comment": "player asked by phone"})
	for _, x := range h.must(200, "/api/bonuses", tok4, nil)["bonuses"].([]any) {
		if st := x.(map[string]any)["status"]; st == "pending" || st == "active" {
			t.Fatalf("bonus still %v after exclusion", st)
		}
	}
	h.fail(403, "self_excluded", "/api/bonuses/offers/4/claim", tok4, map[string]any{})
	h.fail(409, "exclusion_active", "/api/rg/exclude", tok4, map[string]any{"duration": "5y"})

	// 7. Back office: stricter limits only, list filter, history and audit.
	p := "/api/bo/players/" + pid.String()
	h.must(200, p+"/rg/limits", staff, map[string]any{"kind": "loss", "period": "week", "amount": 2000, "comment": "affordability"})
	h.fail(403, "not_stricter", p+"/rg/limits", staff, map[string]any{"kind": "loss", "period": "week", "amount": 5000, "comment": "x"})
	h.fail(403, "not_stricter", p+"/rg/limits", staff, map[string]any{"kind": "loss", "period": "week", "amount": nil, "comment": "x"})
	h.fail(400, "comment_required", p+"/rg/limits", staff, map[string]any{"kind": "loss", "period": "week", "amount": 100})
	card := h.must(200, p+"/rg", staff, nil)
	if findLimit(card, "loss", "week")["amount"].(float64) != 2000 || len(card["history"].([]any)) < 5 {
		t.Fatalf("bo rg: %v", card)
	}
	list := h.must(200, "/api/bo/players?rg=self_excluded&limit=200", staff, nil)["items"].([]any)
	found := map[string]bool{}
	for _, x := range list {
		m := x.(map[string]any)
		found[m["id"].(string)] = true
		if m["rg_exclusion"] != "self_exclusion" {
			t.Fatalf("filter returned %v", m)
		}
	}
	if !found[pid4.String()] || found[pid.String()] || found[pid3.String()] {
		t.Fatalf("self-excluded filter: %v", list)
	}
	if n := len(h.must(200, "/api/bo/players?q="+email, staff, nil)["items"].([]any)); n != 1 {
		t.Fatalf("search still works: %d", n)
	}
	audit := h.must(200, p+"/audit", staff, nil)["items"].([]any)
	if audit[0].(map[string]any)["action"] != "rg_limit" {
		t.Fatalf("audit: %v", audit[0])
	}
}
