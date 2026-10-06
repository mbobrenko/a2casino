package games

// Plinko: the ball falls through 8, 12 or 16 rows of pegs, one fair float per row decides left
// or right, and the slot it lands in pays the multiplier of the chosen risk table.

import (
	"net/http"

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
	table, ok := tables[req.Risk]
	if !ok {
		return httpx.Err(400, "bad_risk", "risk must be low, medium or high")
	}
	return s.playInstant(w, r, "plinko", req.Amount, func(st seedState) (int64, map[string]any) {
		path, slot := PlinkoPath(st.ServerSeed, st.ClientSeed, st.Nonce, req.Rows)
		m := table[slot]
		return req.Amount * m / 100, map[string]any{"rows": req.Rows, "risk": req.Risk, "path": path, "slot": slot, "multiplier": float64(m) / 100}
	})
}

// PlinkoTablesHandler publishes the payout tables (GET /api/originals/plinko/tables, no auth).
func (s *Service) PlinkoTablesHandler(w http.ResponseWriter, r *http.Request) error {
	type table struct {
		Rows        int       `json:"rows"`
		Risk        string    `json:"risk"`
		Multipliers []float64 `json:"multipliers"`
		RTP         float64   `json:"rtp"`
	}
	var out []table
	for _, rows := range []int{8, 12, 16} {
		for _, risk := range []string{"low", "medium", "high"} {
			t := PlinkoTables[rows][risk]
			ms := make([]float64, len(t))
			for i, m := range t {
				ms[i] = float64(m) / 100
			}
			out = append(out, table{Rows: rows, Risk: risk, Multipliers: ms, RTP: PlinkoRTP(rows, t) * 100})
		}
	}
	httpx.JSON(w, 200, map[string]any{"tables": out})
	return nil
}
