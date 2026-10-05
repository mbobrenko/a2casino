package rg

import (
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

// Handlers is the player's self-service API (/api/rg/*).
type Handlers struct {
	Pool *pgxpool.Pool
}

func (h *Handlers) State(w http.ResponseWriter, r *http.Request) error {
	st, err := GetState(r.Context(), h.Pool, auth.From(r.Context()).Subject)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, st)
	return nil
}

type limitReq struct {
	Kind   string `json:"kind"`
	Period string `json:"period"`
	Amount *int64 `json:"amount"` // cents (minutes for session); null removes the limit
}

func (h *Handlers) SetLimit(w http.ResponseWriter, r *http.Request) error {
	var req limitReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	pid := auth.From(r.Context()).Subject
	var res SetLimitResult
	err := pgx.BeginFunc(r.Context(), h.Pool, func(tx pgx.Tx) (err error) {
		res, err = SetLimit(r.Context(), tx, pid, req.Kind, req.Period, req.Amount, Actor{})
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, res)
	return nil
}

func (h *Handlers) SetRealityCheck(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Minutes int `json:"minutes"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	pid := auth.From(r.Context()).Subject
	err := pgx.BeginFunc(r.Context(), h.Pool, func(tx pgx.Tx) error { return SetRealityCheck(r.Context(), tx, pid, req.Minutes, Actor{}) })
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"reality_check_minutes": req.Minutes})
	return nil
}

func (h *Handlers) Exclude(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Duration string `json:"duration"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	pid := auth.From(r.Context()).Subject
	var e *Exclusion
	err := pgx.BeginFunc(r.Context(), h.Pool, func(tx pgx.Tx) (err error) {
		e, err = Exclude(r.Context(), tx, pid, req.Duration, Actor{})
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"exclusion": e})
	return nil
}

func (h *Handlers) RequestReopen(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var e *Exclusion
	err := pgx.BeginFunc(r.Context(), h.Pool, func(tx pgx.Tx) (err error) {
		e, err = RequestReopen(r.Context(), tx, pid)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"exclusion": e})
	return nil
}

func (h *Handlers) Ping(w http.ResponseWriter, r *http.Request) error {
	s, err := Ping(r.Context(), h.Pool, auth.From(r.Context()).Subject)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, s)
	return nil
}
