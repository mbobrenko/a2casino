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
	"time"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/payments"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// NOWPayments: invoice creation against a fake gateway, then signed IPNs credit the deposit once.
func TestNOWPaymentsDeposit(t *testing.T) {
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
	var invoiceReq map[string]any
	invoiceID := fmt.Sprint(time.Now().UnixNano()) // unique per run, the test DB is reused
	gw := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/invoice" || r.Header.Get("x-api-key") != "test-key" {
			w.WriteHeader(401)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&invoiceReq)
		json.NewEncoder(w).Encode(map[string]any{"id": invoiceID, "order_id": "x", "invoice_url": "https://sandbox.nowpayments.io/payment/?iid=" + invoiceID})
	}))
	defer gw.Close()
	cfg := config.Load()
	cfg.NOWPaymentsAPIKey, cfg.NOWPaymentsIPNKey, cfg.NOWPaymentsBaseURL = "test-key", "ipn-secret", gw.URL
	srv := httptest.NewServer(Router(cfg, wallet.New(pool), auth.NewIssuer(cfg.JWTSecret)))
	defer srv.Close()

	call := func(path, token, sig string, body any) (int, map[string]any) {
		b, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPost, srv.URL+path, bytes.NewReader(b))
		if body == nil {
			req, _ = http.NewRequest(http.MethodGet, srv.URL+path, nil)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		if sig != "" {
			req.Header.Set("x-nowpayments-sig", sig)
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
	_, reg := call("/api/auth/register", "", "", map[string]any{"email": uuid.NewString() + "@t.io", "password": "secret123", "country": "MX", "birth_date": "1990-05-05"})
	token := reg["token"].(string)
	code, dep := call("/api/payments/deposit", token, "", map[string]any{"method": "nowpayments", "amount": 2500})
	if code != 200 || dep["url"] != "https://sandbox.nowpayments.io/payment/?iid="+invoiceID {
		t.Fatalf("deposit: %d %v", code, dep)
	}
	if invoiceReq["price_amount"].(float64) != 25 || invoiceReq["order_id"] != dep["payment_id"] {
		t.Fatalf("invoice request: %v", invoiceReq)
	}
	ipn := func(status string) int {
		body, _ := json.Marshal(map[string]any{"payment_id": 5077125051, "invoice_id": 4522625843, "payment_status": status, "order_id": dep["payment_id"],
			"price_amount": 25, "price_currency": "usd", "pay_currency": "usdttrc20", "actually_paid": 25.0123, "pay_address": "TXyz"})
		sig, _ := payments.NPSignature("ipn-secret", body)
		c, _ := call("/api/webhooks/nowpayments", "", sig, json.RawMessage(body))
		return c
	}
	if c := ipn("confirming"); c != 200 {
		t.Fatalf("confirming ipn: %d", c)
	}
	for i := 0; i < 2; i++ { // retried
		if c := ipn("finished"); c != 200 {
			t.Fatalf("finished ipn: %d", c)
		}
	}
	if c, _ := call("/api/webhooks/nowpayments", "", "deadbeef", map[string]any{"order_id": dep["payment_id"], "payment_status": "finished"}); c != 401 {
		t.Fatalf("unsigned ipn accepted: %d", c)
	}
	_, me := call("/api/me", token, "", nil)
	bal := me["balance"].(map[string]any)
	if bal["real"].(float64) != 2500 || bal["bonus"].(float64) != 2500 {
		t.Fatalf("balance after gateway deposit: %v (want real 2500 + welcome bonus 2500)", bal)
	}
	if c, out := call("/api/payments/withdraw", token, "", map[string]any{"method": "nowpayments", "amount": 1000}); c != 400 || out["code"] != "deposit_only" {
		t.Fatalf("withdraw via gateway: %d %v", c, out)
	}
}
