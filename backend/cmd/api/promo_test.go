package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/backoffice"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// Bonuses, wagering, promo codes, free spins, VIP and the lobby/back-office catalog endpoints.
func TestPromoFlow(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	cfg := config.Load()
	w := wallet.New(pool)
	if err := backoffice.SeedAdmin(ctx, w, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(Router(cfg, w, auth.NewIssuer(cfg.JWTSecret)))
	defer srv.Close()

	call := func(path, token string, body any) (int, map[string]any) {
		var req *http.Request
		if body == nil {
			req, _ = http.NewRequest(http.MethodGet, srv.URL+path, nil)
		} else {
			b, _ := json.Marshal(body)
			req, _ = http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(b))
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var out map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&out)
		return resp.StatusCode, out
	}
	must := func(want int, path, token string, body any) map[string]any {
		t.Helper()
		code, out := call(path, token, body)
		if code != want {
			t.Fatalf("%s: %d %v, want %d", path, code, out, want)
		}
		return out
	}
	bal := func(token string) (real, bonus float64) {
		me := must(200, "/api/me", token, nil)["balance"].(map[string]any)
		return me["real"].(float64), me["bonus"].(float64)
	}
	register := func() (string, uuid.UUID) {
		out := must(201, "/api/auth/register", "", map[string]any{"email": uuid.NewString() + "@t.io", "password": "secret123", "country": "CL", "birth_date": "1990-05-05"})
		return out["token"].(string), uuid.MustParse(out["player_id"].(string))
	}
	deposit := func(token string, amount int) {
		dep := must(200, "/api/payments/deposit", token, map[string]any{"method": "card_mock", "amount": amount})
		b, _ := json.Marshal(map[string]any{"payment_id": dep["payment_id"], "status": "success", "psp_ref": "r-" + dep["payment_id"].(string)})
		req, _ := http.NewRequest(http.MethodPost, srv.URL+"/api/webhooks/mockpsp", bytes.NewReader(b))
		req.Header.Set("X-Signature", games.Sign(cfg.PSPWebhookSecret, b))
		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp.StatusCode != 200 {
			t.Fatalf("psp webhook: %v %v", err, resp)
		}
		resp.Body.Close()
	}
	bonuses := func(token string) []any { return must(200, "/api/bonuses", token, nil)["bonuses"].([]any) }

	// 1. Welcome bonus waits for the first deposit, then matches it 100%.
	tok, pid := register()
	list := bonuses(tok)
	if len(list) != 1 || list[0].(map[string]any)["status"] != "pending" {
		t.Fatalf("welcome bonus: %v", list)
	}
	deposit(tok, 2000)
	if r, b := bal(tok); r != 2000 || b != 2000 {
		t.Fatalf("after deposit real=%v bonus=%v, want 2000/2000", r, b)
	}
	active := bonuses(tok)[0].(map[string]any)
	if active["status"] != "active" || active["wager_required"].(float64) != 2000*35 {
		t.Fatalf("active bonus: %v", active)
	}
	// One active bonus at a time; withdrawals wait for it.
	if code, out := call("/api/promo/redeem", tok, map[string]any{"code": "welcome5"}); code != 409 || out["code"] != "bonus_active" {
		t.Fatalf("second bonus: %d %v", code, out)
	}
	if _, err := pool.Exec(ctx, `UPDATE players SET verification='verified' WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if code, out := call("/api/payments/withdraw", tok, map[string]any{"method": "card_mock", "amount": 1000}); code != 409 || out["code"] != "bonus_active" {
		t.Fatalf("withdraw with active bonus: %d %v", code, out)
	}
	// 2. Wagering: once the requirement is met the bonus balance becomes real money.
	// Dice counts 10%: a $1 bet adds $0.10 of wagering.
	if _, err := pool.Exec(ctx, `UPDATE player_bonuses SET wager_required=10 WHERE player_id=$1 AND status='active'`, pid); err != nil {
		t.Fatal(err)
	}
	must(200, "/api/originals/dice/bet", tok, map[string]any{"amount": 100, "target": 50})
	if s := bonuses(tok)[0].(map[string]any)["status"]; s != "completed" {
		t.Fatalf("bonus after wagering: %v", s)
	}
	if r, b := bal(tok); b != 0 || r < 3900 {
		t.Fatalf("after release real=%v bonus=%v", r, b)
	}

	// 3. Promo codes: no-deposit bonus, single use per player, cancel forfeits it.
	tok2, pid2 := register()
	must(200, "/api/promo/redeem", tok2, map[string]any{"code": "welcome5"})
	if _, b := bal(tok2); b != 500 {
		t.Fatalf("no-deposit bonus = %v, want 500", b)
	}
	var pbID float64
	for _, x := range bonuses(tok2) {
		if m := x.(map[string]any); m["status"] == "active" {
			pbID = m["id"].(float64)
		}
	}
	must(200, fmt.Sprintf("/api/bonuses/%d/cancel", int64(pbID)), tok2, map[string]any{})
	if _, b := bal(tok2); b != 0 {
		t.Fatalf("after cancel bonus = %v", b)
	}
	if code, out := call("/api/promo/redeem", tok2, map[string]any{"code": "WELCOME5"}); code != 409 || out["code"] != "already_used" {
		t.Fatalf("code reuse: %d %v", code, out)
	}
	if code, _ := call("/api/promo/redeem", tok2, map[string]any{"code": "NOPE"}); code != 404 {
		t.Fatalf("unknown code: %d", code)
	}

	// 4. Free spins: 50 server-side spins, wins go to the bonus balance.
	must(200, "/api/promo/redeem", tok2, map[string]any{"code": "SPINS50"})
	var fs map[string]any
	for _, x := range bonuses(tok2) {
		if m := x.(map[string]any); m["status"] == "active" {
			fs = m
		}
	}
	var won float64
	for i := 0; i < 50; i++ {
		out := must(200, fmt.Sprintf("/api/bonuses/%d/freespin", int64(fs["id"].(float64))), tok2, map[string]any{})
		won = out["total_won"].(float64)
		if (i == 49) != out["finished"].(bool) {
			t.Fatalf("spin %d finished=%v", i, out["finished"])
		}
	}
	if code, _ := call(fmt.Sprintf("/api/bonuses/%d/freespin", int64(fs["id"].(float64))), tok2, map[string]any{}); code != 409 {
		t.Fatalf("51st spin: %d", code)
	}
	if _, b := bal(tok2); b != won {
		t.Fatalf("bonus balance %v != free spin wins %v", b, won)
	}

	// 5. VIP: rakeback accrues on real-money bets at level 2+, cashback needs a net loss.
	if _, err := pool.Exec(ctx, `UPDATE players SET vip_level=2 WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	must(200, "/api/originals/dice/bet", tok, map[string]any{"amount": 1000, "target": 50})
	var accrued float64
	_ = pool.QueryRow(ctx, `SELECT rakeback_accrued::float8 FROM players WHERE id=$1`, pid).Scan(&accrued)
	if accrued < 0.5-1e-9 || accrued > 0.5+1e-9 {
		t.Fatalf("rakeback accrued %v, want 0.5 cents (0.05%% of $10)", accrued)
	}
	if _, err := pool.Exec(ctx, `UPDATE players SET rakeback_accrued=150.5 WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	r0, _ := bal(tok)
	if out := must(200, "/api/vip/claim-rakeback", tok, map[string]any{}); out["amount"].(float64) != 150 {
		t.Fatalf("rakeback claim: %v", out)
	}
	if r1, _ := bal(tok); r1 != r0+150 {
		t.Fatalf("real after rakeback %v, want %v", r1, r0+150)
	}
	vip := must(200, "/api/vip", tok, nil)
	if len(vip["levels"].([]any)) != 5 || vip["status"].(map[string]any)["level"].(float64) != 2 {
		t.Fatalf("vip: %v", vip)
	}
	must(200, "/api/profile", tok, nil)
	must(200, "/api/rounds", tok, nil)

	// 6. Lobby and back office catalog management.
	lobby := must(200, "/api/lobby", tok, nil)
	if len(lobby["banners"].([]any)) < 3 || len(lobby["categories"].([]any)) < 4 || len(lobby["providers"].([]any)) < 4 || len(lobby["popular"].([]any)) == 0 {
		t.Fatalf("lobby: %v", lobby)
	}
	if len(lobby["recent"].([]any)) == 0 {
		t.Fatalf("recently played is empty for a player who played dice")
	}
	staff := must(200, "/api/bo/login", "", map[string]any{"email": cfg.AdminEmail, "password": cfg.AdminPassword})["token"].(string)
	gamesBO := must(200, "/api/bo/games?q=fruit", staff, nil)["games"].([]any)
	gid := int64(gamesBO[0].(map[string]any)["id"].(float64))
	must(200, fmt.Sprintf("/api/bo/games/%d", gid), staff, map[string]any{"status": "hidden", "comment": "test"})
	if n := len(must(200, "/api/games?q=fruit", "", nil)["games"].([]any)); n != 0 {
		t.Fatalf("hidden game still listed")
	}
	must(200, fmt.Sprintf("/api/bo/games/%d", gid), staff, map[string]any{"status": "live", "comment": "test"})

	code := "T" + uuid.NewString()[:8]
	must(201, "/api/bo/promocodes", staff, map[string]any{"code": code, "bonus_id": 2, "max_uses": 1})
	tok3, _ := register()
	must(200, "/api/promo/redeem", tok3, map[string]any{"code": code})
	if c, out := call("/api/promo/redeem", tok2, map[string]any{"code": code}); c != 410 {
		t.Fatalf("exhausted code: %d %v", c, out)
	}
	must(200, "/api/bo/players/"+pid2.String()+"/bonuses", staff, nil)
	for _, p := range []string{"/api/bo/bonuses", "/api/bo/promocodes", "/api/bo/vip", "/api/bo/banners", "/api/bo/providers", "/api/bo/audit", "/api/bo/players/" + pid.String()} {
		must(200, p, staff, nil)
	}
}
