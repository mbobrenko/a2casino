package games

// Mines: a 5×5 board with 1–24 mines. Starting a round charges the bet and fixes the mines from
// the seed pair (MinesPositions); the player reveals tiles one by one and can cash out after any
// safe tile at R × C(25, n) / C(25 − mines, n), where R is the RTP the round was started at (a
// later RTP change does not affect an open round). Payouts are capped at the game's max win per bet
// (also fixed at the start); once the cap is reached the round is cashed out automatically. Hitting
// a mine loses the bet. A player has at most one open round; it survives page reloads (GET current).
// Rounds left open for 24 hours are cashed out automatically at their current multiplier
// (CloseStaleMines).

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

// MinesStaleAfter is how long a round may stay open before it is cashed out automatically.
const MinesStaleAfter = 24 * time.Hour

type minesRound struct {
	ID         int64
	PlayerID   uuid.UUID
	GameID     int64
	RoundID    string
	Amount     int64
	BetBonus   int64
	Mines      int
	Revealed   []int
	ServerSeed string
	ClientSeed string
	Nonce      int64
	Status     string
	Win        int64
	CreatedAt  time.Time
	RTP        int   // percent, fixed when the round starts
	MaxWin     int64 // cents, 0 = no cap; fixed when the round starts
}

const minesCols = `id, player_id, game_id, round_id, amount, bet_bonus, mines, revealed, server_seed, client_seed, nonce, status, win, created_at, rtp, COALESCE(max_win, 0)`

func scanMines(row pgx.Row) (*minesRound, error) {
	var m minesRound
	var revealed []int32
	err := row.Scan(&m.ID, &m.PlayerID, &m.GameID, &m.RoundID, &m.Amount, &m.BetBonus, &m.Mines, &revealed, &m.ServerSeed, &m.ClientSeed, &m.Nonce, &m.Status, &m.Win, &m.CreatedAt, &m.RTP, &m.MaxWin)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	for _, t := range revealed {
		m.Revealed = append(m.Revealed, int(t))
	}
	return &m, err
}

func (m *minesRound) positions() []int {
	return MinesPositions(m.ServerSeed, m.ClientSeed, m.Nonce, m.Mines)
}

// payout is what cashing out pays now: the multiplier's payout capped at the max win.
func (m *minesRound) payout() (int64, bool) {
	if len(m.Revealed) == 0 {
		return m.Amount, false // the stake back (stale round auto cash-out)
	}
	return capWin(MinesPayout(m.Amount, m.Mines, len(m.Revealed), m.RTP), m.MaxWin)
}

// view is the round as the player sees it; mine positions only once the round is over.
func (m *minesRound) view() map[string]any {
	n := len(m.Revealed)
	payout, capped := m.payout()
	v := map[string]any{
		"id": m.ID, "bet": m.Amount, "mines": m.Mines, "revealed": orEmptyInts(m.Revealed), "status": m.Status, "win": m.Win,
		"multiplier": MinesMultiplier(m.Mines, n, m.RTP), "payout": payout, "rtp": m.RTP, "max_win": m.MaxWin, "max_win_reached": capped,
		"nonce": m.Nonce, "client_seed": m.ClientSeed, "server_seed_hash": hashSeed(m.ServerSeed), "created_at": m.CreatedAt,
	}
	if n < MinesTiles-m.Mines && !capped {
		v["next_multiplier"] = MinesMultiplier(m.Mines, n+1, m.RTP)
	}
	if m.Status != "open" {
		v["mines_positions"] = m.positions()
	}
	return v
}

func orEmptyInts(a []int) []int {
	if a == nil {
		return []int{}
	}
	return a
}

func (s *Service) openMines(ctx context.Context, tx pgx.Tx, pid uuid.UUID) (*minesRound, error) {
	return scanMines(tx.QueryRow(ctx, `SELECT `+minesCols+` FROM mines_rounds WHERE player_id=$1 AND status='open' FOR UPDATE`, pid))
}

// finishMines closes the round as lost (win 0) or cashed (pays the current multiplier) and
// settles its game_rounds row.
func (s *Service) finishMines(ctx context.Context, tx pgx.Tx, m *minesRound, status string, auto bool) error {
	win, capped := int64(0), false
	if status == "cashed" {
		win, capped = m.payout()
	}
	winBonus, err := s.creditWin(ctx, tx, m.PlayerID, "mines", m.RoundID, m.Amount, m.BetBonus, win)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE mines_rounds SET status=$2, win=$3, finished_at=now() WHERE id=$1`, m.ID, status, win); err != nil {
		return err
	}
	m.Status, m.Win = status, win
	details := map[string]any{
		"game": "mines", "mines": m.Mines, "revealed": orEmptyInts(m.Revealed), "mines_positions": m.positions(),
		"multiplier": MinesMultiplier(m.Mines, len(m.Revealed), m.RTP), "result": status, "auto_cashout": auto,
		"rtp": m.RTP, "max_win": m.MaxWin, "max_win_applied": capped,
		"nonce": m.Nonce, "client_seed": m.ClientSeed, "server_seed_hash": hashSeed(m.ServerSeed),
	}
	_, err = tx.Exec(ctx, `UPDATE game_rounds SET win_real=$2, win_bonus=$3, status='settled', details=$4, settled_at=now()
		WHERE provider='originals' AND round_id=$1`, m.RoundID, win-winBonus, winBonus, details)
	return err
}

func (s *Service) minesReply(ctx context.Context, w http.ResponseWriter, tx pgx.Tx, pid uuid.UUID, m *minesRound) error {
	bal, err := s.Wallet.Balances(ctx, tx, pid)
	if err != nil {
		return err
	}
	var round any
	if m != nil {
		round = m.view()
	}
	httpx.JSON(w, 200, map[string]any{"round": round, "balance": bal})
	return nil
}

func (s *Service) MinesStart(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req struct {
		Amount int64 `json:"amount"`
		Mines  int   `json:"mines"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Mines < 1 || req.Mines > 24 {
		return httpx.Err(400, "bad_mines", "choose 1 to 24 mines")
	}
	if err := checkAmount(req.Amount); err != nil {
		return err
	}
	if err := s.checkPlayerCanPlay(r.Context(), pid); err != nil {
		return err
	}
	err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		// The seed row lock serialises a player's originals bets.
		if _, err := s.loadSeed(ctx, tx, pid); err != nil {
			return err
		}
		if open, err := s.openMines(ctx, tx, pid); err != nil {
			return err
		} else if open != nil {
			return httpx.Err(409, "round_open", "you already have a Mines round in progress")
		}
		p, err := s.placeBet(ctx, tx, pid, "mines", req.Amount)
		if err != nil {
			return err
		}
		details := p.fairDetails()
		details["mines"] = req.Mines
		if _, err := tx.Exec(ctx, `INSERT INTO game_rounds (provider, round_id, player_id, game_id, bet_real, bet_bonus, status, details)
			VALUES ('originals',$1,$2,$3,$4,$5,'open',$6)`, p.RoundID, pid, p.GameID, p.Real, p.Bonus, details); err != nil {
			return err
		}
		m, err := scanMines(tx.QueryRow(ctx, `INSERT INTO mines_rounds (player_id, game_id, round_id, amount, bet_real, bet_bonus, mines, server_seed, client_seed, nonce, rtp, max_win)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULLIF($12::bigint, 0)) RETURNING `+minesCols,
			pid, p.GameID, p.RoundID, req.Amount, p.Real, p.Bonus, req.Mines, p.Seed.ServerSeed, p.Seed.ClientSeed, p.Seed.Nonce, p.RTP, p.MaxWin))
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return httpx.Err(409, "round_open", "you already have a Mines round in progress")
		}
		if err != nil {
			return err
		}
		return s.minesReply(ctx, w, tx, pid, m)
	})
	return err
}

func (s *Service) MinesReveal(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req struct {
		Tile *int `json:"tile"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Tile == nil || *req.Tile < 0 || *req.Tile >= MinesTiles {
		return httpx.Err(400, "bad_tile", "tile must be 0 to 24")
	}
	tile := *req.Tile
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		m, err := s.openMines(ctx, tx, pid)
		if err != nil {
			return err
		}
		if m == nil {
			return httpx.Err(409, "no_round", "start a Mines round first")
		}
		if slices.Contains(m.Revealed, tile) {
			return httpx.Err(409, "already_revealed", "this tile is already revealed")
		}
		m.Revealed = append(m.Revealed, tile)
		if _, err := tx.Exec(ctx, `UPDATE mines_rounds SET revealed=$2 WHERE id=$1`, m.ID, m.Revealed); err != nil {
			return err
		}
		switch {
		case slices.Contains(m.positions(), tile):
			err = s.finishMines(ctx, tx, m, "lost", false)
		case len(m.Revealed) == MinesTiles-m.Mines: // every safe tile found: cash out
			err = s.finishMines(ctx, tx, m, "cashed", true)
		default:
			if _, capped := m.payout(); capped { // max win reached: nothing more to win
				err = s.finishMines(ctx, tx, m, "cashed", true)
			}
		}
		if err != nil {
			return err
		}
		return s.minesReply(ctx, w, tx, pid, m)
	})
}

func (s *Service) MinesCashout(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		ctx := r.Context()
		m, err := s.openMines(ctx, tx, pid)
		if err != nil {
			return err
		}
		if m == nil {
			return httpx.Err(409, "no_round", "no Mines round in progress")
		}
		if len(m.Revealed) == 0 {
			return httpx.Err(409, "nothing_revealed", "reveal at least one tile before cashing out")
		}
		if err := s.finishMines(ctx, tx, m, "cashed", false); err != nil {
			return err
		}
		return s.minesReply(ctx, w, tx, pid, m)
	})
}

// MinesCurrent returns the open round (null when there is none) so the game resumes after a reload.
func (s *Service) MinesCurrent(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		m, err := scanMines(tx.QueryRow(r.Context(), `SELECT `+minesCols+` FROM mines_rounds WHERE player_id=$1 AND status='open'`, pid))
		if err != nil {
			return err
		}
		return s.minesReply(r.Context(), w, tx, pid, m)
	})
}

// CloseStaleMines cashes out rounds open longer than maxAge at their current multiplier
// (a round with no tile revealed returns the stake). Returns how many rounds were closed.
func (s *Service) CloseStaleMines(ctx context.Context, maxAge time.Duration) (int, error) {
	rows, err := s.Wallet.Pool.Query(ctx, `SELECT id FROM mines_rounds WHERE status='open' AND created_at < now() - make_interval(secs => $1) ORDER BY id LIMIT 500`,
		maxAge.Seconds())
	if err != nil {
		return 0, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
	if err != nil {
		return 0, err
	}
	closed := 0
	for _, id := range ids {
		err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
			m, err := scanMines(tx.QueryRow(ctx, `SELECT `+minesCols+` FROM mines_rounds WHERE id=$1 AND status='open' FOR UPDATE`, id))
			if err != nil || m == nil {
				return err
			}
			closed++
			return s.finishMines(ctx, tx, m, "cashed", true)
		})
		if err != nil {
			return closed, err
		}
	}
	return closed, nil
}
