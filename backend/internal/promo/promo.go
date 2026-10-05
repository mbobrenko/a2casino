// Package promo runs bonuses (deposit match, no-deposit, free spins) with wagering,
// promo codes and the VIP programme (levels, cashback, rakeback).
//
// Rules, kept deliberately simple for v0.2:
//   - a player has at most one active bonus; deposit offers wait as "pending" until a qualifying deposit;
//   - every bet (real or bonus money) counts toward the active bonus's wagering, weighted by the
//     game's wagering_contribution (Dice 10%, other games 100% by default);
//   - while a bonus is active, a bet above the bonus's max_bet ($5 by default) is refused;
//   - when wagering is complete the whole bonus balance becomes real money;
//   - cancelling, or letting an active bonus expire, forfeits the remaining bonus balance;
//   - withdrawals are refused while a bonus is active (the player cancels it first).
package promo

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/rg"
	"github.com/mbobrenko/a2casino/backend/internal/slot"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

type Service struct {
	Wallet *wallet.Wallet
}

type Bonus struct {
	ID              int64  `json:"id"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	Kind            string `json:"kind"`
	Trigger         string `json:"trigger"`
	Percent         int    `json:"percent"`
	MaxAmount       int64  `json:"max_amount"`
	FixedAmount     int64  `json:"fixed_amount"`
	MinDeposit      int64  `json:"min_deposit"`
	WagerMultiplier int    `json:"wager_multiplier"`
	FreespinsCount  int    `json:"freespins_count"`
	FreespinValue   int64  `json:"freespin_value"`
	FreespinGame    string `json:"freespin_game"`
	ValidDays       int    `json:"valid_days"`
	Active          bool   `json:"active"`
	MaxBet          int64  `json:"max_bet"` // cents per bet while this bonus is active, 0 = no limit
}

const BonusColumns = `id, title, description, kind, trigger, percent, max_amount, fixed_amount, min_deposit,
	wager_multiplier, freespins_count, freespin_value, freespin_game, valid_days, active, max_bet`

func ScanBonus(row pgx.Row) (Bonus, error) {
	var b Bonus
	err := row.Scan(&b.ID, &b.Title, &b.Description, &b.Kind, &b.Trigger, &b.Percent, &b.MaxAmount, &b.FixedAmount,
		&b.MinDeposit, &b.WagerMultiplier, &b.FreespinsCount, &b.FreespinValue, &b.FreespinGame, &b.ValidDays, &b.Active, &b.MaxBet)
	return b, err
}

func loadBonus(ctx context.Context, q pgx.Tx, id int64) (Bonus, error) {
	return ScanBonus(q.QueryRow(ctx, `SELECT `+BonusColumns+` FROM bonuses WHERE id=$1`, id))
}

// PlayerBonus is a bonus given to a player, with the template's display fields.
type PlayerBonus struct {
	ID            int64      `json:"id"`
	BonusID       int64      `json:"bonus_id"`
	Title         string     `json:"title"`
	Description   string     `json:"description"`
	Kind          string     `json:"kind"`
	Status        string     `json:"status"`
	Source        string     `json:"source"`
	Amount        int64      `json:"amount"`
	WagerRequired int64      `json:"wager_required"`
	WagerProgress int64      `json:"wager_progress"`
	FreespinsLeft int        `json:"freespins_left"`
	FreespinsWon  int64      `json:"freespins_won"`
	FreespinGame  string     `json:"freespin_game"`
	MinDeposit    int64      `json:"min_deposit"`
	MaxBet        int64      `json:"max_bet"`
	CreatedAt     time.Time  `json:"created_at"`
	ExpiresAt     time.Time  `json:"expires_at"`
	FinishedAt    *time.Time `json:"finished_at"`
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func (s *Service) PlayerBonuses(ctx context.Context, q querier, player uuid.UUID, limit int) ([]PlayerBonus, error) {
	if q == nil {
		q = s.Wallet.Pool
	}
	rows, err := q.Query(ctx, `SELECT pb.id, pb.bonus_id, b.title, b.description, b.kind, pb.status, pb.source, pb.amount,
		pb.wager_required, pb.wager_progress, pb.freespins_left, pb.freespins_won, b.freespin_game, b.min_deposit, b.max_bet,
		pb.created_at, pb.expires_at, pb.finished_at
		FROM player_bonuses pb JOIN bonuses b ON b.id=pb.bonus_id
		WHERE pb.player_id=$1 ORDER BY (pb.status IN ('active','pending')) DESC, pb.created_at DESC LIMIT $2`, player, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[PlayerBonus])
}

var (
	ErrBonusActive = httpx.Err(409, "bonus_active", "finish or cancel the active bonus first")
	errNotFound    = httpx.Err(404, "not_found", "bonus not found")
)

// give creates a player bonus from a template. no_deposit and freespins bonuses start
// right away (and need no other active bonus); deposit_match waits for a deposit.
func (s *Service) give(ctx context.Context, tx pgx.Tx, player uuid.UUID, b Bonus, source string) (int64, error) {
	if !b.Active {
		return 0, httpx.Err(410, "bonus_inactive", "this bonus is no longer available")
	}
	if err := rg.CheckBonus(ctx, tx, player); err != nil {
		return 0, err
	}
	expires := time.Now().Add(time.Duration(max(b.ValidDays, 1)) * 24 * time.Hour)
	if b.Kind == "deposit_match" {
		var id int64
		err := tx.QueryRow(ctx, `INSERT INTO player_bonuses (player_id, bonus_id, status, source, expires_at) VALUES ($1,$2,'pending',$3,$4) RETURNING id`,
			player, b.ID, source, expires).Scan(&id)
		return id, uniqueAsConflict(err)
	}
	if active, err := hasActive(ctx, tx, player); err != nil || active {
		if err == nil {
			err = ErrBonusActive
		}
		return 0, err
	}
	var id int64
	err := tx.QueryRow(ctx, `INSERT INTO player_bonuses (player_id, bonus_id, status, source, amount, wager_required, freespins_left, activated_at, expires_at)
		VALUES ($1,$2,'active',$3,$4,$5,$6,now(),$7) RETURNING id`,
		player, b.ID, source, b.FixedAmount, b.FixedAmount*int64(b.WagerMultiplier), b.FreespinsCount, expires).Scan(&id)
	if err != nil {
		return 0, uniqueAsConflict(err)
	}
	if b.Kind == "no_deposit" && b.FixedAmount > 0 {
		if _, err := s.Wallet.GrantBonus(ctx, tx, player, b.FixedAmount, fmt.Sprintf("bonus:%d", id), map[string]any{"player_bonus_id": id, "bonus": b.Title}); err != nil {
			return 0, err
		}
	}
	return id, nil
}

func uniqueAsConflict(err error) error {
	if err != nil && strings.Contains(err.Error(), "23505") {
		return httpx.Err(409, "already_used", "this bonus was already used")
	}
	return err
}

func hasActive(ctx context.Context, tx pgx.Tx, player uuid.UUID) (bool, error) {
	var n int
	err := tx.QueryRow(ctx, `SELECT count(*) FROM player_bonuses WHERE player_id=$1 AND status='active'`, player).Scan(&n)
	return n > 0, err
}

// HasActive reports whether the player is playing through a bonus (withdrawals wait for it).
func (s *Service) HasActive(ctx context.Context, tx pgx.Tx, player uuid.UUID) (bool, error) {
	return hasActive(ctx, tx, player)
}

// OnRegister offers the welcome bonuses to a new player.
func (s *Service) OnRegister(ctx context.Context, tx pgx.Tx, player uuid.UUID) error {
	rows, err := tx.Query(ctx, `SELECT `+BonusColumns+` FROM bonuses WHERE trigger='welcome' AND active ORDER BY id`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Bonus, error) { return ScanBonus(r) })
	if err != nil {
		return err
	}
	for _, b := range list {
		if _, err := s.give(ctx, tx, player, b, "welcome"); err != nil && !isHTTP(err) {
			return err
		}
	}
	return nil
}

func isHTTP(err error) bool {
	var e *httpx.Error
	return errors.As(err, &e)
}

// OnDeposit activates the oldest pending deposit bonus the deposit qualifies for.
func (s *Service) OnDeposit(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64) error {
	if active, err := hasActive(ctx, tx, player); err != nil || active {
		return err
	}
	if off, err := rg.Suppressed(ctx, tx, player); err != nil || off {
		return err
	}
	var pbID int64
	var b Bonus
	err := tx.QueryRow(ctx, `SELECT pb.id, b.id FROM player_bonuses pb JOIN bonuses b ON b.id=pb.bonus_id
		WHERE pb.player_id=$1 AND pb.status='pending' AND pb.expires_at > now() AND b.min_deposit <= $2
		ORDER BY pb.created_at LIMIT 1 FOR UPDATE OF pb`, player, amount).Scan(&pbID, &b.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if b, err = loadBonus(ctx, tx, b.ID); err != nil {
		return err
	}
	bonus := amount * int64(b.Percent) / 100
	if b.MaxAmount > 0 {
		bonus = min(bonus, b.MaxAmount)
	}
	if bonus <= 0 {
		return nil
	}
	expires := time.Now().Add(time.Duration(max(b.ValidDays, 1)) * 24 * time.Hour)
	if _, err := tx.Exec(ctx, `UPDATE player_bonuses SET status='active', amount=$2, wager_required=$3, activated_at=now(), expires_at=$4 WHERE id=$1`,
		pbID, bonus, bonus*int64(b.WagerMultiplier), expires); err != nil {
		return err
	}
	_, err = s.Wallet.GrantBonus(ctx, tx, player, bonus, fmt.Sprintf("bonus:%d", pbID), map[string]any{"player_bonus_id": pbID, "bonus": b.Title, "deposit": amount})
	return err
}

// CheckBet enforces the active bonus's maximum bet (per bet, spin or round). It is called
// before the stake is taken; free spins are not bets and are not limited.
func (s *Service) CheckBet(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64) error {
	var maxBet int64
	err := tx.QueryRow(ctx, `SELECT b.max_bet FROM player_bonuses pb JOIN bonuses b ON b.id=pb.bonus_id
		WHERE pb.player_id=$1 AND pb.status='active' AND pb.expires_at > now()`, player).Scan(&maxBet)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if maxBet > 0 && amount > maxBet {
		return MaxBetError(maxBet)
	}
	return nil
}

// MaxBetError is the 400 returned for a bet above the bonus's limit.
func MaxBetError(maxBet int64) error {
	return httpx.Err(400, "max_bet_exceeded", fmt.Sprintf("the maximum bet while a bonus is active is $%.2f", float64(maxBet)/100))
}

// OnBet updates VIP turnover, rakeback and the active bonus's wagering after a bet on a game.
// The bet counts towards wagering by the game's wagering_contribution percentage.
func (s *Service) OnBet(ctx context.Context, tx pgx.Tx, player uuid.UUID, gameID, fromReal, fromBonus int64) error {
	if fromReal > 0 {
		var wagered int64
		var level int
		err := tx.QueryRow(ctx, `UPDATE players SET wagered_real = wagered_real + $2,
			rakeback_accrued = rakeback_accrued + $2::numeric * COALESCE((SELECT rakeback_pct FROM vip_levels WHERE level = players.vip_level), 0) / 100
			WHERE id=$1 RETURNING wagered_real, vip_level`, player, fromReal).Scan(&wagered, &level)
		if err != nil {
			return err
		}
		var newLevel int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(max(level),1) FROM vip_levels WHERE min_points <= $1`, wagered/100).Scan(&newLevel); err != nil {
			return err
		}
		if newLevel > level {
			if _, err := tx.Exec(ctx, `UPDATE players SET vip_level=$2 WHERE id=$1`, player, newLevel); err != nil {
				return err
			}
		}
	}
	contribution := 100
	if err := tx.QueryRow(ctx, `SELECT wagering_contribution FROM games WHERE id=$1`, gameID).Scan(&contribution); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	counted := (fromReal + fromBonus) * int64(contribution) / 100
	var pbID, required, progress int64
	var spinsLeft int
	err := tx.QueryRow(ctx, `UPDATE player_bonuses SET wager_progress = wager_progress + $2
		WHERE player_id=$1 AND status='active' AND expires_at > now()
		RETURNING id, wager_required, wager_progress, freespins_left`, player, counted).Scan(&pbID, &required, &progress, &spinsLeft)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if spinsLeft == 0 && progress >= required {
		return s.complete(ctx, tx, player, pbID)
	}
	return nil
}

func (s *Service) complete(ctx context.Context, tx pgx.Tx, player uuid.UUID, pbID int64) error {
	if _, err := s.Wallet.ReleaseBonus(ctx, tx, player, fmt.Sprintf("bonus-release:%d", pbID), map[string]any{"player_bonus_id": pbID}); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `UPDATE player_bonuses SET status='completed', finished_at=now() WHERE id=$1`, pbID)
	return err
}

// end closes a pending or active bonus as cancelled/expired; an active one loses its bonus balance.
func (s *Service) end(ctx context.Context, tx pgx.Tx, player uuid.UUID, pbID int64, status, fromStatus string) error {
	if fromStatus == "active" {
		if _, err := s.Wallet.ForfeitBonus(ctx, tx, player, fmt.Sprintf("bonus-forfeit:%d", pbID), map[string]any{"player_bonus_id": pbID, "reason": status}); err != nil {
			return err
		}
	}
	_, err := tx.Exec(ctx, `UPDATE player_bonuses SET status=$2, finished_at=now() WHERE id=$1`, pbID, status)
	return err
}

// Cancel ends one of the player's pending or active bonuses.
func (s *Service) Cancel(ctx context.Context, tx pgx.Tx, player uuid.UUID, pbID int64) error {
	var status string
	err := tx.QueryRow(ctx, `SELECT status FROM player_bonuses WHERE id=$1 AND player_id=$2 FOR UPDATE`, pbID, player).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return errNotFound
	}
	if err != nil {
		return err
	}
	if status != "active" && status != "pending" {
		return httpx.Err(409, "bonus_finished", "this bonus is already finished")
	}
	return s.end(ctx, tx, player, pbID, "cancelled", status)
}

// Redeem applies a promo code.
func (s *Service) Redeem(ctx context.Context, tx pgx.Tx, player uuid.UUID, code string) (int64, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	var bonusID int64
	var maxUses, uses int
	var active bool
	var expires *time.Time
	err := tx.QueryRow(ctx, `SELECT bonus_id, max_uses, uses, active, expires_at FROM promo_codes WHERE code=$1 FOR UPDATE`, code).
		Scan(&bonusID, &maxUses, &uses, &active, &expires)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, httpx.Err(404, "promo_not_found", "unknown promo code")
	}
	if err != nil {
		return 0, err
	}
	if !active || (expires != nil && expires.Before(time.Now())) || (maxUses > 0 && uses >= maxUses) {
		return 0, httpx.Err(410, "promo_expired", "promo code is no longer valid")
	}
	b, err := loadBonus(ctx, tx, bonusID)
	if err != nil {
		return 0, err
	}
	id, err := s.give(ctx, tx, player, b, "promo:"+code)
	if err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `UPDATE promo_codes SET uses=uses+1 WHERE code=$1`, code)
	return id, err
}

// ClaimOffer takes a deposit offer (trigger 'deposit') from the promo page.
func (s *Service) ClaimOffer(ctx context.Context, tx pgx.Tx, player uuid.UUID, bonusID int64) (int64, error) {
	b, err := loadBonus(ctx, tx, bonusID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && b.Trigger != "deposit") {
		return 0, errNotFound
	}
	if err != nil {
		return 0, err
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM player_bonuses WHERE player_id=$1 AND bonus_id=$2 AND status='pending'`, player, bonusID).Scan(&n); err != nil {
		return 0, err
	}
	if n > 0 {
		return 0, httpx.Err(409, "already_claimed", "this offer is already waiting for your deposit")
	}
	return s.give(ctx, tx, player, b, "offer")
}

// Grant gives a bonus from the back office.
func (s *Service) Grant(ctx context.Context, tx pgx.Tx, player uuid.UUID, bonusID int64) (int64, error) {
	b, err := loadBonus(ctx, tx, bonusID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errNotFound
	}
	if err != nil {
		return 0, err
	}
	return s.give(ctx, tx, player, b, "staff")
}

// FreeSpinResult is one server-side free spin.
type FreeSpinResult struct {
	Multiplier float64 `json:"multiplier"`
	Win        int64   `json:"win"`
	SpinsLeft  int     `json:"spins_left"`
	TotalWon   int64   `json:"total_won"`
	Finished   bool    `json:"finished"`
}

// FreeSpin plays one free spin of an active free-spins bonus. Wins go to the bonus balance;
// after the last spin the wagering requirement becomes total win x multiplier.
func (s *Service) FreeSpin(ctx context.Context, tx pgx.Tx, player uuid.UUID, pbID int64) (FreeSpinResult, error) {
	var res FreeSpinResult
	if err := rg.CheckBonus(ctx, tx, player); err != nil {
		return res, err
	}
	var bonusID int64
	var left int
	var won int64
	var status string
	err := tx.QueryRow(ctx, `SELECT bonus_id, status, freespins_left, freespins_won FROM player_bonuses WHERE id=$1 AND player_id=$2 FOR UPDATE`, pbID, player).
		Scan(&bonusID, &status, &left, &won)
	if errors.Is(err, pgx.ErrNoRows) {
		return res, errNotFound
	}
	if err != nil {
		return res, err
	}
	if status != "active" || left <= 0 {
		return res, httpx.Err(409, "no_freespins", "no free spins left")
	}
	b, err := loadBonus(ctx, tx, bonusID)
	if err != nil {
		return res, err
	}
	n := b.FreespinsCount - left + 1
	res.Multiplier = slot.Spin()
	res.Win = int64(math.Round(float64(b.FreespinValue) * res.Multiplier))
	if res.Win > 0 {
		if _, err := s.Wallet.GrantBonus(ctx, tx, player, res.Win, fmt.Sprintf("freespin:%d:%d", pbID, n), map[string]any{"player_bonus_id": pbID, "spin": n}); err != nil {
			return res, err
		}
	}
	var gameID int64
	if err := tx.QueryRow(ctx, `SELECT COALESCE((SELECT id FROM games WHERE slug=$1), (SELECT min(id) FROM games))`, b.FreespinGame).Scan(&gameID); err != nil {
		return res, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO game_rounds (provider, round_id, player_id, game_id, win_bonus, status, details, settled_at)
		VALUES ('freespins', $1, $2, $3, $4, 'settled', $5, now())`,
		fmt.Sprintf("%d:%d", pbID, n), player, gameID, res.Win, map[string]any{"freespin": n, "of": b.FreespinsCount, "multiplier": res.Multiplier, "value": b.FreespinValue}); err != nil {
		return res, err
	}
	res.SpinsLeft = left - 1
	res.TotalWon = won + res.Win
	if _, err := tx.Exec(ctx, `UPDATE player_bonuses SET freespins_left=$2, freespins_won=$3, amount=$3, wager_required=$4 WHERE id=$1`,
		pbID, res.SpinsLeft, res.TotalWon, res.TotalWon*int64(b.WagerMultiplier)); err != nil {
		return res, err
	}
	if res.SpinsLeft == 0 {
		res.Finished = true
		var progress int64
		if err := tx.QueryRow(ctx, `SELECT wager_progress FROM player_bonuses WHERE id=$1`, pbID).Scan(&progress); err != nil {
			return res, err
		}
		if res.TotalWon == 0 {
			_, err = tx.Exec(ctx, `UPDATE player_bonuses SET status='completed', finished_at=now() WHERE id=$1`, pbID)
			return res, err
		}
		if progress >= res.TotalWon*int64(b.WagerMultiplier) {
			return res, s.complete(ctx, tx, player, pbID)
		}
	}
	return res, nil
}

// ExpireDue closes bonuses past their expiry date. It runs periodically.
func (s *Service) ExpireDue(ctx context.Context) (int, error) {
	rows, err := s.Wallet.Pool.Query(ctx, `SELECT id, player_id FROM player_bonuses WHERE status IN ('active','pending') AND expires_at <= now() LIMIT 500`)
	if err != nil {
		return 0, err
	}
	type due struct {
		ID     int64
		Player uuid.UUID
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[due])
	if err != nil {
		return 0, err
	}
	for _, d := range list {
		err := s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
			var status string
			if err := tx.QueryRow(ctx, `SELECT status FROM player_bonuses WHERE id=$1 FOR UPDATE`, d.ID).Scan(&status); err != nil {
				return err
			}
			if status != "active" && status != "pending" {
				return nil
			}
			return s.end(ctx, tx, d.Player, d.ID, "expired", status)
		})
		if err != nil {
			return 0, err
		}
	}
	return len(list), nil
}

// ---- VIP ----

type Level struct {
	Level       int     `json:"level"`
	Name        string  `json:"name"`
	MinPoints   int64   `json:"min_points"`
	CashbackPct float64 `json:"cashback_pct"`
	RakebackPct float64 `json:"rakeback_pct"`
	Perks       string  `json:"perks"`
}

func (s *Service) Levels(ctx context.Context) ([]Level, error) {
	rows, err := s.Wallet.Pool.Query(ctx, `SELECT level, name, min_points, cashback_pct::float8, rakeback_pct::float8, perks FROM vip_levels ORDER BY level`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Level])
}

type VipStatus struct {
	Level             int       `json:"level"`
	Points            int64     `json:"points"`
	CashbackAvailable int64     `json:"cashback_available"`
	CashbackFrom      time.Time `json:"cashback_from"`
	NetLoss           int64     `json:"net_loss"`
	RakebackAvailable int64     `json:"rakeback_available"`
}

// netLossSQL is the player's real-money net loss in game rounds since the cashback period start.
const netLossSQL = `SELECT COALESCE(sum(bet_real - win_real), 0)::BIGINT FROM game_rounds WHERE player_id=$1 AND created_at >= $2 AND status <> 'rolled_back'`

func (s *Service) Vip(ctx context.Context, q pgx.Tx, player uuid.UUID) (VipStatus, error) {
	var v VipStatus
	var wagered int64
	var rakeback float64
	var cashbackPct float64
	row := `SELECT p.vip_level, p.wagered_real, p.rakeback_accrued::float8, p.cashback_from, COALESCE(l.cashback_pct, 0)::float8
		FROM players p LEFT JOIN vip_levels l ON l.level=p.vip_level WHERE p.id=$1`
	var err error
	if q != nil {
		err = q.QueryRow(ctx, row+` FOR UPDATE OF p`, player).Scan(&v.Level, &wagered, &rakeback, &v.CashbackFrom, &cashbackPct)
	} else {
		err = s.Wallet.Pool.QueryRow(ctx, row, player).Scan(&v.Level, &wagered, &rakeback, &v.CashbackFrom, &cashbackPct)
	}
	if err != nil {
		return v, err
	}
	v.Points = wagered / 100
	v.RakebackAvailable = int64(math.Floor(rakeback))
	if q != nil {
		err = q.QueryRow(ctx, netLossSQL, player, v.CashbackFrom).Scan(&v.NetLoss)
	} else {
		err = s.Wallet.Pool.QueryRow(ctx, netLossSQL, player, v.CashbackFrom).Scan(&v.NetLoss)
	}
	if err != nil {
		return v, err
	}
	if v.NetLoss > 0 {
		v.CashbackAvailable = int64(math.Floor(float64(v.NetLoss) * cashbackPct / 100))
	}
	return v, nil
}

const minClaim = 100 // $1

func (s *Service) ClaimCashback(ctx context.Context, tx pgx.Tx, player uuid.UUID) (int64, error) {
	v, err := s.Vip(ctx, tx, player)
	if err != nil {
		return 0, err
	}
	if v.CashbackAvailable < minClaim {
		return 0, httpx.Err(409, "nothing_to_claim", "cashback below the $1 minimum")
	}
	if _, err := s.Wallet.Reward(ctx, tx, player, "cashback", v.CashbackAvailable,
		fmt.Sprintf("cashback:%s:%d", player, v.CashbackFrom.UnixMicro()), map[string]any{"net_loss": v.NetLoss, "level": v.Level}); err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `UPDATE players SET cashback_from=now() WHERE id=$1`, player)
	return v.CashbackAvailable, err
}

func (s *Service) ClaimRakeback(ctx context.Context, tx pgx.Tx, player uuid.UUID) (int64, error) {
	v, err := s.Vip(ctx, tx, player)
	if err != nil {
		return 0, err
	}
	if v.RakebackAvailable < minClaim {
		return 0, httpx.Err(409, "nothing_to_claim", "rakeback below the $1 minimum")
	}
	if _, err := s.Wallet.Reward(ctx, tx, player, "rakeback", v.RakebackAvailable, "rakeback:"+uuid.NewString(), map[string]any{"level": v.Level}); err != nil {
		return 0, err
	}
	_, err = tx.Exec(ctx, `UPDATE players SET rakeback_accrued = rakeback_accrued - $2 WHERE id=$1`, player, v.RakebackAvailable)
	return v.RakebackAvailable, err
}
