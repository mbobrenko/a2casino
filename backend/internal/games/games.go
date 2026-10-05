// Package games serves the lobby catalog, launches games and implements the
// seamless-wallet callbacks that game providers call for bet, win and rollback.
package games

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/player"
	"github.com/mbobrenko/a2casino/backend/internal/promo"
	"github.com/mbobrenko/a2casino/backend/internal/rg"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

type Service struct {
	Cfg    config.Config
	Wallet *wallet.Wallet
	Auth   *auth.Issuer
	Promo  *promo.Service
}

type Game struct {
	ID          int64    `json:"id"`
	Slug        string   `json:"slug"`
	Title       string   `json:"title"`
	Provider    string   `json:"provider"`
	Category    string   `json:"category"`
	RTP         *float64 `json:"rtp"`
	IsNew       bool     `json:"is_new"`
	Studio      string   `json:"studio"`
	Emoji       string   `json:"emoji"`
	Color       string   `json:"color"`
	Tags        []string `json:"tags"`
	Description string   `json:"description"`
}

// gameCols matches the Game struct field order (alias g).
const gameCols = `g.id, g.slug, g.title, g.provider, g.category, g.rtp::float8, g.is_new, g.studio, g.emoji, g.color, g.tags, g.description`

// visibleGames is the WHERE clause for games a player in country $1 may see.
const visibleGames = `g.status='live' AND NOT ($1 = ANY(g.blocked_countries))
	AND NOT EXISTS (SELECT 1 FROM providers p WHERE p.code=g.studio AND (p.status<>'live' OR $1 = ANY(p.blocked_countries)))`

// Lobby lists live games, hiding those blocked for the request's country.
// Filters: category, studio, q (title search), tag.
func (s *Service) Lobby(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	search := strings.TrimSpace(q.Get("q"))
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT `+gameCols+` FROM games g
		WHERE `+visibleGames+` AND ($2='' OR g.category=$2) AND ($3='' OR g.studio=$3)
		AND ($4='' OR g.title ILIKE '%' || $4 || '%') AND ($5='' OR $5 = ANY(g.tags))
		ORDER BY g.sort_order, g.id`, player.Country(r), q.Get("category"), q.Get("studio"), search, q.Get("tag"))
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Game])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{
		"categories": []string{"slots", "crash", "table", "instant", "dice"},
		"games":      list,
	})
	return nil
}

func (s *Service) Launch(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var g Game
	var status string
	err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT `+gameCols+`, g.status FROM games g WHERE g.slug=$1`,
		chi.URLParam(r, "slug")).Scan(&g.ID, &g.Slug, &g.Title, &g.Provider, &g.Category, &g.RTP, &g.IsNew, &g.Studio, &g.Emoji, &g.Color, &g.Tags, &g.Description, &status)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && status != "live") {
		return httpx.Err(404, "game_not_found", "game not found")
	}
	if err != nil {
		return err
	}
	if err := s.checkPlayerCanPlay(r.Context(), pid); err != nil {
		return err
	}
	if g.Provider == "originals" {
		httpx.JSON(w, 200, map[string]any{"type": "originals", "game": g})
		return nil
	}
	token := randomHex(24)
	if _, err := s.Wallet.Pool.Exec(r.Context(), `INSERT INTO game_sessions (token, player_id, game_id) VALUES ($1,$2,$3)`, token, pid, g.ID); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{
		"type": "iframe", "game": g,
		"url": s.Cfg.PublicURL + "/mockprovider/game?token=" + token,
	})
	return nil
}

func (s *Service) checkPlayerCanPlay(ctx context.Context, pid uuid.UUID) error {
	var status string
	if err := s.Wallet.Pool.QueryRow(ctx, `SELECT status FROM players WHERE id=$1`, pid).Scan(&status); err != nil {
		return err
	}
	if status != "active" {
		return httpx.Err(403, "blocked", "account is blocked")
	}
	return rg.CheckPlay(ctx, s.Wallet.Pool, pid)
}

// ---- Seamless wallet callbacks (provider -> casino) ----

type cbReq struct {
	Token   string `json:"token"`
	RoundID string `json:"round_id"`
	TxID    string `json:"tx_id"`
	Amount  int64  `json:"amount"`
}

type cbResp struct {
	Balance  int64  `json:"balance"`
	Currency string `json:"currency"`
}

func Sign(secret string, body []byte) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hex.EncodeToString(m.Sum(nil))
}

// verified reads the body and checks the provider's HMAC signature.
func (s *Service) verified(r *http.Request, v any) error {
	body, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, 1<<16))
	if err != nil {
		return httpx.Err(400, "bad_body", "cannot read body")
	}
	if !hmac.Equal([]byte(r.Header.Get("X-Signature")), []byte(Sign(s.Cfg.MockProviderSecret, body))) {
		return httpx.Err(401, "bad_signature", "invalid signature")
	}
	r.Body = io.NopCloser(strings.NewReader(string(body)))
	return httpx.Decode(r, v)
}

func (s *Service) session(ctx context.Context, q pgx.Tx, token string) (uuid.UUID, int64, error) {
	var pid uuid.UUID
	var gid int64
	var pstatus string
	err := q.QueryRow(ctx, `SELECT s.player_id, s.game_id, p.status FROM game_sessions s JOIN players p ON p.id=s.player_id WHERE s.token=$1`, token).Scan(&pid, &gid, &pstatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return pid, 0, httpx.Err(401, "invalid_session", "unknown session token")
	}
	if err == nil && pstatus != "active" {
		return pid, 0, httpx.Err(403, "player_blocked", "player is blocked")
	}
	return pid, gid, err
}

func (s *Service) respond(ctx context.Context, w http.ResponseWriter, tx pgx.Tx, pid uuid.UUID) error {
	b, err := s.Wallet.Balances(ctx, tx, pid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, cbResp{Balance: b.Real + b.Bonus, Currency: b.Currency})
	return nil
}

func (s *Service) CBBalance(w http.ResponseWriter, r *http.Request) error {
	var req cbReq
	if err := s.verified(r, &req); err != nil {
		return err
	}
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		pid, _, err := s.session(r.Context(), tx, req.Token)
		if err != nil {
			return err
		}
		return s.respond(r.Context(), w, tx, pid)
	})
}

func (s *Service) CBBet(w http.ResponseWriter, r *http.Request) error {
	var req cbReq
	if err := s.verified(r, &req); err != nil {
		return err
	}
	if req.RoundID == "" || req.TxID == "" {
		return httpx.Err(400, "bad_request", "round_id and tx_id are required")
	}
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		pid, gid, err := s.session(ctx, tx, req.Token)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO game_rounds (provider, round_id, player_id, game_id) VALUES ('mock',$1,$2,$3) ON CONFLICT DO NOTHING`, req.RoundID, pid, gid); err != nil {
			return err
		}
		var status string
		if err := tx.QueryRow(ctx, `SELECT status FROM game_rounds WHERE provider='mock' AND round_id=$1 FOR UPDATE`, req.RoundID).Scan(&status); err != nil {
			return err
		}
		if status == "rolled_back" {
			return httpx.Err(409, "round_closed", "round was rolled back")
		}
		if err := rg.CheckBet(ctx, tx, pid, req.Amount, "mock:bet:"+req.TxID); err != nil {
			return err
		}
		real, bonus, res, err := s.Wallet.Bet(ctx, tx, pid, req.Amount, "mock:bet:"+req.TxID, map[string]any{"round_id": req.RoundID, "game_id": gid})
		if errors.Is(err, wallet.ErrInsufficientFunds) {
			return httpx.Err(402, "insufficient_funds", "insufficient funds")
		}
		if err != nil {
			return err
		}
		if !res.Duplicate {
			if _, err := tx.Exec(ctx, `UPDATE game_rounds SET bet_real=bet_real+$2, bet_bonus=bet_bonus+$3 WHERE provider='mock' AND round_id=$1`, req.RoundID, real, bonus); err != nil {
				return err
			}
			if err := s.Promo.OnBet(ctx, tx, pid, real, bonus); err != nil {
				return err
			}
		}
		return s.respond(ctx, w, tx, pid)
	})
}

func (s *Service) CBWin(w http.ResponseWriter, r *http.Request) error {
	var req cbReq
	if err := s.verified(r, &req); err != nil {
		return err
	}
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		pid, _, err := s.session(ctx, tx, req.Token)
		if err != nil {
			return err
		}
		var betReal, betBonus int64
		var status string
		err = tx.QueryRow(ctx, `SELECT bet_real, bet_bonus, status FROM game_rounds WHERE provider='mock' AND round_id=$1 AND player_id=$2 FOR UPDATE`, req.RoundID, pid).Scan(&betReal, &betBonus, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return httpx.Err(404, "round_not_found", "unknown round")
		}
		if err != nil {
			return err
		}
		if status == "rolled_back" {
			return httpx.Err(409, "round_closed", "round was rolled back")
		}
		// Credit the win back in the same proportion as the bet was funded.
		toBonus := int64(0)
		if betReal+betBonus > 0 {
			toBonus = req.Amount * betBonus / (betReal + betBonus)
		}
		toReal := req.Amount - toBonus
		res, err := s.Wallet.Win(ctx, tx, pid, toReal, toBonus, "mock:win:"+req.TxID, map[string]any{"round_id": req.RoundID})
		if err != nil {
			return err
		}
		if !res.Duplicate {
			if _, err := tx.Exec(ctx, `UPDATE game_rounds SET win_real=win_real+$2, win_bonus=win_bonus+$3, status='settled', settled_at=now() WHERE provider='mock' AND round_id=$1`, req.RoundID, toReal, toBonus); err != nil {
				return err
			}
		}
		return s.respond(ctx, w, tx, pid)
	})
}

func (s *Service) CBRollback(w http.ResponseWriter, r *http.Request) error {
	var req cbReq
	if err := s.verified(r, &req); err != nil {
		return err
	}
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		pid, _, err := s.session(ctx, tx, req.Token)
		if err != nil {
			return err
		}
		var betReal, betBonus int64
		var status string
		err = tx.QueryRow(ctx, `SELECT bet_real, bet_bonus, status FROM game_rounds WHERE provider='mock' AND round_id=$1 AND player_id=$2 FOR UPDATE`, req.RoundID, pid).Scan(&betReal, &betBonus, &status)
		if errors.Is(err, pgx.ErrNoRows) || status != "open" {
			// Nothing to refund (unknown or already closed round): acknowledge so the provider stops retrying.
			return s.respond(ctx, w, tx, pid)
		}
		if err != nil {
			return err
		}
		if _, err := s.Wallet.Refund(ctx, tx, pid, betReal, betBonus, "mock:rollback:"+req.TxID, map[string]any{"round_id": req.RoundID}); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE game_rounds SET status='rolled_back', settled_at=now() WHERE provider='mock' AND round_id=$1`, req.RoundID); err != nil {
			return err
		}
		return s.respond(ctx, w, tx, pid)
	})
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
