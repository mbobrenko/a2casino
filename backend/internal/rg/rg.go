// Package rg enforces responsible-gaming tools: deposit, loss, wager and play-time limits,
// reality checks, time-outs and self-exclusion.
//
// Rules:
//   - windows are rolling: day = last 24 hours, week = last 7 days, month = last 30 days;
//   - setting or lowering a limit applies at once, raising or removing it after a 24-hour cooling-off;
//   - net loss = real-money bets − real-money wins in the window (wins offset losses);
//   - wagering counts every bet, real and bonus money;
//   - a deposit counts from its creation: completed ones, plus ones still pending from the last hour;
//   - during a time-out or self-exclusion the player can log in, see the balance and withdraw,
//     but cannot deposit, bet, launch games, take bonuses or redeem promo codes, and gets no offers;
//   - a time-out ends by itself; a self-exclusion never ends early, and at its end the account
//     reopens only 24 hours after the player asks for it.
//
// Other packages call the Check* functions at the start of an operation; each returns a 403 httpx error.
package rg

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

// DB is a pool or a transaction.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

const (
	CoolingOff  = 24 * time.Hour
	ReopenDelay = 24 * time.Hour
	SessionGap  = 30 * time.Minute // a session ends after this long without activity
	// pendingDepositWindow: unfinished deposits younger than this still count toward deposit limits.
	pendingDepositWindow = time.Hour
)

var Periods = map[string]time.Duration{"day": 24 * time.Hour, "week": 7 * 24 * time.Hour, "month": 30 * 24 * time.Hour}

// Kinds and the periods each one supports.
var Kinds = map[string][]string{
	"deposit": {"day", "week", "month"},
	"loss":    {"day", "week", "month"},
	"wager":   {"day", "week", "month"},
	"session": {"day"},
}

// Durations of time-outs and self-exclusions; 0 = permanent.
var Durations = map[string]struct {
	Kind string
	D    time.Duration
}{
	"24h":       {"timeout", 24 * time.Hour},
	"7d":        {"timeout", 7 * 24 * time.Hour},
	"30d":       {"timeout", 30 * 24 * time.Hour},
	"6w":        {"timeout", 42 * 24 * time.Hour},
	"6m":        {"self_exclusion", 0},
	"1y":        {"self_exclusion", 0},
	"5y":        {"self_exclusion", 0},
	"permanent": {"self_exclusion", 0},
}

// endOf returns when an exclusion of the given duration starting at t ends (nil = never).
func endOf(duration string, t time.Time) *time.Time {
	var e time.Time
	switch duration {
	case "6m":
		e = t.AddDate(0, 6, 0)
	case "1y":
		e = t.AddDate(1, 0, 0)
	case "5y":
		e = t.AddDate(5, 0, 0)
	case "permanent":
		return nil
	default:
		e = t.Add(Durations[duration].D)
	}
	return &e
}

// ActiveExclusionSQL is true for an exclusion row "e" that is still in force.
const ActiveExclusionSQL = `(e.status='active' AND (
	(e.kind='timeout' AND e.ends_at > now()) OR
	(e.kind='self_exclusion' AND (e.reopen_requested_at IS NULL OR e.reopen_requested_at > now() - interval '24 hours'))))`

type Exclusion struct {
	ID                int64      `json:"id"`
	Kind              string     `json:"kind"` // timeout | self_exclusion
	Duration          string     `json:"duration"`
	StartsAt          time.Time  `json:"starts_at"`
	EndsAt            *time.Time `json:"ends_at"` // nil = permanent
	ByStaff           bool       `json:"by_staff"`
	Reason            string     `json:"reason,omitempty"`
	ReopenRequestedAt *time.Time `json:"reopen_requested_at"`
	// Derived:
	PeriodOver bool       `json:"period_over"` // a self-exclusion whose period has ended (reopen can be requested)
	ReopenAt   *time.Time `json:"reopen_at"`   // when the account reopens, once requested
}

// CurrentExclusion returns the time-out or self-exclusion in force, or nil.
func CurrentExclusion(ctx context.Context, db DB, player uuid.UUID) (*Exclusion, error) {
	var e Exclusion
	var staff *uuid.UUID
	err := db.QueryRow(ctx, `SELECT e.id, e.kind, e.duration, e.starts_at, e.ends_at, e.staff_id, e.reason, e.reopen_requested_at
		FROM rg_exclusions e WHERE e.player_id=$1 AND `+ActiveExclusionSQL, player).
		Scan(&e.ID, &e.Kind, &e.Duration, &e.StartsAt, &e.EndsAt, &staff, &e.Reason, &e.ReopenRequestedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.ByStaff = staff != nil
	e.PeriodOver = e.Kind == "self_exclusion" && e.EndsAt != nil && !e.EndsAt.After(time.Now())
	if e.ReopenRequestedAt != nil {
		t := e.ReopenRequestedAt.Add(ReopenDelay)
		e.ReopenAt = &t
	}
	return &e, nil
}

func dateText(t *time.Time) string {
	if t == nil {
		return "permanently"
	}
	return "until " + t.UTC().Format("2 Jan 2006 15:04") + " UTC"
}

// exclusionErr is the 403 for a player on a time-out or self-excluded.
func exclusionErr(e *Exclusion) error {
	if e.Kind == "timeout" {
		return httpx.Err(403, "timeout", "you are taking a time-out "+dateText(e.EndsAt)+
			". You can still log in to see your balance and withdraw.")
	}
	msg := "you are self-excluded " + dateText(e.EndsAt) + ". You can still log in to see your balance and withdraw."
	if e.PeriodOver {
		msg = "your self-exclusion period has ended, but the account reopens only 24 hours after you ask for it on the Responsible Gaming page."
		if e.ReopenAt != nil {
			msg = "your account reopens on " + e.ReopenAt.UTC().Format("2 Jan 2006 15:04") + " UTC, 24 hours after your request."
		}
	}
	return httpx.Err(403, "self_excluded", msg)
}

func checkExclusion(ctx context.Context, db DB, player uuid.UUID) error {
	e, err := CurrentExclusion(ctx, db, player)
	if err != nil || e == nil {
		return err
	}
	return exclusionErr(e)
}

// Suppressed reports whether no bonuses or offers may be given to the player (marketing suppression).
func Suppressed(ctx context.Context, db DB, player uuid.UUID) (bool, error) {
	e, err := CurrentExclusion(ctx, db, player)
	return e != nil, err
}

// CheckBonus refuses bonus claims, promo codes and staff grants during a time-out or self-exclusion.
func CheckBonus(ctx context.Context, db DB, player uuid.UUID) error {
	return checkExclusion(ctx, db, player)
}

// CheckPlay refuses launching a game when excluded or over the daily play-time limit.
func CheckPlay(ctx context.Context, db DB, player uuid.UUID) error {
	if err := checkExclusion(ctx, db, player); err != nil {
		return err
	}
	limits, err := Limits(ctx, db, player)
	if err != nil {
		return err
	}
	return checkSession(ctx, db, player, limits)
}

// CheckDeposit refuses a deposit of amount cents (0 when the amount is not known yet, as for a crypto
// address) when excluded or when it would exceed a deposit limit.
func CheckDeposit(ctx context.Context, db DB, player uuid.UUID, amount int64) error {
	if err := checkExclusion(ctx, db, player); err != nil {
		return err
	}
	limits, err := Limits(ctx, db, player)
	if err != nil {
		return err
	}
	for _, l := range limits {
		if l.Kind != "deposit" || l.Amount == nil {
			continue
		}
		used, err := usage(ctx, db, player, l.Kind, l.Period)
		if err != nil {
			return err
		}
		if used+amount > *l.Amount || (amount == 0 && used >= *l.Amount) {
			return limitErr("deposit_limit", "deposit", l, used)
		}
	}
	return nil
}

// CheckBet refuses a bet when excluded or when it would break a loss, wager or play-time limit,
// and records the activity in the play session. key is the bet's wallet idempotency key: a retry
// of a bet that was already accepted passes without checks.
func CheckBet(ctx context.Context, db DB, player uuid.UUID, amount int64, key string) error {
	if key != "" {
		var done bool
		if err := db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM ledger_tx WHERE idempotency_key=$1)`, key).Scan(&done); err != nil || done {
			return err
		}
	}
	if err := checkExclusion(ctx, db, player); err != nil {
		return err
	}
	limits, err := Limits(ctx, db, player)
	if err != nil {
		return err
	}
	if err := checkSession(ctx, db, player, limits); err != nil {
		return err
	}
	var realBal int64 = -1
	for _, l := range limits {
		if l.Amount == nil || (l.Kind != "loss" && l.Kind != "wager") {
			continue
		}
		used, err := usage(ctx, db, player, l.Kind, l.Period)
		if err != nil {
			return err
		}
		add := amount
		if l.Kind == "loss" {
			// Only the real-money part of the bet can be lost (the wallet takes real money first).
			if realBal < 0 {
				if err := db.QueryRow(ctx, `SELECT COALESCE((SELECT balance FROM accounts WHERE player_id=$1 AND kind='real'),0)`, player).Scan(&realBal); err != nil {
					return err
				}
			}
			add = min(amount, realBal)
		}
		if used+add > *l.Amount {
			return limitErr(l.Kind+"_limit", l.Kind, l, used)
		}
	}
	return Touch(ctx, db, player)
}

func checkSession(ctx context.Context, db DB, player uuid.UUID, limits []Limit) error {
	for _, l := range limits {
		if l.Kind != "session" || l.Amount == nil {
			continue
		}
		used, err := usage(ctx, db, player, "session", l.Period)
		if err != nil {
			return err
		}
		if used >= *l.Amount {
			return httpx.Err(403, "session_limit", fmt.Sprintf("you have reached your daily play-time limit of %s. Play is available again once your time in the last 24 hours drops below it.", minutesText(*l.Amount)))
		}
	}
	return nil
}

var periodAdj = map[string]string{"day": "daily", "week": "weekly", "month": "monthly"}

func limitErr(code, kind string, l Limit, used int64) error {
	left := max(*l.Amount-max(used, 0), 0)
	return httpx.Err(403, code, fmt.Sprintf("this would exceed your %s %s limit of %s: %s left in the current %s (rolling window)",
		periodAdj[l.Period], kind, money(*l.Amount), money(left), map[string]string{"day": "24 hours", "week": "7 days", "month": "30 days"}[l.Period]))
}

func money(c int64) string { return fmt.Sprintf("$%.2f", float64(c)/100) }

func minutesText(m int64) string {
	if m%60 == 0 {
		return fmt.Sprintf("%d h", m/60)
	}
	return fmt.Sprintf("%d h %d min", m/60, m%60)
}

// usage is how much of a limit the player has used in the rolling window: cents, or minutes for session.
func usage(ctx context.Context, db DB, player uuid.UUID, kind, period string) (int64, error) {
	since := time.Now().Add(-Periods[period])
	var v int64
	var err error
	switch kind {
	case "deposit":
		err = db.QueryRow(ctx, `SELECT COALESCE(sum(amount),0)::BIGINT FROM payments WHERE player_id=$1 AND direction='deposit' AND created_at > $2
			AND (status='completed' OR (status IN ('pending','confirming') AND created_at > $3))`, player, since, time.Now().Add(-pendingDepositWindow)).Scan(&v)
	case "loss":
		err = db.QueryRow(ctx, `SELECT COALESCE(sum(bet_real - win_real),0)::BIGINT FROM game_rounds WHERE player_id=$1 AND created_at > $2 AND status<>'rolled_back'`, player, since).Scan(&v)
	case "wager":
		err = db.QueryRow(ctx, `SELECT COALESCE(sum(bet_real + bet_bonus),0)::BIGINT FROM game_rounds WHERE player_id=$1 AND created_at > $2 AND status<>'rolled_back'`, player, since).Scan(&v)
	case "session":
		err = db.QueryRow(ctx, `SELECT COALESCE(sum(EXTRACT(EPOCH FROM last_seen_at - GREATEST(started_at, $2))),0)::BIGINT / 60
			FROM rg_sessions WHERE player_id=$1 AND last_seen_at > $2`, player, since).Scan(&v)
	}
	return v, err
}

// ---- Limits ----

type Limit struct {
	Kind          string     `json:"kind"`
	Period        string     `json:"period"`
	Amount        *int64     `json:"amount"` // in force; nil = none
	Pending       bool       `json:"pending"`
	PendingAmount *int64     `json:"pending_amount"` // nil with pending = removal
	EffectiveAt   *time.Time `json:"effective_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	Used          int64      `json:"used"`
}

// Limits returns the player's limits after applying pending changes whose cooling-off has passed.
func Limits(ctx context.Context, db DB, player uuid.UUID) ([]Limit, error) {
	if _, err := db.Exec(ctx, `WITH due AS (
			UPDATE rg_limits SET amount=pending_amount, pending=false, pending_amount=NULL, effective_at=NULL, updated_at=now()
			WHERE player_id=$1 AND pending AND effective_at <= now() RETURNING kind, period, amount)
		INSERT INTO rg_events (player_id, action, kind, period, after) SELECT $1, 'limit_applied', kind, period, jsonb_build_object('amount', amount) FROM due`, player); err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, `SELECT kind, period, amount, pending, pending_amount, effective_at, updated_at FROM rg_limits
		WHERE player_id=$1 AND (amount IS NOT NULL OR pending) ORDER BY kind, CASE period WHEN 'day' THEN 1 WHEN 'week' THEN 2 ELSE 3 END`, player)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Limit, error) {
		var l Limit
		err := r.Scan(&l.Kind, &l.Period, &l.Amount, &l.Pending, &l.PendingAmount, &l.EffectiveAt, &l.UpdatedAt)
		return l, err
	})
}

// LimitsWithUsage is Limits plus how much of each limit is used.
func LimitsWithUsage(ctx context.Context, db DB, player uuid.UUID) ([]Limit, error) {
	list, err := Limits(ctx, db, player)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].Used, err = usage(ctx, db, player, list[i].Kind, list[i].Period); err != nil {
			return nil, err
		}
	}
	return list, nil
}

// Actor says who changes a setting: the player (staff nil) or a staff member.
type Actor struct {
	Staff  *uuid.UUID
	Reason string
}

// SetLimitResult says whether the change applied at once or waits for the cooling-off.
type SetLimitResult struct {
	Applied     bool       `json:"applied"`
	EffectiveAt *time.Time `json:"effective_at,omitempty"`
}

var ErrNotStricter = httpx.Err(403, "not_stricter", "staff can only set a new limit or make an existing one stricter")

// SetLimit sets (amount > 0) or removes (nil) a limit. Staff may only make limits stricter.
func SetLimit(ctx context.Context, tx pgx.Tx, player uuid.UUID, kind, period string, amount *int64, by Actor) (SetLimitResult, error) {
	periods, ok := Kinds[kind]
	if !ok {
		return SetLimitResult{}, httpx.Err(400, "bad_kind", "kind must be deposit, loss, wager or session")
	}
	if !contains(periods, period) {
		return SetLimitResult{}, httpx.Err(400, "bad_period", "unsupported period for this limit")
	}
	if amount != nil && *amount <= 0 {
		return SetLimitResult{}, httpx.Err(400, "bad_amount", "a limit must be positive; send null to remove it")
	}
	if kind == "session" && amount != nil && *amount > 24*60 {
		return SetLimitResult{}, httpx.Err(400, "bad_amount", "a daily play-time limit is at most 24 hours")
	}
	if _, err := Limits(ctx, tx, player); err != nil { // apply anything due first
		return SetLimitResult{}, err
	}
	var cur *int64
	var pending bool
	var pendingAmount *int64
	err := tx.QueryRow(ctx, `SELECT amount, pending, pending_amount FROM rg_limits WHERE player_id=$1 AND kind=$2 AND period=$3 FOR UPDATE`, player, kind, period).
		Scan(&cur, &pending, &pendingAmount)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return SetLimitResult{}, err
	}
	if cur == nil && amount == nil {
		return SetLimitResult{Applied: true}, nil // nothing to remove
	}
	before := map[string]any{"amount": cur}
	if pending {
		before["pending_amount"] = pendingAmount
	}
	stricter := amount != nil && (cur == nil || *amount <= *cur)
	if by.Staff != nil && !stricter {
		return SetLimitResult{}, ErrNotStricter
	}
	res := SetLimitResult{Applied: stricter}
	action := "limit_set"
	if stricter {
		_, err = tx.Exec(ctx, `INSERT INTO rg_limits (player_id, kind, period, amount) VALUES ($1,$2,$3,$4)
			ON CONFLICT (player_id, kind, period) DO UPDATE SET amount=$4, pending=false, pending_amount=NULL, effective_at=NULL, updated_at=now()`,
			player, kind, period, *amount)
	} else {
		at := time.Now().Add(CoolingOff)
		res.EffectiveAt = &at
		action = "limit_pending"
		_, err = tx.Exec(ctx, `UPDATE rg_limits SET pending=true, pending_amount=$4, effective_at=$5, updated_at=now() WHERE player_id=$1 AND kind=$2 AND period=$3`,
			player, kind, period, amount, at)
	}
	if err != nil {
		return res, err
	}
	after := map[string]any{"amount": amount}
	if res.EffectiveAt != nil {
		after["effective_at"] = res.EffectiveAt
	}
	return res, event(ctx, tx, player, by, action, kind, period, before, after)
}

// SetRealityCheck sets the reality-check interval in minutes (0 = off).
func SetRealityCheck(ctx context.Context, tx pgx.Tx, player uuid.UUID, minutes int, by Actor) error {
	if minutes < 0 || minutes > 24*60 {
		return httpx.Err(400, "bad_minutes", "the interval must be between 0 (off) and 1440 minutes")
	}
	var cur int
	_ = tx.QueryRow(ctx, `SELECT reality_check_minutes FROM rg_settings WHERE player_id=$1`, player).Scan(&cur)
	if _, err := tx.Exec(ctx, `INSERT INTO rg_settings (player_id, reality_check_minutes) VALUES ($1,$2)
		ON CONFLICT (player_id) DO UPDATE SET reality_check_minutes=$2`, player, minutes); err != nil {
		return err
	}
	return event(ctx, tx, player, by, "reality_check", "", "", map[string]any{"minutes": cur}, map[string]any{"minutes": minutes})
}

func RealityCheckMinutes(ctx context.Context, db DB, player uuid.UUID) (int, error) {
	var m int
	err := db.QueryRow(ctx, `SELECT COALESCE((SELECT reality_check_minutes FROM rg_settings WHERE player_id=$1),0)`, player).Scan(&m)
	return m, err
}

// ---- Exclusions ----

// Exclude starts a time-out or self-exclusion. A new exclusion may only replace one in force when it
// lasts longer, so neither the player nor staff can shorten it.
func Exclude(ctx context.Context, tx pgx.Tx, player uuid.UUID, duration string, by Actor) (*Exclusion, error) {
	d, ok := Durations[duration]
	if !ok {
		return nil, httpx.Err(400, "bad_duration", "duration must be 24h, 7d, 30d, 6w (time-out) or 6m, 1y, 5y, permanent (self-exclusion)")
	}
	if err := closeEnded(ctx, tx, player); err != nil {
		return nil, err
	}
	now := time.Now()
	end := endOf(duration, now)
	cur, err := CurrentExclusion(ctx, tx, player)
	if err != nil {
		return nil, err
	}
	var before map[string]any
	if cur != nil {
		before = map[string]any{"kind": cur.Kind, "duration": cur.Duration, "ends_at": cur.EndsAt}
		longer := cur.EndsAt != nil && (end == nil || end.After(*cur.EndsAt))
		// An ended self-exclusion waiting for reopening is replaced by any new one.
		if !longer && !cur.PeriodOver {
			return nil, httpx.Err(409, "exclusion_active", "you already have a "+kindText(cur.Kind)+" "+dateText(cur.EndsAt)+"; a new one must last longer")
		}
		if _, err := tx.Exec(ctx, `UPDATE rg_exclusions SET status='superseded', lifted_at=now() WHERE id=$1`, cur.ID); err != nil {
			return nil, err
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO rg_exclusions (player_id, kind, duration, starts_at, ends_at, staff_id, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		player, d.Kind, duration, now, end, by.Staff, by.Reason); err != nil {
		return nil, err
	}
	// Bonuses waiting for a deposit are cancelled: no offers during an exclusion.
	if _, err := tx.Exec(ctx, `UPDATE player_bonuses SET status='cancelled', finished_at=now() WHERE player_id=$1 AND status='pending'`, player); err != nil {
		return nil, err
	}
	if err := event(ctx, tx, player, by, "exclusion", d.Kind, duration, before, map[string]any{"kind": d.Kind, "duration": duration, "ends_at": end}); err != nil {
		return nil, err
	}
	return CurrentExclusion(ctx, tx, player)
}

func kindText(k string) string {
	if k == "timeout" {
		return "time-out"
	}
	return "self-exclusion"
}

// RequestReopen asks to reopen the account after a time-limited self-exclusion has ended; it reopens 24 hours later.
func RequestReopen(ctx context.Context, tx pgx.Tx, player uuid.UUID) (*Exclusion, error) {
	cur, err := CurrentExclusion(ctx, tx, player)
	if err != nil {
		return nil, err
	}
	if cur == nil || cur.Kind != "self_exclusion" {
		return nil, httpx.Err(409, "not_excluded", "there is no self-exclusion to end")
	}
	if !cur.PeriodOver {
		return nil, httpx.Err(409, "exclusion_not_over", "a self-exclusion cannot be ended early: it runs "+dateText(cur.EndsAt))
	}
	if cur.ReopenRequestedAt != nil {
		return cur, nil
	}
	if _, err := tx.Exec(ctx, `UPDATE rg_exclusions SET reopen_requested_at=now() WHERE id=$1`, cur.ID); err != nil {
		return nil, err
	}
	if err := event(ctx, tx, player, Actor{}, "reopen_requested", cur.Kind, cur.Duration, nil, map[string]any{"reopen_at": time.Now().Add(ReopenDelay)}); err != nil {
		return nil, err
	}
	return CurrentExclusion(ctx, tx, player)
}

// closeEnded marks exclusions that are no longer in force as lifted and logs it.
func closeEnded(ctx context.Context, db DB, player uuid.UUID) error {
	_, err := db.Exec(ctx, `WITH ended AS (
			UPDATE rg_exclusions e SET status='lifted', lifted_at=now() WHERE e.player_id=$1 AND e.status='active' AND NOT `+ActiveExclusionSQL+`
			RETURNING kind, duration)
		INSERT INTO rg_events (player_id, action, kind, period) SELECT $1, 'exclusion_ended', kind, duration FROM ended`, player)
	return err
}

// ---- Sessions ----

// StartSession opens a new play session (at login).
func StartSession(ctx context.Context, db DB, player uuid.UUID) error {
	_, err := db.Exec(ctx, `INSERT INTO rg_sessions (player_id) VALUES ($1)`, player)
	return err
}

// Touch records activity: it extends the current session or starts a new one after a pause.
func Touch(ctx context.Context, db DB, player uuid.UUID) error {
	tag, err := db.Exec(ctx, `UPDATE rg_sessions SET last_seen_at=now() WHERE id=(
		SELECT id FROM rg_sessions WHERE player_id=$1 AND last_seen_at > $2 ORDER BY last_seen_at DESC LIMIT 1)`, player, time.Now().Add(-SessionGap))
	if err != nil || tag.RowsAffected() > 0 {
		return err
	}
	return StartSession(ctx, db, player)
}

type Session struct {
	StartedAt           time.Time `json:"started_at"`
	ElapsedSeconds      int64     `json:"elapsed_seconds"`
	Bets                int64     `json:"bets"`
	Wagered             int64     `json:"wagered"`
	Won                 int64     `json:"won"`
	Net                 int64     `json:"net"` // won − wagered, real and bonus money
	RealityCheckMinutes int       `json:"reality_check_minutes"`
	PlayedTodayMinutes  int64     `json:"played_today_minutes"` // last 24 hours
	SessionLimitMinutes *int64    `json:"session_limit_minutes"`
}

// Ping records activity and returns the current session summary for the reality check.
func Ping(ctx context.Context, db DB, player uuid.UUID) (Session, error) {
	var s Session
	if err := Touch(ctx, db, player); err != nil {
		return s, err
	}
	err := db.QueryRow(ctx, `SELECT started_at, EXTRACT(EPOCH FROM now() - started_at)::BIGINT FROM rg_sessions WHERE player_id=$1 ORDER BY last_seen_at DESC LIMIT 1`, player).
		Scan(&s.StartedAt, &s.ElapsedSeconds)
	if err != nil {
		return s, err
	}
	err = db.QueryRow(ctx, `SELECT count(*) FILTER (WHERE bet_real+bet_bonus > 0), COALESCE(sum(bet_real+bet_bonus),0)::BIGINT, COALESCE(sum(win_real+win_bonus),0)::BIGINT
		FROM game_rounds WHERE player_id=$1 AND created_at >= $2 AND status<>'rolled_back'`, player, s.StartedAt).Scan(&s.Bets, &s.Wagered, &s.Won)
	if err != nil {
		return s, err
	}
	s.Net = s.Won - s.Wagered
	if s.RealityCheckMinutes, err = RealityCheckMinutes(ctx, db, player); err != nil {
		return s, err
	}
	if s.PlayedTodayMinutes, err = usage(ctx, db, player, "session", "day"); err != nil {
		return s, err
	}
	_ = db.QueryRow(ctx, `SELECT amount FROM rg_limits WHERE player_id=$1 AND kind='session' AND period='day'`, player).Scan(&s.SessionLimitMinutes)
	return s, nil
}

// ---- State and history ----

type State struct {
	Limits              []Limit    `json:"limits"`
	RealityCheckMinutes int        `json:"reality_check_minutes"`
	Exclusion           *Exclusion `json:"exclusion"`
}

func GetState(ctx context.Context, db DB, player uuid.UUID) (State, error) {
	var st State
	if err := closeEnded(ctx, db, player); err != nil {
		return st, err
	}
	var err error
	if st.Limits, err = LimitsWithUsage(ctx, db, player); err != nil {
		return st, err
	}
	if st.RealityCheckMinutes, err = RealityCheckMinutes(ctx, db, player); err != nil {
		return st, err
	}
	st.Exclusion, err = CurrentExclusion(ctx, db, player)
	return st, err
}

type Event struct {
	ID        int64          `json:"id"`
	Action    string         `json:"action"`
	Kind      string         `json:"kind"`
	Period    string         `json:"period"`
	Before    map[string]any `json:"before"`
	After     map[string]any `json:"after"`
	CreatedAt time.Time      `json:"created_at"`
	Staff     *string        `json:"staff"` // staff email; nil = the player or the system
}

func History(ctx context.Context, db DB, player uuid.UUID, limit int) ([]Event, error) {
	rows, err := db.Query(ctx, `SELECT e.id, e.action, e.kind, e.period, e.before, e.after, e.created_at, s.email
		FROM rg_events e LEFT JOIN staff s ON s.id=e.staff_id WHERE e.player_id=$1 ORDER BY e.created_at DESC, e.id DESC LIMIT $2`, player, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Event])
}

func event(ctx context.Context, db DB, player uuid.UUID, by Actor, action, kind, period string, before, after map[string]any) error {
	_, err := db.Exec(ctx, `INSERT INTO rg_events (player_id, staff_id, action, kind, period, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		player, by.Staff, action, kind, period, before, after)
	return err
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
