package games

// The mock provider stands in for an external game provider or aggregator.
// It serves a tiny game page and, on each spin, calls the casino's seamless-wallet
// callbacks over HTTP with an HMAC signature, exactly as a real provider would.

import (
	"bytes"
	"encoding/json"
	"fmt"
	_ "embed"
	"html"
	"net/http"
	"strings"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/slot"
)

// The game page (reels, symbols, animations) is a static HTML file; it reads the session token
// from its own URL. Only the game title is filled in.
//
//go:embed mockgame.html
var gamePage string

func (s *Service) MockGamePage(w http.ResponseWriter, r *http.Request) {
	title := "Book of Sands"
	if tok := r.URL.Query().Get("token"); tok != "" {
		var t string
		if err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT g.title FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.token = $1`, tok).Scan(&t); err == nil && t != "" {
			title = t
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(strings.ReplaceAll(gamePage, "{{TITLE}}", html.EscapeString(title))))
}

func (s *Service) callCasino(path string, payload any) (map[string]any, int, error) {
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest(http.MethodPost, s.Cfg.CallbackURL+path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", Sign(s.Cfg.MockProviderSecret, body))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return out, resp.StatusCode, nil
}

func (s *Service) MockBalance(w http.ResponseWriter, r *http.Request) error {
	var req struct{ Token string }
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	out, code, err := s.callCasino("/api/provider/mock/balance", map[string]any{"token": req.Token})
	if err != nil {
		return err
	}
	if code != 200 {
		httpx.JSON(w, 200, map[string]any{"error": out["message"]})
		return nil
	}
	httpx.JSON(w, 200, out)
	return nil
}

func (s *Service) MockSpin(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Token string
		Bet   int64
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Bet <= 0 {
		httpx.JSON(w, 200, map[string]any{"error": "bet must be positive"})
		return nil
	}
	round := randomHex(8)
	out, code, err := s.callCasino("/api/provider/mock/bet", map[string]any{"token": req.Token, "round_id": round, "tx_id": "b-" + round, "amount": req.Bet})
	if err != nil {
		return err
	}
	if code != 200 {
		httpx.JSON(w, 200, map[string]any{"error": out["message"]})
		return nil
	}
	mult := slot.Spin()
	win := int64(float64(req.Bet) * mult)
	out, code, err = s.callCasino("/api/provider/mock/win", map[string]any{"token": req.Token, "round_id": round, "tx_id": "w-" + round, "amount": win})
	if err != nil {
		return err
	}
	if code != 200 {
		return fmt.Errorf("win callback failed: %v", out)
	}
	// The reel window is drawn to show the outcome already decided above (see slot.Layout).
	reels, lines := slot.Layout(mult)
	httpx.JSON(w, 200, map[string]any{"round_id": round, "multiplier": mult, "win": win, "balance": out["balance"], "reels": reels, "lines": lines})
	return nil
}
