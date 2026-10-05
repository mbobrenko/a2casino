package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/backoffice"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/payments"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// harness is an API server on the test database with helpers for the v0.3 tests.
type harness struct {
	t    *testing.T
	ctx  context.Context
	pool *pgxpool.Pool
	w    *wallet.Wallet
	cfg  config.Config
	srv  *httptest.Server
}

func newHarness(t *testing.T) *harness {
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
	return &harness{t: t, ctx: ctx, pool: pool, w: w, cfg: cfg, srv: srv}
}

func (h *harness) call(path, token string, body any) (int, map[string]any) {
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

func (h *harness) must(want int, path, token string, body any) map[string]any {
	h.t.Helper()
	code, out := h.call(path, token, body)
	if code != want {
		h.t.Fatalf("%s: %d %v, want %d", path, code, out, want)
	}
	return out
}

// signed posts a body signed like a provider or PSP callback.
func (h *harness) signed(path, secret string, body any) (int, map[string]any) {
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

func (h *harness) register() (string, uuid.UUID) {
	out := h.must(201, "/api/auth/register", "", map[string]any{"email": uuid.NewString() + "@t.io", "password": "secret123", "country": "CL", "birth_date": "1990-05-05"})
	return out["token"].(string), uuid.MustParse(out["player_id"].(string))
}

// verifiedPlayer has real money and no bonus, so it can withdraw.
func (h *harness) verifiedPlayer(real int64) (string, uuid.UUID) {
	tok, pid := h.register()
	if _, err := h.pool.Exec(h.ctx, `UPDATE players SET verification='verified' WHERE id=$1`, pid); err != nil {
		h.t.Fatal(err)
	}
	if _, err := h.pool.Exec(h.ctx, `UPDATE player_bonuses SET status='cancelled' WHERE player_id=$1`, pid); err != nil {
		h.t.Fatal(err)
	}
	if err := h.w.InTx(h.ctx, func(tx pgx.Tx) error {
		_, err := h.w.Deposit(h.ctx, tx, pid, real, wallet.HouseCryptoClearing, "test:"+pid.String(), nil)
		return err
	}); err != nil {
		h.t.Fatal(err)
	}
	return tok, pid
}

func (h *harness) balance(token string) (real, bonus, locked float64) {
	b := h.must(200, "/api/me", token, nil)["balance"].(map[string]any)
	return b["real"].(float64), b["bonus"].(float64), b["locked"].(float64)
}

func (h *harness) staff() string {
	return h.must(200, "/api/bo/login", "", map[string]any{"email": h.cfg.AdminEmail, "password": h.cfg.AdminPassword})["token"].(string)
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

// tronAddress is a fresh, valid TRON address (never used by another player).
func tronAddress() string { return payments.Base58Check(0x41, randBytes(20)) }

func evmAddress() string { return "0x" + hex.EncodeToString(randBytes(20)) }

func txHash() string { return hex.EncodeToString(randBytes(32)) }
