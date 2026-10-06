package main

import (
	"fmt"
	"math"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/games"
)

// gameID looks up a game's id in the back-office list (and checks the list's RTP fields).
func (h *harness) gameID(staff, slug string) int64 {
	h.t.Helper()
	out := h.must(200, "/api/bo/games?q="+slug, staff, nil)
	if p := out["rtp_presets"].([]any); len(p) != len(games.RTPPresets) {
		h.t.Fatalf("rtp_presets: %v", p)
	}
	for _, x := range out["games"].([]any) {
		if g := x.(map[string]any); g["slug"] == slug {
			if g["rtp_configurable"] != (g["provider"] == "originals") {
				h.t.Fatalf("rtp_configurable: %v", g)
			}
			return num(g["id"])
		}
	}
	h.t.Fatalf("game %s not found", slug)
	return 0
}

// staffWithRole creates a staff account with the role and returns its token.
func (h *harness) staffWithRole(role string) string {
	h.t.Helper()
	email := role + "-" + uuid.NewString()[:8] + "@a2casino.local"
	hash, err := auth.HashPassword("secret12345")
	if err != nil {
		h.t.Fatal(err)
	}
	if _, err := h.pool.Exec(h.ctx, `INSERT INTO staff (id, email, password_hash, role) VALUES ($1,$2,$3,$4)`, uuid.New(), email, hash, role); err != nil {
		h.t.Fatal(err)
	}
	return h.must(200, "/api/bo/login", "", map[string]any{"email": email, "password": "secret12345"})["token"].(string)
}

// resetOriginals puts every original back to the defaults (99%, $10,000) after the test.
func (h *harness) resetOriginals() {
	h.t.Cleanup(func() {
		if _, err := h.pool.Exec(h.ctx, `UPDATE games SET rtp=99, max_win=1000000 WHERE provider='originals'`); err != nil {
			h.t.Error(err)
		}
	})
}

func (h *harness) publicGame(slug string) map[string]any {
	for _, x := range h.must(200, "/api/games", "", nil)["games"].([]any) {
		if g := x.(map[string]any); g["slug"] == slug {
			return g
		}
	}
	h.t.Fatalf("%s not in the lobby", slug)
	return nil
}

func lastAudit(h *harness, staff, action string) map[string]any {
	h.t.Helper()
	items := h.must(200, "/api/bo/audit?action="+action+"&limit=1", staff, nil)["items"].([]any)
	if len(items) == 0 {
		h.t.Fatalf("no %s audit entry", action)
	}
	return items[0].(map[string]any)
}

func TestOriginalsRTPConfig(t *testing.T) {
	h := newHarness(t)
	h.resetOriginals()
	admin := h.staff()
	dice := h.gameID(admin, "dice")
	slot := h.gameID(admin, "mock-fruit-slot")
	path := fmt.Sprintf("/api/bo/games/%d", dice)

	// Defaults: 99% and $10,000 for every original, published in the lobby.
	for _, slug := range []string{"dice", "crash", "mines", "plinko"} {
		if g := h.publicGame(slug); g["rtp"].(float64) != 99 || num(g["max_win"]) != games.DefaultMaxWin {
			t.Fatalf("%s defaults: %v", slug, g)
		}
	}

	// Only an admin may change the RTP or the max win; a comment is required; presets only; originals only.
	marketing := h.staffWithRole("marketing")
	h.wantErr(403, "forbidden", path, marketing, map[string]any{"rtp": 96, "comment": "B2B"})
	h.wantErr(403, "forbidden", path, marketing, map[string]any{"max_win": 50000, "comment": "B2B"})
	h.wantErr(403, "forbidden", path, h.staffWithRole("support"), map[string]any{"rtp": 96, "comment": "B2B"})
	h.must(200, path, marketing, map[string]any{"sort_order": 5, "comment": "marketing can still edit the listing"})
	h.wantErr(400, "comment_required", path, admin, map[string]any{"rtp": 96})
	h.wantErr(400, "bad_rtp", path, admin, map[string]any{"rtp": 93, "comment": "x"})
	h.wantErr(400, "bad_rtp", path, admin, map[string]any{"rtp": 100, "comment": "x"})
	h.wantErr(400, "bad_max_win", path, admin, map[string]any{"max_win": 0, "comment": "x"})
	h.wantErr(400, "rtp_not_configurable", fmt.Sprintf("/api/bo/games/%d", slot), admin, map[string]any{"rtp": 96, "comment": "x"})
	if g := h.publicGame("dice"); g["rtp"].(float64) != 99 {
		t.Fatalf("refused changes changed the RTP: %v", g)
	}

	h.must(200, path, admin, map[string]any{"rtp": 96, "comment": "Operator X certified version 96%"})
	a := lastAudit(h, admin, "game_rtp_change")
	if a["comment"] != "Operator X certified version 96%" || a["staff_email"] != h.cfg.AdminEmail ||
		a["before"].(map[string]any)["rtp"].(float64) != 99 || a["after"].(map[string]any)["rtp"].(float64) != 96 ||
		a["after"].(map[string]any)["slug"] != "dice" {
		t.Fatalf("audit: %v", a)
	}
	if g := h.publicGame("dice"); g["rtp"].(float64) != 96 {
		t.Fatalf("lobby RTP: %v", g)
	}

	// The next bet uses 96%: multiplier 96 / target, stored in the round.
	tok, pid := h.verifiedPlayer(100000)
	h.must(200, "/api/originals/seed", tok, nil)
	server := h.serverSeed(pid)
	for i := 0; i < 6; i++ {
		out := h.must(200, "/api/originals/dice/bet", tok, map[string]any{"amount": 1000, "target": 50})
		roll := games.DiceRoll(server, out["client_seed"].(string), num(out["nonce"]))
		want := int64(0)
		if roll < 5000 {
			want = 1920
		}
		if num(out["rtp"]) != 96 || math.Abs(out["multiplier"].(float64)-1.92) > 1e-12 || num(out["win"]) != want {
			t.Fatalf("dice at 96%%: %v (roll %d)", out, roll)
		}
	}
	var stored int64
	if err := h.pool.QueryRow(h.ctx, `SELECT (details->>'rtp')::int FROM game_rounds WHERE player_id=$1 ORDER BY id DESC LIMIT 1`, pid).Scan(&stored); err != nil || stored != 96 {
		t.Fatalf("details.rtp = %d %v", stored, err)
	}

	// Crash at 92% and Plinko at 95%.
	h.must(200, fmt.Sprintf("/api/bo/games/%d", h.gameID(admin, "crash")), admin, map[string]any{"rtp": 92, "comment": "B2B 92"})
	h.must(200, fmt.Sprintf("/api/bo/games/%d", h.gameID(admin, "plinko")), admin, map[string]any{"rtp": 95, "comment": "B2B 95"})
	out := h.must(200, "/api/originals/crash/bet", tok, map[string]any{"amount": 1000, "target": 1.5})
	cp := games.CrashPoint(server, out["client_seed"].(string), num(out["nonce"]), 92)
	if num(out["rtp"]) != 92 || out["crash_point"].(float64) != float64(cp)/100 || (cp >= 150) != (num(out["win"]) == 1500) {
		t.Fatalf("crash at 92%%: %v (crash point %d)", out, cp)
	}
	tables := h.must(200, "/api/originals/plinko/tables", "", nil)
	if num(tables["rtp"]) != 95 || num(tables["current_rtp"]) != 95 {
		t.Fatalf("plinko tables rtp: %v", tables["rtp"])
	}
	for _, x := range tables["tables"].([]any) {
		if r := x.(map[string]any)["rtp"].(float64); math.Abs(r-95) > 0.15 {
			t.Fatalf("published 95%% table: %v", x)
		}
	}
	if t99 := h.must(200, "/api/originals/plinko/tables?rtp=99&all=1", "", nil); num(t99["rtp"]) != 99 || len(t99["by_rtp"].(map[string]any)) != len(games.RTPPresets) {
		t.Fatalf("plinko tables ?rtp=99: %v", t99["rtp"])
	}
	h.wantErr(400, "bad_rtp", "/api/originals/plinko/tables?rtp=93", "", nil)
	out = h.must(200, "/api/originals/plinko/bet", tok, map[string]any{"amount": 1000, "rows": 16, "risk": "high"})
	_, pslot := games.PlinkoPath(server, out["client_seed"].(string), num(out["nonce"]), 16)
	if want := 1000 * games.PlinkoTable(95, 16, "high")[pslot] / 100; num(out["rtp"]) != 95 || num(out["win"]) != want {
		t.Fatalf("plinko at 95%%: %v, want win %d", out, want)
	}
}

// An open Mines round keeps the RTP it started with; the next round uses the new one.
func TestMinesKeepsRoundRTP(t *testing.T) {
	h := newHarness(t)
	h.resetOriginals()
	admin := h.staff()
	path := fmt.Sprintf("/api/bo/games/%d", h.gameID(admin, "mines"))
	tok, pid := h.verifiedPlayer(100000)
	h.must(200, "/api/originals/seed", tok, nil)
	server := h.serverSeed(pid)

	round := h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 1000, "mines": 3})["round"].(map[string]any)
	if num(round["rtp"]) != 99 {
		t.Fatalf("start: %v", round)
	}
	h.must(200, path, admin, map[string]any{"rtp": 90, "comment": "B2B 90"})

	safe := func(nonce int64, mines int) []int {
		pos := games.MinesPositions(server, round["client_seed"].(string), nonce, mines)
		var out []int
		for i := 0; i < 25; i++ {
			if !slices.Contains(pos, i) {
				out = append(out, i)
			}
		}
		return out
	}
	s := safe(num(round["nonce"]), 3)
	r := h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": s[0]})["round"].(map[string]any)
	if num(r["rtp"]) != 99 || num(r["payout"]) != games.MinesPayout(1000, 3, 1, 99) || math.Abs(r["next_multiplier"].(float64)-games.MinesMultiplier(3, 2, 99)) > 1e-12 {
		t.Fatalf("open round after the change: %v", r)
	}
	cash := h.must(200, "/api/originals/mines/cashout", tok, map[string]any{})["round"].(map[string]any)
	if num(cash["win"]) != games.MinesPayout(1000, 3, 1, 99) || num(cash["win"]) != 1125 {
		t.Fatalf("cashout at the old RTP: %v", cash)
	}
	var stored int64
	if err := h.pool.QueryRow(h.ctx, `SELECT (details->>'rtp')::int FROM game_rounds WHERE provider='originals' AND round_id=(SELECT round_id FROM mines_rounds WHERE id=$1)`,
		num(cash["id"])).Scan(&stored); err != nil || stored != 99 {
		t.Fatalf("settled details.rtp = %d %v", stored, err)
	}

	// New round: 90%.
	round = h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 1000, "mines": 3})["round"].(map[string]any)
	s = safe(num(round["nonce"]), 3)
	r = h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": s[0]})["round"].(map[string]any)
	if num(r["rtp"]) != 90 || num(r["payout"]) != games.MinesPayout(1000, 3, 1, 90) || num(r["payout"]) != 1022 {
		t.Fatalf("new round at 90%%: %v", r)
	}
	h.must(200, "/api/originals/mines/cashout", tok, map[string]any{})
}

func TestOriginalsMaxWin(t *testing.T) {
	h := newHarness(t)
	h.resetOriginals()
	admin := h.staff()
	mines := h.gameID(admin, "mines")
	crash := h.gameID(admin, "crash")
	tok, pid := h.verifiedPlayer(100000)
	h.must(200, "/api/originals/seed", tok, nil)
	server := h.serverSeed(pid)

	h.wantErr(403, "forbidden", fmt.Sprintf("/api/bo/games/%d", mines), h.staffWithRole("marketing"), map[string]any{"max_win": 500, "comment": "x"})
	h.must(200, fmt.Sprintf("/api/bo/games/%d", mines), admin, map[string]any{"max_win": 500, "comment": "small operator: $5 cap for the test"})
	h.must(200, fmt.Sprintf("/api/bo/games/%d", crash), admin, map[string]any{"max_win": 500, "comment": "small operator: $5 cap for the test"})
	a := lastAudit(h, admin, "game_max_win_change")
	if num(a["before"].(map[string]any)["max_win"]) != games.DefaultMaxWin || num(a["after"].(map[string]any)["max_win"]) != 500 {
		t.Fatalf("audit: %v", a)
	}
	if g := h.publicGame("mines"); num(g["max_win"]) != 500 {
		t.Fatalf("lobby max_win: %v", g)
	}

	// A stake above the cap is refused.
	h.wantErr(400, "bet_too_high", "/api/originals/mines/start", tok, map[string]any{"amount": 501, "mines": 3})

	// 24 mines, $1: the first gem would pay $24.75; it is capped at $5 and the round cashes out.
	round := h.must(200, "/api/originals/mines/start", tok, map[string]any{"amount": 100, "mines": 24})["round"].(map[string]any)
	if num(round["max_win"]) != 500 {
		t.Fatalf("start: %v", round)
	}
	pos := games.MinesPositions(server, round["client_seed"].(string), num(round["nonce"]), 24)
	tile := 0
	for slices.Contains(pos, tile) {
		tile++
	}
	r0, _, _ := h.balance(tok)
	r := h.must(200, "/api/originals/mines/reveal", tok, map[string]any{"tile": tile})["round"].(map[string]any)
	if r["status"] != "cashed" || num(r["win"]) != 500 || r["max_win_reached"] != true {
		t.Fatalf("capped mines: %v", r)
	}
	if r1, _, _ := h.balance(tok); r1-r0 != 500 {
		t.Fatalf("balance +%v, want +500", r1-r0)
	}
	var applied bool
	if err := h.pool.QueryRow(h.ctx, `SELECT (details->>'max_win_applied')::bool FROM game_rounds WHERE provider='originals' AND round_id=(SELECT round_id FROM mines_rounds WHERE id=$1)`,
		num(r["id"])).Scan(&applied); err != nil || !applied {
		t.Fatalf("details.max_win_applied %v %v", applied, err)
	}

	// Crash: $5 at 1.01x would pay $5.05; a win pays the $5 cap.
	for i := 0; i < 20; i++ {
		out := h.must(200, "/api/originals/crash/bet", tok, map[string]any{"amount": 500, "target": 1.01})
		if out["cashed_out"] == true {
			if num(out["win"]) != 500 || out["max_win_applied"] != true || num(out["max_win"]) != 500 {
				t.Fatalf("capped crash: %v", out)
			}
			return
		}
	}
	t.Fatal("no crash win in 20 bets at 1.01x")
}
