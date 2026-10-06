package games

// Crash (single player): the player picks an auto-cashout multiplier; the round's crash point is
// derived from the seed pair (see CrashPoint) and the bet settles at once: it pays bet × target
// when the crash point reaches the target. The site animates the multiplier rising client-side.

import (
	"math"
	"net/http"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

type crashReq struct {
	Amount int64   `json:"amount"` // cents
	Target float64 `json:"target"` // auto cash-out multiplier, 1.01..1000 (two decimals)
}

func (s *Service) CrashBet(w http.ResponseWriter, r *http.Request) error {
	var req crashReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if !(req.Target >= 1 && req.Target <= 1001) {
		return httpx.Err(400, "bad_target", "auto cash-out must be between 1.01x and 1000x")
	}
	target := int64(math.Round(req.Target * 100))
	if target < CrashMinTarget || target > CrashMaxTarget {
		return httpx.Err(400, "bad_target", "auto cash-out must be between 1.01x and 1000x")
	}
	return s.playInstant(w, r, "crash", req.Amount, func(st seedState) (int64, map[string]any) {
		crash := CrashPoint(st.ServerSeed, st.ClientSeed, st.Nonce)
		win := int64(0)
		if crash >= target {
			win = req.Amount * target / 100
		}
		return win, map[string]any{"crash_point": float64(crash) / 100, "target": float64(target) / 100, "cashed_out": win > 0}
	})
}
