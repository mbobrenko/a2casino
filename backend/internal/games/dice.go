package games

// Dice is an in-house ("originals") game with provably fair results:
// roll = HMAC-SHA256(server_seed, client_seed:nonce). The player sees the hash of
// the server seed before betting and gets the seed itself when rotating it.
// The seed pair (fair_seeds) is shared by all originals; see fair.go.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

const diceEdge = 1.0 // house edge, percent

// DiceRoll returns a number in [0.00, 99.99] as hundredths (0..9999).
func DiceRoll(serverSeed, clientSeed string, nonce int64) int {
	m := hmac.New(sha256.New, []byte(serverSeed))
	fmt.Fprintf(m, "%s:%d", clientSeed, nonce)
	sum := m.Sum(nil)
	return int(binary.BigEndian.Uint32(sum[:4]) % 10000)
}

func hashSeed(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

type seedState struct {
	ServerSeed, ClientSeed string
	Nonce                  int64
	Prev                   *string
}

func (s *Service) loadSeed(ctx context.Context, tx pgx.Tx, pid uuid.UUID) (seedState, error) {
	if _, err := tx.Exec(ctx, `INSERT INTO fair_seeds (player_id, server_seed, client_seed) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, pid, randomHex(32), randomHex(8)); err != nil {
		return seedState{}, err
	}
	var st seedState
	err := tx.QueryRow(ctx, `SELECT server_seed, client_seed, nonce, prev_server_seed FROM fair_seeds WHERE player_id=$1 FOR UPDATE`, pid).
		Scan(&st.ServerSeed, &st.ClientSeed, &st.Nonce, &st.Prev)
	return st, err
}

func seedView(st seedState) map[string]any {
	return map[string]any{"server_seed_hash": hashSeed(st.ServerSeed), "client_seed": st.ClientSeed, "nonce": st.Nonce, "previous_server_seed": st.Prev}
}

func (s *Service) DiceSeed(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		st, err := s.loadSeed(r.Context(), tx, pid)
		if err != nil {
			return err
		}
		httpx.JSON(w, 200, seedView(st))
		return nil
	})
}

// DiceRotate reveals the current server seed and starts a new one.
func (s *Service) DiceRotate(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req struct {
		ClientSeed string `json:"client_seed"`
	}
	_ = httpx.Decode(r, &req)
	if req.ClientSeed == "" {
		req.ClientSeed = randomHex(8)
	}
	if len(req.ClientSeed) > 64 {
		return httpx.Err(400, "bad_client_seed", "client_seed is too long")
	}
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		st, err := s.loadSeed(r.Context(), tx, pid)
		if err != nil {
			return err
		}
		// Revealing the server seed would reveal the mines of an unfinished Mines round.
		var open bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM mines_rounds WHERE player_id=$1 AND status='open')`, pid).Scan(&open); err != nil {
			return err
		}
		if open {
			return httpx.Err(409, "round_open", "finish your Mines round before rotating the seed")
		}
		next := seedState{ServerSeed: randomHex(32), ClientSeed: req.ClientSeed, Prev: &st.ServerSeed}
		if _, err := tx.Exec(r.Context(), `UPDATE fair_seeds SET server_seed=$2, client_seed=$3, nonce=0, prev_server_seed=$4 WHERE player_id=$1`,
			pid, next.ServerSeed, next.ClientSeed, st.ServerSeed); err != nil {
			return err
		}
		httpx.JSON(w, 200, seedView(next))
		return nil
	})
}

type diceReq struct {
	Amount int64   `json:"amount"` // cents
	Target float64 `json:"target"` // win if roll < target, 2..98
}

func (s *Service) DiceBet(w http.ResponseWriter, r *http.Request) error {
	var req diceReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Target < 2 || req.Target > 98 {
		return httpx.Err(400, "bad_target", "target must be between 2 and 98")
	}
	return s.playInstant(w, r, "dice", req.Amount, func(st seedState) (int64, map[string]any) {
		roll := DiceRoll(st.ServerSeed, st.ClientSeed, st.Nonce)
		multiplier := (100 - diceEdge) / req.Target
		win := int64(0)
		if float64(roll)/100 < req.Target {
			win = int64(float64(req.Amount) * multiplier)
		}
		return win, map[string]any{"roll": float64(roll) / 100, "target": req.Target, "multiplier": multiplier}
	})
}
