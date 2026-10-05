package backoffice

// Responsible gaming on the player card: limits, exclusions and their history. Staff can make
// a limit stricter or apply a time-out / self-exclusion, never loosen or shorten what is in force.

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/rg"
)

func (s *Service) PlayerRG(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	st, err := rg.GetState(r.Context(), s.Wallet.Pool, id)
	if err != nil {
		return err
	}
	hist, err := rg.History(r.Context(), s.Wallet.Pool, id, 200)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"limits": st.Limits, "reality_check_minutes": st.RealityCheckMinutes, "exclusion": st.Exclusion, "history": hist})
	return nil
}

func (s *Service) SetPlayerLimit(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req struct {
		Kind    string `json:"kind"`
		Period  string `json:"period"`
		Amount  *int64 `json:"amount"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		if _, err := rg.SetLimit(r.Context(), tx, id, req.Kind, req.Period, req.Amount, rg.Actor{Staff: &staff, Reason: req.Comment}); err != nil {
			return err
		}
		return audit(r.Context(), tx, staff, id, "rg_limit", nil, map[string]any{"kind": req.Kind, "period": req.Period, "amount": req.Amount}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

func (s *Service) ExcludePlayer(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req struct {
		Duration string `json:"duration"`
		Comment  string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		before, err := rg.CurrentExclusion(r.Context(), tx, id)
		if err != nil {
			return err
		}
		e, err := rg.Exclude(r.Context(), tx, id, req.Duration, rg.Actor{Staff: &staff, Reason: req.Comment})
		if err != nil {
			return err
		}
		var b map[string]any
		if before != nil {
			b = map[string]any{"kind": before.Kind, "duration": before.Duration, "ends_at": before.EndsAt}
		}
		return audit(r.Context(), tx, staff, id, "rg_exclusion", b, map[string]any{"kind": e.Kind, "duration": e.Duration, "ends_at": e.EndsAt}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}
