package games

// Shared bet flow of the A2 Originals: game lookup, bonus max bet, responsible gaming limits,
// the wallet debit (real first, then bonus), VIP/wagering accounting and the provably fair nonce.

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/rg"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// MinOriginalsBet is the minimum stake in every original, in cents.
const MinOriginalsBet = 10

// placedBet is a bet that has been charged; Seed holds the seed pair and the nonce it used.
type placedBet struct {
	Slug    string
	GameID  int64
	RoundID string
	Amount  int64
	Real    int64
	Bonus   int64
	Seed    seedState
}

func checkAmount(amount int64) error {
	if amount < MinOriginalsBet {
		return httpx.Err(400, "bad_amount", "minimum bet is $0.10")
	}
	return nil
}

// placeBet charges a bet on an original inside tx and advances the player's nonce.
func (s *Service) placeBet(ctx context.Context, tx pgx.Tx, pid uuid.UUID, slug string, amount int64) (placedBet, error) {
	p := placedBet{Slug: slug, Amount: amount}
	if err := tx.QueryRow(ctx, `SELECT id FROM games WHERE slug=$1 AND status='live'`, slug).Scan(&p.GameID); err != nil {
		return p, httpx.Err(404, "game_not_found", slug+" is not available")
	}
	if err := s.Promo.CheckBet(ctx, tx, pid, amount); err != nil {
		return p, err
	}
	st, err := s.loadSeed(ctx, tx, pid)
	if err != nil {
		return p, err
	}
	p.Seed = st
	p.RoundID = fmt.Sprintf("%s:%s:%d", pid, hashSeed(st.ServerSeed)[:16], st.Nonce)
	key := slug + ":bet:" + p.RoundID
	if err := rg.CheckBet(ctx, tx, pid, amount, key); err != nil {
		return p, err
	}
	p.Real, p.Bonus, _, err = s.Wallet.Bet(ctx, tx, pid, amount, key, map[string]any{"round_id": p.RoundID, "game_id": p.GameID})
	if errors.Is(err, wallet.ErrInsufficientFunds) {
		return p, httpx.Err(402, "insufficient_funds", "insufficient funds")
	}
	if err != nil {
		return p, err
	}
	if err := s.Promo.OnBet(ctx, tx, pid, p.GameID, p.Real, p.Bonus); err != nil {
		return p, err
	}
	if _, err := tx.Exec(ctx, `UPDATE fair_seeds SET nonce=nonce+1 WHERE player_id=$1`, pid); err != nil {
		return p, err
	}
	return p, nil
}

// fairDetails are the provably fair fields stored with every round and returned to the player.
func (p placedBet) fairDetails() map[string]any {
	return map[string]any{"game": p.Slug, "nonce": p.Seed.Nonce, "client_seed": p.Seed.ClientSeed, "server_seed_hash": hashSeed(p.Seed.ServerSeed)}
}

// creditWin pays a win in the same real/bonus proportion as the stake; returns the bonus part.
func (s *Service) creditWin(ctx context.Context, tx pgx.Tx, pid uuid.UUID, slug, roundID string, amount, betBonus, win int64) (int64, error) {
	if win <= 0 {
		return 0, nil
	}
	winBonus := win * betBonus / amount
	_, err := s.Wallet.Win(ctx, tx, pid, win-winBonus, winBonus, slug+":win:"+roundID, map[string]any{"round_id": roundID})
	return winBonus, err
}

// playInstant runs a single-step original (Dice, Crash, Plinko): play computes the payout and the
// round details from the seed pair; the round is recorded as settled in game_rounds.
func (s *Service) playInstant(w http.ResponseWriter, r *http.Request, slug string, amount int64,
	play func(st seedState) (win int64, details map[string]any)) error {
	pid := auth.From(r.Context()).Subject
	if err := checkAmount(amount); err != nil {
		return err
	}
	if err := s.checkPlayerCanPlay(r.Context(), pid); err != nil {
		return err
	}
	var resp map[string]any
	err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		p, err := s.placeBet(ctx, tx, pid, slug, amount)
		if err != nil {
			return err
		}
		win, details := play(p.Seed)
		for k, v := range p.fairDetails() {
			details[k] = v
		}
		winBonus, err := s.creditWin(ctx, tx, pid, slug, p.RoundID, amount, p.Bonus, win)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO game_rounds (provider, round_id, player_id, game_id, bet_real, bet_bonus, win_real, win_bonus, status, details, settled_at)
			VALUES ('originals',$1,$2,$3,$4,$5,$6,$7,'settled',$8,now())`, p.RoundID, pid, p.GameID, p.Real, p.Bonus, win-winBonus, winBonus, details); err != nil {
			return err
		}
		bal, err := s.Wallet.Balances(ctx, tx, pid)
		if err != nil {
			return err
		}
		details["bet"] = amount
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
