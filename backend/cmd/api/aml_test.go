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
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/backoffice"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// Withdrawal address screening: OFAC list, shared addresses, staff blacklist, re-check at approval.
func TestAMLScreening(t *testing.T) {
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
	if n, err := (&aml.Service{Pool: pool}).SyncOFAC(ctx, false); err != nil || n < 500 {
		t.Fatalf("ofac snapshot: %d %v", n, err)
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
	// A verified player with $100 of real money and no bonus.
	player := func() (string, uuid.UUID) {
		_, reg := call("/api/auth/register", "", map[string]any{"email": uuid.NewString() + "@t.io", "password": "secret123", "country": "MX", "birth_date": "1990-05-05"})
		pid := uuid.MustParse(reg["player_id"].(string))
		if _, err := pool.Exec(ctx, `UPDATE players SET verification='verified' WHERE id=$1`, pid); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `UPDATE player_bonuses SET status='cancelled' WHERE player_id=$1`, pid); err != nil {
			t.Fatal(err)
		}
		if err := w.InTx(ctx, func(tx pgx.Tx) error {
			_, err := w.Deposit(ctx, tx, pid, 10000, wallet.HouseCryptoClearing, "aml-test:"+pid.String(), nil)
			return err
		}); err != nil {
			t.Fatal(err)
		}
		return reg["token"].(string), pid
	}
	withdraw := func(token, addr string) (int, map[string]any) {
		return call("/api/payments/withdraw", token, map[string]any{"method": "usdt_trc20", "amount": 1000, "address": addr})
	}

	// 1. Sanctioned address: refused, account flagged and withdrawals blocked.
	tok, pid := player()
	if c, out := withdraw(tok, "TA3rH2A7iHnm6pKH8gr9cK1EZnShnmZdFg"); c != 403 || out["code"] != "address_blocked" {
		t.Fatalf("sanctioned address: %d %v", c, out)
	}
	var blocked bool
	var tags []string
	_ = pool.QueryRow(ctx, `SELECT withdrawals_blocked, tags FROM players WHERE id=$1`, pid).Scan(&blocked, &tags)
	if !blocked || !strings.Contains(strings.Join(tags, ","), "aml_review") {
		t.Fatalf("player not flagged: blocked=%v tags=%v", blocked, tags)
	}

	// 2. Clean address passes with low risk; the same address from another player is high risk.
	clean := "TQ" + strings.ToUpper(strings.ReplaceAll(uuid.NewString(), "-", ""))
	tok2, _ := player()
	if c, out := withdraw(tok2, clean); c != 201 {
		t.Fatalf("clean address: %d %v", c, out)
	}
	tok3, _ := player()
	c, out := withdraw(tok3, clean)
	if c != 201 {
		t.Fatalf("shared address: %d %v", c, out)
	}
	var risk string
	_ = pool.QueryRow(ctx, `SELECT risk FROM payments WHERE id=$1`, out["payment_id"]).Scan(&risk)
	if risk != "high" {
		t.Fatalf("shared address risk = %q, want high", risk)
	}

	// 3. Staff blacklist; approval re-checks the address.
	staff := func() string {
		_, o := call("/api/bo/login", "", map[string]any{"email": cfg.AdminEmail, "password": cfg.AdminPassword})
		return o["token"].(string)
	}()
	if c, o := call("/api/bo/aml/addresses", staff, map[string]any{"address": clean, "list": "blacklist", "comment": "scam reports"}); c != 200 {
		t.Fatalf("blacklist: %d %v", c, o)
	}
	if c, o := call("/api/bo/withdrawals/"+out["payment_id"].(string)+"/approve", staff, map[string]any{}); c != 409 || o["code"] != "address_blocked" {
		t.Fatalf("approve to blacklisted address: %d %v", c, o)
	}
	if c, o := call("/api/bo/aml/check", staff, map[string]any{"address": "TA3rH2A7iHnm6pKH8gr9cK1EZnShnmZdFg"}); c != 200 || o["risk"] != "severe" {
		t.Fatalf("manual check: %d %v", c, o)
	}
	if c, o := call("/api/bo/aml/addresses/remove", staff, map[string]any{"address": "TA3rH2A7iHnm6pKH8gr9cK1EZnShnmZdFg", "comment": "x"}); c != 404 {
		t.Fatalf("removing an OFAC address: %d %v", c, o)
	}
	for _, p := range []string{"/api/bo/aml/addresses", "/api/bo/aml/addresses?list=ofac", "/api/bo/aml/screenings?risk=severe", "/api/bo/withdrawals"} {
		if c, o := call(p, staff, nil); c != 200 {
			t.Fatalf("%s: %d %v", p, c, o)
		}
	}
}
