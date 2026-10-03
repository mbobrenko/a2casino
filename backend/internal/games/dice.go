package games

// Dice is an in-house ("originals") game with provably fair results:
// roll = HMAC-SHA256(server_seed, client_seed:nonce). The player sees the hash of
// the server seed before betting and gets the seed itself when rotating it.

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
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
	pid := auth.From(r.Context()).Subject
	var req diceReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Target < 2 || req.Target > 98 {
		return httpx.Err(400, "bad_target", "target must be between 2 and 98")
	}
	if req.Amount < 10 {
		return httpx.Err(400, "bad_amount", "minimum bet is $0.10")
	}
	if err := s.checkPlayerCanPlay(r.Context(), pid); err != nil {
		return err
	}
	var resp map[string]any
	err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		var gid int64
		if err := tx.QueryRow(ctx, `SELECT id FROM games WHERE slug='dice' AND status='live'`).Scan(&gid); err != nil {
			return httpx.Err(404, "game_not_found", "dice is not available")
		}
		st, err := s.loadSeed(ctx, tx, pid)
		if err != nil {
			return err
		}
		roundID := fmt.Sprintf("%s:%s:%d", pid, hashSeed(st.ServerSeed)[:16], st.Nonce)
		real, bonus, _, err := s.Wallet.Bet(ctx, tx, pid, req.Amount, "dice:bet:"+roundID, map[string]any{"round_id": roundID, "game_id": gid})
		if errors.Is(err, wallet.ErrInsufficientFunds) {
			return httpx.Err(402, "insufficient_funds", "insufficient funds")
		}
		if err != nil {
			return err
		}
		roll := DiceRoll(st.ServerSeed, st.ClientSeed, st.Nonce)
		multiplier := (100 - diceEdge) / req.Target
		win := int64(0)
		if float64(roll)/100 < req.Target {
			win = int64(float64(req.Amount) * multiplier)
		}
		winBonus := int64(0)
		if win > 0 {
			winBonus = win * bonus / req.Amount
			if _, err := s.Wallet.Win(ctx, tx, pid, win-winBonus, winBonus, "dice:win:"+roundID, map[string]any{"round_id": roundID}); err != nil {
				return err
			}
		}
		details := map[string]any{"roll": float64(roll) / 100, "target": req.Target, "multiplier": multiplier, "nonce": st.Nonce, "client_seed": st.ClientSeed, "server_seed_hash": hashSeed(st.ServerSeed)}
		if _, err := tx.Exec(ctx, `INSERT INTO game_rounds (provider, round_id, player_id, game_id, bet_real, bet_bonus, win_real, win_bonus, status, details, settled_at)
			VALUES ('originals',$1,$2,$3,$4,$5,$6,$7,'settled',$8,now())`, roundID, pid, gid, real, bonus, win-winBonus, winBonus, details); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE fair_seeds SET nonce=nonce+1 WHERE player_id=$1`, pid); err != nil {
			return err
		}
		bal, err := s.Wallet.Balances(ctx, tx, pid)
		if err != nil {
			return err
		}
		details["win"] = win
		details["balance"] = bal
		resp = details
		return nil
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, resp)
	return nil
}
