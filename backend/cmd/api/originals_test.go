package main

import (
	"fmt"
	"slices"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/promo"
)

func (h *harness) wantErr(status int, code, path, token string, body any) {
	h.t.Helper()
	got, out := h.call(path, token, body)
	if got != status || out["code"] != code {
		h.t.Fatalf("%s: %d %v, want %d %s", path, got, out, status, code)
	}
}

func num(v any) int64 { return int64(v.(float64)) }

// The seed pair behind a round, read from the database (the player gets it on rotation).
func (h *harness) serverSeed(pid uuid.UUID) string {
	var s string
	if err := h.pool.QueryRow(h.ctx, `SELECT server_seed FROM fair_seeds WHERE player_id=$1`, pid).Scan(&s); err != nil {
		h.t.Fatal(err)
	}
	return s
}

func TestOriginalsCatalog(t *testing.T) {
	h := newHarness(t)
	found := map[string]map[string]any{}
	for _, x := range h.must(200, "/api/games", "", nil)["games"].([]any) {
		g := x.(map[string]any)
		found[g["slug"].(string)] = g
	}
	for slug, cat := range map[string]string{"crash": "crash", "mines": "instant", "plinko": "instant"} {
		g := found[slug]
		if g == nil || g["provider"] != "originals" || g["studio"] != "originals" || g["category"] != cat ||
			g["rtp"].(float64) != 99 || g["wagering_contribution"].(float64) != 10 || !g["is_new"].(bool) {
			t.Fatalf("%s: %v", slug, g)
		}
	}
	tables := h.must(200, "/api/originals/plinko/tables", "", nil)["tables"].([]any)
	if len(tables) != 9 {
		t.Fatalf("plinko tables: %d", len(tables))
	}
	for _, x := range tables {
		if rtp := x.(map[string]any)["rtp"].(float64); rtp < 98.5 || rtp > 99.2 {
			t.Fatalf("plinko table rtp %v", x)
		}
	}
}

func TestCrashAndPlinko(t *testing.T) {
	h := newHarness(t)
	tok, pid := h.verifiedPlayer(100000)

	h.wantErr(400, "bad_target", "/api/originals/crash/bet", tok, map[string]any{"amount": 100, "target": 1.0})
	h.wantErr(400, "bad_target", "/api/originals/crash/bet", tok, map[string]any{"amount": 100, "target": 1000.01})
	h.wantErr(400, "bad_amount", "/api/originals/crash/bet", tok, map[string]any{"amount": 9, "target": 2})
	h.wantErr(400, "bad_rows", "/api/originals/plinko/bet", tok, map[string]any{"amount": 100, "rows": 10, "risk": "low"})
	h.wantErr(400, "bad_risk", "/api/originals/plinko/bet", tok, map[string]any{"amount": 100, "rows": 8, "risk": "extreme"})

	seed := h.must(200, "/api/originals/seed", tok, nil)
	server := h.serverSeed(pid)
	type bet struct {
		path string
		out  map[string]any
	}
	var bets []bet
	for i := 0; i < 5; i++ {
		out := h.must(200, "/api/originals/crash/bet", tok, map[string]any{"amount": 1000, "target": 2})
		bets = append(bets, bet{"crash", out})
		out = h.must(200, "/api/originals/plinko/bet", tok, map[string]any{"amount": 1000, "rows": 16, "risk": "high"})
		bets = append(bets, bet{"plinko", out})
	}
	r0, _, _ := h.balance(tok)
	var paid int64
	for i, b := range bets {
		out := b.out
		if num(out["nonce"]) != int64(i) || out["server_seed_hash"] != seed["server_seed_hash"] || out["client_seed"] != seed["client_seed"] {
			t.Fatalf("%s %d: fair fields %v", b.path, i, out)
		}
		win := num(out["win"])
		paid += win
		switch b.path {
		case "crash":
			cp := games.CrashPoint(server, seed["client_seed"].(string), int64(i))
			if out["crash_point"].(float64) != float64(cp)/100 || (cp >= 200) != (win == 2000) || (cp < 200) != (win == 0) {
				t.Fatalf("crash %d: %v (crash point %d)", i, out, cp)
			}
		case "plinko":
			path, slot := games.PlinkoPath(server, seed["client_seed"].(string), int64(i), 16)
			if num(out["slot"]) != int64(slot) || len(out["path"].([]any)) != 16 || num(out["path"].([]any)[0]) != int64(path[0]) {
				t.Fatalf("plinko %d: %v (slot %d)", i, out, slot)
			}
			if want := 1000 * games.PlinkoTables[16]["high"][slot] / 100; win != want {
				t.Fatalf("plinko win %d, want %d", win, want)
			}
		}
	}
	if want := float64(100000 - 10*1000 + paid); r0 != want {
		t.Fatalf("balance %v, want %v", r0, want)
	}

	// Rotating reveals the server seed the player can verify everything with.
	rot := h.must(200, "/api/originals/seed", tok, map[string]any{"client_seed": "my-seed"})
	if rot["previous_server_seed"] != server || rot["client_seed"] != "my-seed" || num(rot["nonce"]) != 0 {
		t.Fatalf("rotate: %v", rot)
	}
	// The Dice alias is the same seed pair.
	if s := h.must(200, "/api/originals/dice/seed", tok, nil); s["server_seed_hash"] != rot["server_seed_hash"] {
		t.Fatalf("dice seed differs: %v vs %v", s, rot)
	}

	// Bet history and the back-office bet log show the rounds with their details.
	items := h.must(200, "/api/rounds?limit=20", tok, nil)["items"].([]any)
	games_ := map[string]int{}
	for _, x := range items {
		games_[x.(map[string]any)["game"].(string)]++
	}
	if games_["Crash"] != 5 || games_["Plinko"] != 5 {
		t.Fatalf("history: %v", games_)
	}
	bo := h.must(200, fmt.Sprintf("/api/bo/players/%s/rounds", pid), h.staff(), nil)["items"].([]any)
	d := bo[0].(map[string]any)["details"].(map[string]any)
	if d["game"] != "plinko" || d["server_seed_hash"] != seed["server_seed_hash"] {
		t.Fatalf("bo round details: %v", d)
	}
}

func TestMines(t *testing.T) {
	h := newHarness(t)
	tok, pid := h.verifiedPlayer(10000)

	if cur := h.must(200, "/api/originals/mines/current", tok, nil); cur["round"] != nil {
		t.Fatalf("current: %v", cur)
	}
	h.wantErr(400, "bad_mines", "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 25})
	h.wantErr(409, "no_round", "/api/originals/mines/reveal", tok, map[string]any{"tile": 1})
	h.wantErr(409, "no_round", "/api/originals/mines/cashout", tok, map[string]any{})

	h.must(200, "/api/originals/seed", tok, nil) // creates the seed pair
	server := h.serverSeed(pid)
	start := h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 1000, "mines": 3})
	round := start["round"].(map[string]any)
	if round["status"] != "open" || round["mines_positions"] != nil || num(round["nonce"]) != 0 || num(round["bet"]) != 1000 {
		t.Fatalf("start: %v", round)
	}
	if r, _, _ := h.balance(tok); r != 9000 {
		t.Fatalf("balance after start %v", r)
	}
	h.wantErr(409, "round_open", "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 3})
	h.wantErr(409, "nothing_revealed", "/api/originals/mines/cashout", tok, map[string]any{})
	h.wantErr(409, "round_open", "/api/originals/seed", tok, map[string]any{})
	h.wantErr(400, "bad_tile", "/api/originals/mines/reveal", tok, map[string]any{"tile": 25})

	mines := games.MinesPositions(server, round["client_seed"].(string), 0, 3)
	var safe []int
	for i := 0; i < 25; i++ {
		if !slices.Contains(mines, i) {
			safe = append(safe, i)
		}
	}
	out := h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": safe[0]})["round"].(map[string]any)
	if out["status"] != "open" || num(out["payout"]) != games.MinesPayout(1000, 3, 1) {
		t.Fatalf("reveal: %v", out)
	}
	h.wantErr(409, "already_revealed", "/api/originals/mines/reveal", tok, map[string]any{"tile": safe[0]})
	h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": safe[1]})

	// The round survives a reload.
	cur := h.must(200, "/api/originals/mines/current", tok, nil)["round"].(map[string]any)
	if len(cur["revealed"].([]any)) != 2 || cur["mines_positions"] != nil {
		t.Fatalf("current: %v", cur)
	}
	cash := h.must(200, "/api/originals/mines/cashout", tok, map[string]any{})["round"].(map[string]any)
	want := games.MinesPayout(1000, 3, 2) // 0.99 × C(25,2)/C(22,2) = 1.2857 → $12.85
	if cash["status"] != "cashed" || num(cash["win"]) != want || want != 1285 || len(cash["mines_positions"].([]any)) != 3 {
		t.Fatalf("cashout: %v (want %d)", cash, want)
	}
	if r, _, _ := h.balance(tok); r != float64(9000+want) {
		t.Fatalf("balance after cashout %v", r)
	}

	// Second round: hit a mine.
	server = h.serverSeed(pid)
	h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 500, "mines": 5})
	mines = games.MinesPositions(server, round["client_seed"].(string), 1, 5)
	lost := h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": mines[2]})["round"].(map[string]any)
	if lost["status"] != "lost" || num(lost["win"]) != 0 || len(lost["mines_positions"].([]any)) != 5 {
		t.Fatalf("lost: %v", lost)
	}

	// Third round: one mine, reveal every safe tile → automatic cash-out at 24.75x.
	server = h.serverSeed(pid)
	h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 24})
	mines = games.MinesPositions(server, round["client_seed"].(string), 2, 24)
	var last map[string]any
	for i := 0; i < 25; i++ {
		if !slices.Contains(mines, i) {
			last = h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": i})["round"].(map[string]any)
		}
	}
	if last["status"] != "cashed" || num(last["win"]) != 2475 {
		t.Fatalf("all safe tiles: %v", last)
	}

	// History: three settled Mines rounds; the rounds table is consistent with the ledger.
	var settled, totalWin int64
	if err := h.pool.QueryRow(h.ctx, `SELECT count(*), sum(win_real+win_bonus) FROM game_rounds r JOIN games g ON g.id=r.game_id
		WHERE r.player_id=$1 AND g.slug='mines' AND r.status='settled'`, pid).Scan(&settled, &totalWin); err != nil {
		t.Fatal(err)
	}
	if settled != 3 || totalWin != want+2475 {
		t.Fatalf("game_rounds: %d settled, win %d", settled, totalWin)
	}
}

func TestMinesStaleAutoCashout(t *testing.T) {
	h := newHarness(t)
	tok, pid := h.verifiedPlayer(10000)
	svc := &games.Service{Cfg: h.cfg, Wallet: h.w, Promo: &promo.Service{Wallet: h.w}}

	// A round with nothing revealed returns the stake; one with a safe tile pays its multiplier.
	h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 700, "mines": 2})
	if _, err := h.pool.Exec(h.ctx, `UPDATE mines_rounds SET created_at=now()-interval '25 hours' WHERE player_id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if n, err := svc.CloseStaleMines(h.ctx, games.MinesStaleAfter); err != nil || n < 1 {
		t.Fatalf("close stale: %d %v", n, err)
	}
	if r, _, _ := h.balance(tok); r != 10000 {
		t.Fatalf("balance after auto cash-out %v, want stake back", r)
	}
	var status string
	var auto bool
	if err := h.pool.QueryRow(h.ctx, `SELECT r.status, (r.details->>'auto_cashout')::bool FROM game_rounds r JOIN games g ON g.id=r.game_id
		WHERE r.player_id=$1 AND g.slug='mines'`, pid).Scan(&status, &auto); err != nil || status != "settled" || !auto {
		t.Fatalf("round: %s %v %v", status, auto, err)
	}
	// A fresh round is not touched.
	h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 2})
	if _, err := svc.CloseStaleMines(h.ctx, time.Hour); err != nil {
		t.Fatal(err)
	}
	if cur := h.must(200, "/api/originals/mines/current", tok, nil); cur["round"] == nil {
		t.Fatal("fresh round was closed")
	}
}

// Bonus max bet, wagering contribution (10%) and responsible gaming apply to the new originals.
func TestOriginalsBonusAndRG(t *testing.T) {
	h := newHarness(t)
	tok, pid := h.register()
	dep := h.must(200, "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 10000})
	if code, out := h.signed("/api/webhooks/mockpsp", h.cfg.PSPWebhookSecret, map[string]any{"payment_id": dep["payment_id"], "status": "success", "psp_ref": "r-" + dep["payment_id"].(string)}); code != 200 {
		t.Fatalf("psp webhook: %d %v", code, out)
	}
	progress := func() float64 {
		for _, x := range h.must(200, "/api/bonuses", tok, nil)["bonuses"].([]any) {
			if b := x.(map[string]any); b["status"] == "active" {
				return b["wager_progress"].(float64)
			}
		}
		t.Fatal("no active bonus")
		return 0
	}
	h.wantErr(400, "max_bet_exceeded", "/api/originals/crash/bet", tok, map[string]any{"amount": 501, "target": 2})
	h.wantErr(400, "max_bet_exceeded", "/api/originals/plinko/bet", tok, map[string]any{"amount": 600, "rows": 8, "risk": "low"})
	h.wantErr(400, "max_bet_exceeded", "/api/originals/mines/start", tok, map[string]any{"amount": 1000, "mines": 3})
	p0 := progress()
	h.must(200, "/api/originals/crash/bet", tok, map[string]any{"amount": 500, "target": 1.5})
	h.must(200, "/api/originals/plinko/bet", tok, map[string]any{"amount": 500, "rows": 8, "risk": "low"})
	h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 500, "mines": 1})
	if p := progress(); p-p0 != 150 {
		t.Fatalf("wagering progress +%v, want +150 (10%% of 3 × $5)", p-p0)
	}
	// Reveal one safe tile, then take a 24-hour time-out: new bets are refused, the open round can be finished.
	var server, client string
	var nonce int64
	if err := h.pool.QueryRow(h.ctx, `SELECT server_seed, client_seed, nonce FROM mines_rounds WHERE player_id=$1 AND status='open'`, pid).Scan(&server, &client, &nonce); err != nil {
		t.Fatal(err)
	}
	mine := games.MinesPositions(server, client, nonce, 1)[0]
	h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": (mine + 1) % 25})
	h.must(200, "/api/rg/exclude", tok, map[string]any{"duration": "24h"})
	h.wantErr(403, "timeout", "/api/originals/crash/bet", tok, map[string]any{"amount": 100, "target": 2})
	h.wantErr(403, "timeout", "/api/originals/plinko/bet", tok, map[string]any{"amount": 100, "rows": 8, "risk": "low"})
	h.wantErr(403, "timeout", "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 3})
	if out := h.must(200, "/api/originals/mines/cashout", tok, map[string]any{})["round"].(map[string]any); out["status"] != "cashed" {
		t.Fatalf("cashout during time-out: %v", out)
	}

	// Wager limit on another player.
	tok2, _ := h.verifiedPlayer(10000)
	h.must(200, "/api/rg/limits", tok2, map[string]any{"kind": "wager", "period": "day", "amount": 300})
	h.must(200, "/api/originals/plinko/bet", tok2, map[string]any{"amount": 200, "rows": 12, "risk": "medium"})
	h.wantErr(403, "wager_limit", "/api/originals/crash/bet", tok2, map[string]any{"amount": 200, "target": 3})
	h.wantErr(403, "wager_limit", "/api/originals/mines/start", tok2, map[string]any{"amount": 200, "mines": 3})
}
