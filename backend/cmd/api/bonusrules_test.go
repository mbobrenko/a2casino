package main

import (
	"fmt"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// Bonus abuse rules: max bet while a bonus is active (dice and provider bets, not free spins)
// and per-game wagering contribution (Dice 10%), both editable in the back office.
func TestBonusRules(t *testing.T) {
	h := newHarness(t)
	staff := h.staff()

	// Public API exposes both settings.
	contribution := map[string]float64{}
	for _, x := range h.must(200, "/api/games", "", nil)["games"].([]any) {
		g := x.(map[string]any)
		contribution[g["slug"].(string)] = g["wagering_contribution"].(float64)
	}
	if contribution["dice"] != 10 || contribution["mock-fruit-slot"] != 100 {
		t.Fatalf("wagering contribution: %v", contribution)
	}
	var welcome map[string]any
	for _, x := range h.must(200, "/api/promo/offers", "", nil)["offers"].([]any) {
		if o := x.(map[string]any); o["trigger"] == "welcome" {
			welcome = o
		}
	}
	if welcome == nil || welcome["max_bet"].(float64) != 500 {
		t.Fatalf("welcome offer max_bet: %v", welcome)
	}
	welcomeID := int64(welcome["id"].(float64))

	// A player with an active $100 welcome bonus.
	tok, _ := h.register()
	dep := h.must(200, "/api/payments/deposit", tok, map[string]any{"method": "card_mock", "amount": 10000})
	if code, out := h.signed("/api/webhooks/mockpsp", h.cfg.PSPWebhookSecret, map[string]any{"payment_id": dep["payment_id"], "status": "success", "psp_ref": "r-" + dep["payment_id"].(string)}); code != 200 {
		t.Fatalf("psp webhook: %d %v", code, out)
	}
	active := func() map[string]any {
		for _, x := range h.must(200, "/api/bonuses", tok, nil)["bonuses"].([]any) {
			if b := x.(map[string]any); b["status"] == "active" {
				return b
			}
		}
		t.Fatalf("no active bonus")
		return nil
	}
	if b := active(); b["max_bet"].(float64) != 500 {
		t.Fatalf("player bonus max_bet: %v", b)
	}

	// 1. Dice: over the max bet is refused and nothing is charged; $5 counts $0.50 (10%).
	r0, b0, _ := h.balance(tok)
	code, out := h.call("/api/originals/dice/bet", tok, map[string]any{"amount": 501, "target": 50})
	if code != 400 || out["code"] != "max_bet_exceeded" || !strings.Contains(out["message"].(string), "$5.00") {
		t.Fatalf("dice over max bet: %d %v", code, out)
	}
	if r, b, _ := h.balance(tok); r != r0 || b != b0 {
		t.Fatalf("refused bet charged: %v/%v -> %v/%v", r0, b0, r, b)
	}
	h.must(200, "/api/originals/dice/bet", tok, map[string]any{"amount": 500, "target": 50})
	if p := active()["wager_progress"].(float64); p != 50 {
		t.Fatalf("dice wagering progress %v, want 50 (10%% of 500)", p)
	}

	// 2. Provider seamless wallet: the bet callback returns 400 max_bet_exceeded; slots count 100%.
	launch := h.must(200, "/api/games/mock-fruit-slot/launch", tok, map[string]any{})
	sess := launch["url"].(string)[len(h.cfg.PublicURL+"/mockprovider/game?token="):]
	u := uuid.NewString()[:8]
	bet := func(n int, amount int64) (int, map[string]any) {
		return h.signed("/api/provider/mock/bet", h.cfg.MockProviderSecret,
			map[string]any{"token": sess, "round_id": fmt.Sprintf("%s-r%d", u, n), "tx_id": fmt.Sprintf("%s-t%d", u, n), "amount": amount})
	}
	if code, out := bet(1, 600); code != 400 || out["code"] != "max_bet_exceeded" {
		t.Fatalf("provider bet over max: %d %v", code, out)
	}
	if code, out := bet(2, 500); code != 200 {
		t.Fatalf("provider bet at max: %d %v", code, out)
	}
	if code, out := bet(2, 500); code != 200 { // retry of an accepted bet
		t.Fatalf("provider bet retry: %d %v", code, out)
	}
	if p := active()["wager_progress"].(float64); p != 550 {
		t.Fatalf("wagering progress %v, want 550", p)
	}

	// 3. Back office edits: a higher max bet for the offer, a different contribution for a game.
	bonusPath := fmt.Sprintf("/api/bo/bonuses/%d", welcomeID)
	if code, out := h.call(bonusPath, staff, map[string]any{"max_bet": -1, "comment": "x"}); code != 400 {
		t.Fatalf("negative max bet: %d %v", code, out)
	}
	h.must(200, bonusPath, staff, map[string]any{"max_bet": 1000, "comment": "test"})
	defer h.must(200, bonusPath, staff, map[string]any{"max_bet": 500, "comment": "test restore"})
	if code, out := bet(3, 1000); code != 200 {
		t.Fatalf("provider bet under the raised max: %d %v", code, out)
	}
	var slotID int64
	if err := h.pool.QueryRow(h.ctx, `SELECT id FROM games WHERE slug='mock-fruit-slot'`).Scan(&slotID); err != nil {
		t.Fatal(err)
	}
	gamePath := fmt.Sprintf("/api/bo/games/%d", slotID)
	if code, out := h.call(gamePath, staff, map[string]any{"wagering_contribution": 101, "comment": "x"}); code != 400 || out["code"] != "bad_wagering_contribution" {
		t.Fatalf("contribution 101: %d %v", code, out)
	}
	h.must(200, gamePath, staff, map[string]any{"wagering_contribution": 0, "comment": "test"})
	defer h.must(200, gamePath, staff, map[string]any{"wagering_contribution": 100, "comment": "test restore"})
	before := active()["wager_progress"].(float64)
	if code, out := bet(4, 200); code != 200 {
		t.Fatalf("bet: %d %v", code, out)
	}
	if p := active()["wager_progress"].(float64); p != before {
		t.Fatalf("0%% game changed wagering: %v -> %v", before, p)
	}
	for _, x := range h.must(200, "/api/bo/games?q=fruit", staff, nil)["games"].([]any) {
		if g := x.(map[string]any); g["slug"] == "mock-fruit-slot" && g["wagering_contribution"].(float64) != 0 {
			t.Fatalf("bo games: %v", g)
		}
	}

	// 4. Without an active bonus there is no limit.
	h.must(200, fmt.Sprintf("/api/bonuses/%d/cancel", int64(active()["id"].(float64))), tok, map[string]any{})
	h.must(200, "/api/originals/dice/bet", tok, map[string]any{"amount": 2000, "target": 50})

	// 5. Free spins are not bets: a free spin worth more than the max bet still plays.
	var spinsID int64
	if err := h.pool.QueryRow(h.ctx, `SELECT bonus_id FROM promo_codes WHERE code='SPINS50'`).Scan(&spinsID); err != nil {
		t.Fatal(err)
	}
	h.must(200, fmt.Sprintf("/api/bo/bonuses/%d", spinsID), staff, map[string]any{"max_bet": 1, "comment": "test"})
	defer h.must(200, fmt.Sprintf("/api/bo/bonuses/%d", spinsID), staff, map[string]any{"max_bet": 500, "comment": "test restore"})
	tok2, _ := h.register()
	h.must(200, "/api/promo/redeem", tok2, map[string]any{"code": "SPINS50"})
	var fsID float64
	for _, x := range h.must(200, "/api/bonuses", tok2, nil)["bonuses"].([]any) {
		if b := x.(map[string]any); b["status"] == "active" {
			fsID = b["id"].(float64)
		}
	}
	h.must(200, fmt.Sprintf("/api/bonuses/%d/freespin", int64(fsID)), tok2, map[string]any{})
}
