package main

import (
	"strings"
	"testing"
)

// Manual crypto payouts: request -> approve (AML re-screen) -> mark paid with the tx hash,
// reject after approval, address and hash validation, and the balance payout of a blocked account.
func TestManualPayouts(t *testing.T) {
	h := newHarness(t)
	staff := h.staff()

	// Production methods are listed whatever DEV_TOOLS says, for withdrawals only.
	methods := h.must(200, "/api/payments/methods", "", nil)["methods"].([]any)
	found := map[string]bool{}
	for _, x := range methods {
		m := x.(map[string]any)
		if m["provider"] == "manual" && m["withdraw"] == true && m["deposit"] == false {
			found[m["code"].(string)] = true
		}
	}
	for _, c := range []string{"usdt_trc20", "usdt_erc20", "usdc_erc20", "btc", "eth", "ltc"} {
		if !found[c] {
			t.Fatalf("payout method %s missing: %v", c, methods)
		}
	}

	tok, pid := h.verifiedPlayer(10000)
	withdraw := func(method, addr string, amount int) (int, map[string]any) {
		return h.call("/api/payments/withdraw", tok, map[string]any{"method": method, "amount": amount, "address": addr})
	}
	// Address format per network.
	for _, c := range []struct{ method, addr string }{
		{"usdt_trc20", "T" + strings.Repeat("1", 33)},
		{"usdt_trc20", evmAddress()},
		{"usdc_erc20", tronAddress()},
		{"btc", "bc1qnotanaddress"},
		{"ltc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"},
	} {
		if code, out := withdraw(c.method, c.addr, 2000); code != 400 || out["code"] != "bad_address" {
			t.Fatalf("%s to %q: %d %v", c.method, c.addr, code, out)
		}
	}
	if code, out := withdraw("usdt_trc20", tronAddress(), 999); code != 400 || out["code"] != "amount_too_small" {
		t.Fatalf("below minimum: %d %v", code, out)
	}

	// 1. Request -> approve -> awaiting payout; the money stays locked.
	out := h.must(201, "/api/payments/withdraw", tok, map[string]any{"method": "usdt_trc20", "amount": 2000, "address": tronAddress()})
	id := out["payment_id"].(string)
	if r, _, l := h.balance(tok); r != 8000 || l != 2000 {
		t.Fatalf("after request real=%v locked=%v", r, l)
	}
	if code, o := h.call("/api/bo/withdrawals/"+id+"/paid", staff, map[string]any{"tx_hash": txHash()}); code != 409 || o["code"] != "not_approved" {
		t.Fatalf("mark paid before approval: %d %v", code, o)
	}
	h.must(200, "/api/bo/withdrawals/"+id+"/approve", staff, map[string]any{})
	if _, _, l := h.balance(tok); l != 2000 {
		t.Fatalf("approved payout must stay locked, locked=%v", l)
	}
	queue := h.must(200, "/api/bo/withdrawals?status=approved", staff, nil)["items"].([]any)
	inQueue := false
	for _, x := range queue {
		if m := x.(map[string]any); m["id"] == id && m["manual"] == true && m["network"] == "TRC20" && m["approved_by"] == h.cfg.AdminEmail {
			inQueue = true
		}
	}
	if !inQueue {
		t.Fatalf("approved withdrawal not in the awaiting payout queue: %v", queue)
	}

	// 2. Mark paid: bad hash refused, then completed with the hash and the crypto amount.
	if code, o := h.call("/api/bo/withdrawals/"+id+"/paid", staff, map[string]any{"tx_hash": "0x1234"}); code != 400 || o["code"] != "bad_tx_hash" {
		t.Fatalf("bad hash: %d %v", code, o)
	}
	if code, o := h.call("/api/bo/withdrawals/"+id+"/paid", staff, map[string]any{"tx_hash": txHash(), "crypto_amount": "abc"}); code != 400 || o["code"] != "bad_crypto_amount" {
		t.Fatalf("bad crypto amount: %d %v", code, o)
	}
	hash := txHash()
	paid := h.must(200, "/api/bo/withdrawals/"+id+"/paid", staff, map[string]any{"tx_hash": strings.ToUpper(hash), "crypto_amount": "19,95", "comment": "Binance withdrawal"})
	if paid["tx_hash"] != hash || paid["tx_url"] != "https://tronscan.org/#/transaction/"+hash {
		t.Fatalf("mark paid: %v", paid)
	}
	if r, _, l := h.balance(tok); r != 8000 || l != 0 {
		t.Fatalf("after payout real=%v locked=%v", r, l)
	}
	hist := h.must(200, "/api/payments", tok, nil)["items"].([]any)[0].(map[string]any)
	if hist["status"] != "completed" || hist["external_ref"] != hash || hist["crypto_amount"] != "19.95 USDT" || hist["tx_url"] != paid["tx_url"] {
		t.Fatalf("player history: %v", hist)
	}
	if code, o := h.call("/api/bo/withdrawals/"+id+"/paid", staff, map[string]any{"tx_hash": txHash()}); code != 409 || o["code"] != "not_approved" {
		t.Fatalf("paid twice: %d %v", code, o)
	}
	var clearing int64
	if err := h.pool.QueryRow(h.ctx, `SELECT count(*) FROM ledger_tx WHERE idempotency_key=$1`, "wd:complete:"+id).Scan(&clearing); err != nil || clearing != 1 {
		t.Fatalf("ledger completion: %d %v", clearing, err)
	}
	var audits int
	_ = h.pool.QueryRow(h.ctx, `SELECT count(*) FROM audit_log WHERE player_id=$1 AND action='withdrawal_paid' AND after->>'tx_hash'=$2`, pid, hash).Scan(&audits)
	if audits != 1 {
		t.Fatalf("withdrawal_paid audit entries: %d", audits)
	}

	// 3. An approved payout can still be rejected: the money returns to the real balance.
	id2 := h.must(201, "/api/payments/withdraw", tok, map[string]any{"method": "eth", "amount": 1500, "address": evmAddress()})["payment_id"].(string)
	h.must(200, "/api/bo/withdrawals/"+id2+"/approve", staff, map[string]any{})
	h.must(200, "/api/bo/withdrawals/"+id2+"/reject", staff, map[string]any{})
	if r, _, l := h.balance(tok); r != 8000 || l != 0 {
		t.Fatalf("after reject real=%v locked=%v", r, l)
	}

	// 4. The same transaction hash cannot pay two withdrawals.
	id3 := h.must(201, "/api/payments/withdraw", tok, map[string]any{"method": "usdt_trc20", "amount": 1000, "address": tronAddress()})["payment_id"].(string)
	h.must(200, "/api/bo/withdrawals/"+id3+"/approve", staff, map[string]any{})
	if code, o := h.call("/api/bo/withdrawals/"+id3+"/paid", staff, map[string]any{"tx_hash": hash}); code != 409 || o["code"] != "tx_hash_used" {
		t.Fatalf("reused hash: %d %v", code, o)
	}
	h.must(200, "/api/bo/withdrawals/"+id3+"/paid", staff, map[string]any{"tx_hash": txHash()})

	// 5. Balance payout of a blocked account, created by staff, through the same flow.
	tok4, pid4 := h.verifiedPlayer(4321)
	payout := "/api/bo/players/" + pid4.String() + "/payout"
	if code, o := h.call(payout, staff, map[string]any{"method": "eth", "address": evmAddress(), "comment": "closing"}); code != 409 || o["code"] != "player_active" {
		t.Fatalf("payout of an active player: %d %v", code, o)
	}
	h.must(200, "/api/bo/players/"+pid4.String()+"/update", staff, map[string]any{"status": "blocked", "comment": "self-exclusion request"})
	if code, o := h.call(payout, staff, map[string]any{"method": "eth", "address": evmAddress()}); code != 400 || o["code"] != "comment_required" {
		t.Fatalf("payout without comment: %d %v", code, o)
	}
	if code, o := h.call(payout, staff, map[string]any{"method": "eth", "address": "TA3rH2A7iHnm6pKH8gr9cK1EZnShnmZdFg", "comment": "x"}); code != 400 || o["code"] != "bad_address" {
		t.Fatalf("payout to a TRON address on ETH: %d %v", code, o)
	}
	po := h.must(201, payout, staff, map[string]any{"method": "eth", "address": evmAddress(), "comment": "Account closed, paying out the balance"})
	if po["amount"].(float64) != 4321 {
		t.Fatalf("payout amount: %v", po)
	}
	if r, _, l := h.balance(tok4); r != 0 || l != 4321 {
		t.Fatalf("blocked player after payout request real=%v locked=%v", r, l)
	}
	pid5 := po["payment_id"].(string)
	h.must(200, "/api/bo/withdrawals/"+pid5+"/approve", staff, map[string]any{})
	ethHash := txHash()
	done := h.must(200, "/api/bo/withdrawals/"+pid5+"/paid", staff, map[string]any{"tx_hash": ethHash, "crypto_amount": "0.0123"})
	if done["tx_url"] != "https://etherscan.io/tx/0x"+ethHash {
		t.Fatalf("eth payout: %v", done)
	}
	_ = h.pool.QueryRow(h.ctx, `SELECT count(*) FROM audit_log WHERE player_id=$1 AND action='balance_payout'`, pid4).Scan(&audits)
	if audits != 1 {
		t.Fatalf("balance_payout audit entries: %d", audits)
	}
	var createdBy *string
	_ = h.pool.QueryRow(h.ctx, `SELECT created_by::text FROM payments WHERE id=$1`, pid5).Scan(&createdBy)
	if createdBy == nil {
		t.Fatalf("staff payout has no created_by")
	}
	if r, _, l := h.balance(tok4); r != 0 || l != 0 {
		t.Fatalf("blocked player after payout real=%v locked=%v", r, l)
	}
	if code, o := h.call(payout, staff, map[string]any{"method": "eth", "address": evmAddress(), "comment": "again"}); code != 409 || o["code"] != "nothing_to_pay" {
		t.Fatalf("empty balance payout: %d %v", code, o)
	}
	dash := h.must(200, "/api/bo/dashboard", staff, nil)
	if _, ok := dash["awaiting_payout"]; !ok {
		t.Fatalf("dashboard: %v", dash)
	}
}
