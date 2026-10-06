package games

// Plinko: the ball falls through 8, 12 or 16 rows of pegs, one fair float per row decides left
// or right, and the slot it lands in pays the multiplier of the chosen risk table at the game's RTP.

import (
	"context"
	"net/http"
	"strconv"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

type plinkoReq struct {
	Amount int64  `json:"amount"` // cents
	Rows   int    `json:"rows"`   // 8, 12 or 16
	Risk   string `json:"risk"`   // low, medium, high
}

func (s *Service) PlinkoBet(w http.ResponseWriter, r *http.Request) error {
	var req plinkoReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	tables, ok := PlinkoTables[req.Rows]
	if !ok {
		return httpx.Err(400, "bad_rows", "rows must be 8, 12 or 16")
	}
	if _, ok := tables[req.Risk]; !ok {
		return httpx.Err(400, "bad_risk", "risk must be low, medium or high")
	}
	return s.playInstant(w, r, "plinko", req.Amount, func(p placedBet) (int64, map[string]any) {
		table := PlinkoTable(p.RTP, req.Rows, req.Risk)
		path, slot := PlinkoPath(p.Seed.ServerSeed, p.Seed.ClientSeed, p.Seed.Nonce, req.Rows)
		m := table[slot]
		return req.Amount * m / 100, map[string]any{"rows": req.Rows, "risk": req.Risk, "path": path, "slot": slot, "multiplier": float64(m) / 100}
	})
}

type plinkoTableView struct {
	Rows        int       `json:"rows"`
	Risk        string    `json:"risk"`
	Multipliers []float64 `json:"multipliers"`
	RTP         float64   `json:"rtp"`
}

func plinkoTablesView(rtp int) []plinkoTableView {
	var out []plinkoTableView
	for _, rows := range PlinkoRows {
		for _, risk := range PlinkoRisks {
			t := PlinkoTable(rtp, rows, risk)
			ms := make([]float64, len(t))
			for i, m := range t {
				ms[i] = float64(m) / 100
			}
			out = append(out, plinkoTableView{Rows: rows, Risk: risk, Multipliers: ms, RTP: PlinkoRTP(rows, t) * 100})
		}
	}
	return out
}

// originalRTP is the RTP an original is configured at now.
func (s *Service) originalRTP(ctx context.Context, slug string) (int, error) {
	var rtp int
	err := s.Wallet.Pool.QueryRow(ctx, `SELECT COALESCE(rtp, 99)::int FROM games WHERE slug=$1`, slug).Scan(&rtp)
	return rtp, err
}

// PlinkoTablesHandler publishes the payout tables (GET /api/originals/plinko/tables, no auth):
// the tables of the RTP Plinko runs at now, or of the preset in ?rtp=, plus every preset's tables
// under `by_rtp` with ?all=1.
func (s *Service) PlinkoTablesHandler(w http.ResponseWriter, r *http.Request) error {
	current, err := s.originalRTP(r.Context(), "plinko")
	if err != nil {
		return err
	}
	rtp := current
	if q := r.URL.Query().Get("rtp"); q != "" {
		v, err := strconv.Atoi(q)
		if err != nil || !ValidRTP(v) {
			return httpx.Err(400, "bad_rtp", "rtp must be one of the presets")
		}
		rtp = v
	}
	resp := map[string]any{"rtp": rtp, "current_rtp": current, "presets": RTPPresets, "tables": plinkoTablesView(rtp)}
	if r.URL.Query().Get("all") != "" {
		all := map[string][]plinkoTableView{}
		for _, p := range RTPPresets {
			all[strconv.Itoa(p)] = plinkoTablesView(p)
		}
		resp["by_rtp"] = all
	}
	httpx.JSON(w, 200, resp)
	return nil
}
