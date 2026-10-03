package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// End-to-end flow over HTTP: register -> deposit webhook -> provider bet/win/rollback (with retries) -> dice.
func TestPlayerFlow(t *testing.T) {
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
	srv := httptest.NewServer(Router(cfg, wallet.New(pool), auth.NewIssuer(cfg.JWTSecret)))
	defer srv.Close()

	call := func(path, token string, body any, headers map[string]string) (int, map[string]any) {
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(b))
		if body == nil {
			req, _ = http.NewRequest(http.MethodGet, srv.URL+path, nil)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		for k, v := range headers {
			req.Header.Set(k, v)
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
	signed := func(path, secret string, body any) (int, map[string]any) {
		b, _ := json.Marshal(body)
		return call(path, "", json.RawMessage(b), map[string]string{"X-Signature": games.Sign(secret, b)})
	}
	balance := func(token string) float64 {
		_, me := call("/api/me", token, nil, nil)
		return me["balance"].(map[string]any)["real"].(float64)
	}

	email := uuid.NewString() + "@t.io"
	code, reg := call("/api/auth/register", "", map[string]any{"email": email, "password": "secret123", "country": "MX", "birth_date": "1990-05-05"}, nil)
	if code != 201 {
		t.Fatalf("register: %d %v", code, reg)
	}
	token := reg["token"].(string)

	if code, _ := call("/api/auth/register", "", map[string]any{"email": "x" + email, "password": "secret123", "country": "MX", "birth_date": "1990-05-05"}, map[string]string{"X-Country": "BR"}); code != 403 {
		t.Fatalf("registration from a blocked network country: %d, want 403", code)
	}

	_, dep := call("/api/payments/deposit", token, map[string]any{"method": "card_mock", "amount": 10000}, nil)
	for i := 0; i < 2; i++ { // PSPs retry webhooks
		if code, out := signed("/api/webhooks/mockpsp", cfg.PSPWebhookSecret, map[string]any{"payment_id": dep["payment_id"], "status": "success", "psp_ref": "r-" + dep["payment_id"].(string)}); code != 200 {
			t.Fatalf("psp webhook: %d %v", code, out)
		}
	}
	if got := balance(token); got != 10000 {
		t.Fatalf("after deposit real = %v, want 10000", got)
	}

	_, launch := call("/api/games/mock-fruit-slot/launch", token, map[string]any{}, nil)
	sess := launch["url"].(string)[len(cfg.PublicURL+"/mockprovider/game?token="):]
	u := uuid.NewString()[:8] + "-" // ids unique per run, the test DB is reused
	bet := map[string]any{"token": sess, "round_id": u + "r-1", "tx_id": u + "t-1", "amount": 1000}
	for i := 0; i < 2; i++ { // provider retries the same bet
		if code, out := signed("/api/provider/mock/bet", cfg.MockProviderSecret, bet); code != 200 {
			t.Fatalf("bet: %d %v", code, out)
		}
	}
	if got := balance(token); got != 9000 {
		t.Fatalf("after duplicate bet real = %v, want 9000", got)
	}
	if code, _ := signed("/api/provider/mock/bet", "wrong-secret", bet); code != 401 {
		t.Fatalf("bad signature accepted: %d", code)
	}
	signed("/api/provider/mock/win", cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r-1", "tx_id": u + "w-1", "amount": 2500})
	if got := balance(token); got != 11500 {
		t.Fatalf("after win real = %v, want 11500", got)
	}
	// Rollback of a settled round changes nothing; rollback of an open round refunds it.
	signed("/api/provider/mock/rollback", cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r-1", "tx_id": u + "rb-1"})
	signed("/api/provider/mock/bet", cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r-2", "tx_id": u + "t-2", "amount": 700})
	signed("/api/provider/mock/rollback", cfg.MockProviderSecret, map[string]any{"token": sess, "round_id": u + "r-2", "tx_id": u + "rb-2"})
	if got := balance(token); got != 11500 {
		t.Fatalf("after rollbacks real = %v, want 11500", got)
	}

	code, dice := call("/api/originals/dice/bet", token, map[string]any{"amount": 100, "target": 50}, nil)
	if code != 200 {
		t.Fatalf("dice: %d %v", code, dice)
	}
	if code, out := call("/api/payments/withdraw", token, map[string]any{"method": "card_mock", "amount": 1000}, nil); code != 403 || out["code"] != "kyc_required" {
		t.Fatalf("withdraw before KYC: %d %v", code, out)
	}
}
