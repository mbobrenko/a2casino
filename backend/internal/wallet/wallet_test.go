package wallet_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

// Tests run against a real Postgres: TEST_DATABASE_URL=postgres://... go test ./...
func setup(t *testing.T) (*wallet.Wallet, context.Context) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	return wallet.New(pool), ctx
}

func newPlayer(t *testing.T, w *wallet.Wallet, ctx context.Context) uuid.UUID {
	t.Helper()
	id := uuid.New()
	err := w.InTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO players (id, email, password_hash, country, birth_date) VALUES ($1,$2,'x','CL','1990-01-01')`, id, id.String()+"@t.io"); err != nil {
			return err
		}
		return wallet.CreatePlayerAccounts(ctx, tx, id, "USD")
	})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func deposit(t *testing.T, w *wallet.Wallet, ctx context.Context, p uuid.UUID, amount int64) {
	t.Helper()
	err := w.InTx(ctx, func(tx pgx.Tx) error {
		_, err := w.Deposit(ctx, tx, p, amount, wallet.HousePSPClearing, "dep:"+uuid.NewString(), nil)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func balances(t *testing.T, w *wallet.Wallet, ctx context.Context, p uuid.UUID) wallet.Balances {
	t.Helper()
	b, err := w.Balances(ctx, nil, p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestDepositIsIdempotent(t *testing.T) {
	w, ctx := setup(t)
	p := newPlayer(t, w, ctx)
	key := "dep:" + uuid.NewString()
	for i := 0; i < 3; i++ {
		err := w.InTx(ctx, func(tx pgx.Tx) error {
			res, err := w.Deposit(ctx, tx, p, 1000, wallet.HousePSPClearing, key, nil)
			if err == nil && (i > 0) != res.Duplicate {
				return fmt.Errorf("call %d: duplicate=%v", i, res.Duplicate)
			}
			return err
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	if got := balances(t, w, ctx, p).Real; got != 1000 {
		t.Fatalf("real = %d, want 1000", got)
	}
}

func TestBetUsesRealThenBonusAndRejectsOverdraft(t *testing.T) {
	w, ctx := setup(t)
	p := newPlayer(t, w, ctx)
	deposit(t, w, ctx, p, 300)
	if err := w.InTx(ctx, func(tx pgx.Tx) error {
		_, err := w.Adjust(ctx, tx, p, wallet.KindBonus, 500, "bonus:"+uuid.NewString(), nil)
		return err
	}); err != nil {
		t.Fatal(err)
	}

	var real, bonus int64
	err := w.InTx(ctx, func(tx pgx.Tx) error {
		var err error
		real, bonus, _, err = w.Bet(ctx, tx, p, 500, "bet:"+uuid.NewString(), nil)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if real != 300 || bonus != 200 {
		t.Fatalf("bet split real=%d bonus=%d, want 300/200", real, bonus)
	}
	b := balances(t, w, ctx, p)
	if b.Real != 0 || b.Bonus != 300 {
		t.Fatalf("balances %+v", b)
	}

	err = w.InTx(ctx, func(tx pgx.Tx) error {
		_, _, _, err := w.Bet(ctx, tx, p, 301, "bet:"+uuid.NewString(), nil)
		return err
	})
	if !errors.Is(err, wallet.ErrInsufficientFunds) {
		t.Fatalf("err = %v, want insufficient funds", err)
	}
}

func TestWithdrawalHoldReleaseComplete(t *testing.T) {
	w, ctx := setup(t)
	p := newPlayer(t, w, ctx)
	deposit(t, w, ctx, p, 5000)
	run := func(fn func(tx pgx.Tx) error) {
		if err := w.InTx(ctx, fn); err != nil {
			t.Fatal(err)
		}
	}
	run(func(tx pgx.Tx) error { _, err := w.HoldWithdrawal(ctx, tx, p, 2000, "h1:"+p.String(), nil); return err })
	if b := balances(t, w, ctx, p); b.Real != 3000 || b.Locked != 2000 {
		t.Fatalf("after hold %+v", b)
	}
	run(func(tx pgx.Tx) error {
		_, err := w.ReleaseWithdrawal(ctx, tx, p, 2000, "r1:"+p.String(), nil)
		return err
	})
	if b := balances(t, w, ctx, p); b.Real != 5000 || b.Locked != 0 {
		t.Fatalf("after release %+v", b)
	}
	run(func(tx pgx.Tx) error { _, err := w.HoldWithdrawal(ctx, tx, p, 1500, "h2:"+p.String(), nil); return err })
	run(func(tx pgx.Tx) error {
		_, err := w.CompleteWithdrawal(ctx, tx, p, 1500, wallet.HousePSPClearing, "c2:"+p.String(), nil)
		return err
	})
	if b := balances(t, w, ctx, p); b.Real != 3500 || b.Locked != 0 {
		t.Fatalf("after complete %+v", b)
	}
}

// Many concurrent bets on one player must never overspend, and the ledger must stay balanced.
func TestConcurrentBetsNeverOverspend(t *testing.T) {
	w, ctx := setup(t)
	p := newPlayer(t, w, ctx)
	deposit(t, w, ctx, p, 1000)

	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := w.InTx(ctx, func(tx pgx.Tx) error {
				_, _, _, err := w.Bet(ctx, tx, p, 100, "bet:"+uuid.NewString(), nil)
				return err
			})
			if err == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			} else if !errors.Is(err, wallet.ErrInsufficientFunds) {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if ok != 10 {
		t.Fatalf("%d bets succeeded, want 10", ok)
	}
	if b := balances(t, w, ctx, p); b.Real != 0 {
		t.Fatalf("real = %d, want 0", b.Real)
	}
	var sum int64
	if err := w.Pool.QueryRow(ctx, `SELECT COALESCE(sum(amount),0) FROM ledger_entries`).Scan(&sum); err != nil {
		t.Fatal(err)
	}
	if sum != 0 {
		t.Fatalf("ledger is unbalanced: sum of entries = %d", sum)
	}
}
