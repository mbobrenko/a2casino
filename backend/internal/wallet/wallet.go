// Package wallet is the only place where money moves. It keeps a double-entry
// ledger: every transaction is a set of entries that sum to zero.
//
// Player accounts (real, bonus, locked) are row-locked and may never go negative.
// House accounts (game, clearing, adjustments) are hot rows shared by every
// player, so they are NOT locked or updated per transaction: their entries are
// written with balance_after = NULL and their balance is derived by summing
// entries. This keeps the bet path free of a global lock.
package wallet

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	KindReal   = "real"
	KindBonus  = "bonus"
	KindLocked = "locked"

	HouseGame           = "house_game"
	HousePSPClearing    = "house_psp_clearing"
	HouseCryptoClearing = "house_crypto_clearing"
	HouseAdjustment     = "house_adjustment"
	HouseBonusCost      = "house_bonus_cost"
)

var (
	ErrInsufficientFunds = errors.New("insufficient funds")
	ErrInvalidAmount     = errors.New("amount must be positive")
)

type Wallet struct {
	Pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Wallet { return &Wallet{Pool: pool} }

// Leg is one side of a posting. PlayerID is nil for house accounts.
type Leg struct {
	PlayerID *uuid.UUID
	Kind     string
	Amount   int64 // signed: + credit to the account, - debit
}

type Posting struct {
	Key      string // idempotency key, unique per business operation
	Type     string
	PlayerID *uuid.UUID
	Amount   int64
	Currency string
	Meta     map[string]any
	Legs     []Leg
}

type Result struct {
	TxID      uuid.UUID
	Duplicate bool // the key was already posted; nothing changed
}

type Balances struct {
	Currency string `json:"currency"`
	Real     int64  `json:"real"`
	Bonus    int64  `json:"bonus"`
	Locked   int64  `json:"locked"`
}

func isHouse(kind string) bool { return strings.HasPrefix(kind, "house_") }

// InTx runs fn in a single database transaction.
func (w *Wallet) InTx(ctx context.Context, fn func(pgx.Tx) error) error {
	return pgx.BeginFunc(ctx, w.Pool, fn)
}

// Post writes a balanced posting inside tx. Re-posting the same key is a no-op
// that returns the original transaction id with Duplicate=true.
func (w *Wallet) Post(ctx context.Context, tx pgx.Tx, p Posting) (Result, error) {
	var sum int64
	for _, l := range p.Legs {
		sum += l.Amount
	}
	if sum != 0 {
		return Result{}, fmt.Errorf("unbalanced posting %s: sum=%d", p.Key, sum)
	}
	if p.Currency == "" {
		p.Currency = "USD"
	}
	meta, _ := json.Marshal(orEmpty(p.Meta))

	id := uuid.New()
	tag, err := tx.Exec(ctx, `INSERT INTO ledger_tx (id, idempotency_key, type, player_id, amount, meta)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (idempotency_key) DO NOTHING`,
		id, p.Key, p.Type, p.PlayerID, p.Amount, meta)
	if err != nil {
		return Result{}, err
	}
	if tag.RowsAffected() == 0 {
		var existing uuid.UUID
		if err := tx.QueryRow(ctx, `SELECT id FROM ledger_tx WHERE idempotency_key=$1`, p.Key).Scan(&existing); err != nil {
			return Result{}, err
		}
		return Result{TxID: existing, Duplicate: true}, nil
	}

	// Lock player accounts in a stable order to avoid deadlocks.
	legs := append([]Leg(nil), p.Legs...)
	sort.SliceStable(legs, func(i, j int) bool { return legKey(legs[i]) < legKey(legs[j]) })

	for _, l := range legs {
		if l.Amount == 0 {
			continue
		}
		accID, err := ensureAccount(ctx, tx, l.PlayerID, l.Kind, p.Currency)
		if err != nil {
			return Result{}, err
		}
		if isHouse(l.Kind) {
			if _, err := tx.Exec(ctx, `INSERT INTO ledger_entries (tx_id, account_id, amount, balance_after) VALUES ($1,$2,$3,NULL)`, id, accID, l.Amount); err != nil {
				return Result{}, err
			}
			continue
		}
		var bal int64
		if err := tx.QueryRow(ctx, `SELECT balance FROM accounts WHERE id=$1 FOR UPDATE`, accID).Scan(&bal); err != nil {
			return Result{}, err
		}
		bal += l.Amount
		if bal < 0 {
			return Result{}, ErrInsufficientFunds
		}
		if _, err := tx.Exec(ctx, `UPDATE accounts SET balance=$2 WHERE id=$1`, accID, bal); err != nil {
			return Result{}, err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO ledger_entries (tx_id, account_id, amount, balance_after) VALUES ($1,$2,$3,$4)`, id, accID, l.Amount, bal); err != nil {
			return Result{}, err
		}
	}

	event, _ := json.Marshal(map[string]any{
		"tx_id": id, "type": p.Type, "player_id": p.PlayerID, "amount": p.Amount, "currency": p.Currency, "meta": orEmpty(p.Meta),
	})
	key := ""
	if p.PlayerID != nil {
		key = p.PlayerID.String()
	}
	if _, err := tx.Exec(ctx, `INSERT INTO outbox (topic, key, payload) VALUES ('wallet.tx', $1, $2)`, key, event); err != nil {
		return Result{}, err
	}
	return Result{TxID: id}, nil
}

func legKey(l Leg) string {
	if l.PlayerID == nil {
		return "1:" + l.Kind
	}
	return "0:" + l.PlayerID.String() + ":" + l.Kind
}

func ensureAccount(ctx context.Context, tx pgx.Tx, playerID *uuid.UUID, kind, currency string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM accounts WHERE player_id IS NOT DISTINCT FROM $1 AND kind=$2 AND currency=$3`, playerID, kind, currency).Scan(&id)
	if err == nil {
		return id, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO accounts (player_id, kind, currency) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, playerID, kind, currency); err != nil {
		return 0, err
	}
	err = tx.QueryRow(ctx, `SELECT id FROM accounts WHERE player_id IS NOT DISTINCT FROM $1 AND kind=$2 AND currency=$3`, playerID, kind, currency).Scan(&id)
	return id, err
}

func orEmpty(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}

func pid(id uuid.UUID) *uuid.UUID { return &id }

// ---- Business operations ----

func (w *Wallet) Deposit(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64, clearing, key string, meta map[string]any) (Result, error) {
	if amount <= 0 {
		return Result{}, ErrInvalidAmount
	}
	return w.Post(ctx, tx, Posting{Key: key, Type: "deposit", PlayerID: pid(player), Amount: amount, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindReal, Amount: amount},
		{Kind: clearing, Amount: -amount},
	}})
}

// Bet takes money from the real balance first, then from bonus.
func (w *Wallet) Bet(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64, key string, meta map[string]any) (fromReal, fromBonus int64, res Result, err error) {
	if amount <= 0 {
		return 0, 0, Result{}, ErrInvalidAmount
	}
	b, err := lockedBalances(ctx, tx, player)
	if err != nil {
		return 0, 0, Result{}, err
	}
	fromReal = min(amount, b.Real)
	fromBonus = amount - fromReal
	if fromBonus > b.Bonus {
		return 0, 0, Result{}, ErrInsufficientFunds
	}
	res, err = w.Post(ctx, tx, Posting{Key: key, Type: "bet", PlayerID: pid(player), Amount: amount, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindReal, Amount: -fromReal},
		{PlayerID: pid(player), Kind: KindBonus, Amount: -fromBonus},
		{Kind: HouseGame, Amount: amount},
	}})
	return fromReal, fromBonus, res, err
}

func (w *Wallet) Win(ctx context.Context, tx pgx.Tx, player uuid.UUID, toReal, toBonus int64, key string, meta map[string]any) (Result, error) {
	if toReal < 0 || toBonus < 0 {
		return Result{}, ErrInvalidAmount
	}
	return w.Post(ctx, tx, Posting{Key: key, Type: "win", PlayerID: pid(player), Amount: toReal + toBonus, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindReal, Amount: toReal},
		{PlayerID: pid(player), Kind: KindBonus, Amount: toBonus},
		{Kind: HouseGame, Amount: -(toReal + toBonus)},
	}})
}

// Refund returns a bet to the sources it came from (provider rollback).
func (w *Wallet) Refund(ctx context.Context, tx pgx.Tx, player uuid.UUID, toReal, toBonus int64, key string, meta map[string]any) (Result, error) {
	return w.Post(ctx, tx, Posting{Key: key, Type: "rollback", PlayerID: pid(player), Amount: toReal + toBonus, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindReal, Amount: toReal},
		{PlayerID: pid(player), Kind: KindBonus, Amount: toBonus},
		{Kind: HouseGame, Amount: -(toReal + toBonus)},
	}})
}

// HoldWithdrawal moves money from real to locked until the withdrawal is approved or rejected.
func (w *Wallet) HoldWithdrawal(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64, key string, meta map[string]any) (Result, error) {
	if amount <= 0 {
		return Result{}, ErrInvalidAmount
	}
	return w.Post(ctx, tx, Posting{Key: key, Type: "withdraw_hold", PlayerID: pid(player), Amount: amount, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindReal, Amount: -amount},
		{PlayerID: pid(player), Kind: KindLocked, Amount: amount},
	}})
}

func (w *Wallet) ReleaseWithdrawal(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64, key string, meta map[string]any) (Result, error) {
	return w.Post(ctx, tx, Posting{Key: key, Type: "withdraw_release", PlayerID: pid(player), Amount: amount, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindLocked, Amount: -amount},
		{PlayerID: pid(player), Kind: KindReal, Amount: amount},
	}})
}

func (w *Wallet) CompleteWithdrawal(ctx context.Context, tx pgx.Tx, player uuid.UUID, amount int64, clearing, key string, meta map[string]any) (Result, error) {
	return w.Post(ctx, tx, Posting{Key: key, Type: "withdraw_complete", PlayerID: pid(player), Amount: amount, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: KindLocked, Amount: -amount},
		{Kind: clearing, Amount: amount},
	}})
}

// Adjust is a manual back-office correction of the real (or bonus) balance; amount is signed.
func (w *Wallet) Adjust(ctx context.Context, tx pgx.Tx, player uuid.UUID, kind string, amount int64, key string, meta map[string]any) (Result, error) {
	if amount == 0 || (kind != KindReal && kind != KindBonus) {
		return Result{}, ErrInvalidAmount
	}
	house := HouseAdjustment
	if kind == KindBonus {
		house = HouseBonusCost
	}
	abs := amount
	if abs < 0 {
		abs = -abs
	}
	return w.Post(ctx, tx, Posting{Key: key, Type: "adjustment", PlayerID: pid(player), Amount: abs, Meta: meta, Legs: []Leg{
		{PlayerID: pid(player), Kind: kind, Amount: amount},
		{Kind: house, Amount: -amount},
	}})
}

func lockedBalances(ctx context.Context, tx pgx.Tx, player uuid.UUID) (Balances, error) {
	b := Balances{Currency: "USD"}
	rows, err := tx.Query(ctx, `SELECT kind, balance FROM accounts WHERE player_id=$1 ORDER BY kind FOR UPDATE`, player)
	if err != nil {
		return b, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var bal int64
		if err := rows.Scan(&kind, &bal); err != nil {
			return b, err
		}
		b.set(kind, bal)
	}
	return b, rows.Err()
}

func (b *Balances) set(kind string, bal int64) {
	switch kind {
	case KindReal:
		b.Real = bal
	case KindBonus:
		b.Bonus = bal
	case KindLocked:
		b.Locked = bal
	}
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func (w *Wallet) Balances(ctx context.Context, q querier, player uuid.UUID) (Balances, error) {
	if q == nil {
		q = w.Pool
	}
	b := Balances{Currency: "USD"}
	rows, err := q.Query(ctx, `SELECT kind, balance FROM accounts WHERE player_id=$1`, player)
	if err != nil {
		return b, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var bal int64
		if err := rows.Scan(&kind, &bal); err != nil {
			return b, err
		}
		b.set(kind, bal)
	}
	return b, rows.Err()
}

// CreatePlayerAccounts opens real, bonus and locked accounts for a new player.
func CreatePlayerAccounts(ctx context.Context, tx pgx.Tx, player uuid.UUID, currency string) error {
	for _, k := range []string{KindReal, KindBonus, KindLocked} {
		if _, err := tx.Exec(ctx, `INSERT INTO accounts (player_id, kind, currency) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, player, k, currency); err != nil {
			return err
		}
	}
	return nil
}

// SignedAmountSQL is a column expression for a ledger_tx row aliased "t" queried for player $1:
// the net change of that player's playable money (real + bonus), negative for debits.
const SignedAmountSQL = `COALESCE((SELECT sum(e.amount) FROM ledger_entries e JOIN accounts a ON a.id=e.account_id
	WHERE e.tx_id=t.id AND a.player_id=$1 AND a.kind IN ('real','bonus')), 0)::BIGINT`
