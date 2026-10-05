// Package backoffice is the staff API: player search, the player card,
// account actions with an audit trail, and the withdrawal approval queue.
package backoffice

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/payments"
	"github.com/mbobrenko/a2casino/backend/internal/promo"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

type Service struct {
	Wallet   *wallet.Wallet
	Auth     *auth.Issuer
	Payments *payments.Service
	Promo    *promo.Service
	AML      *aml.Service
}

// SeedAdmin creates the first admin account when the staff table is empty.
func SeedAdmin(ctx context.Context, w *wallet.Wallet, email, password string) error {
	var n int
	if err := w.Pool.QueryRow(ctx, `SELECT count(*) FROM staff`).Scan(&n); err != nil || n > 0 {
		return err
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}
	_, err = w.Pool.Exec(ctx, `INSERT INTO staff (id, email, password_hash, role) VALUES ($1,$2,$3,'admin')`, uuid.New(), email, hash)
	return err
}

func (s *Service) Login(w http.ResponseWriter, r *http.Request) error {
	var req struct{ Email, Password string }
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	var id uuid.UUID
	var hash, role string
	err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT id, password_hash, role FROM staff WHERE email=$1`, strings.ToLower(strings.TrimSpace(req.Email))).Scan(&id, &hash, &role)
	if err != nil || !auth.CheckPassword(hash, req.Password) {
		return httpx.Err(401, "bad_credentials", "wrong email or password")
	}
	token, err := s.Auth.Issue(id, "staff", role, 12*time.Hour)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"token": token, "role": role, "email": req.Email})
	return nil
}

type PlayerRow struct {
	ID           uuid.UUID `json:"id"`
	Email        string    `json:"email"`
	Country      string    `json:"country"`
	Status       string    `json:"status"`
	Verification string    `json:"verification"`
	Tags         []string  `json:"tags"`
	Real         int64     `json:"real"`
	Bonus        int64     `json:"bonus"`
	CreatedAt    time.Time `json:"created_at"`
}

func (s *Service) Players(w http.ResponseWriter, r *http.Request) error {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	limit := httpx.IntQuery(r, "limit", 50, 200)
	offset := httpx.IntQuery(r, "offset", 0, 1_000_000)
	rows, err := s.Wallet.Pool.Query(r.Context(), `
		SELECT p.id, p.email, p.country, p.status, p.verification, p.tags,
		       COALESCE((SELECT balance FROM accounts a WHERE a.player_id=p.id AND a.kind='real'),0),
		       COALESCE((SELECT balance FROM accounts a WHERE a.player_id=p.id AND a.kind='bonus'),0),
		       p.created_at
		FROM players p
		WHERE $1='' OR p.email ILIKE '%'||$1||'%' OR p.id::text=$1 OR $1 = ANY(p.tags)
		ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`, q, limit, offset)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[PlayerRow])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func playerID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return id, httpx.Err(400, "bad_id", "bad player id")
	}
	return id, nil
}

// Player is the player card header: profile, balances and money/game counters.
func (s *Service) Player(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	ctx := r.Context()
	var p struct {
		ID                 uuid.UUID `json:"id"`
		Email              string    `json:"email"`
		Country            string    `json:"country"`
		BirthDate          time.Time `json:"birth_date"`
		Currency           string    `json:"currency"`
		Status             string    `json:"status"`
		Verification       string    `json:"verification"`
		WithdrawalsBlocked bool      `json:"withdrawals_blocked"`
		Tags               []string  `json:"tags"`
		AffiliateRef       *string   `json:"affiliate_ref"`
		RegistrationIP     *string   `json:"registration_ip"`
		CreatedAt          time.Time `json:"created_at"`
	}
	err = s.Wallet.Pool.QueryRow(ctx, `SELECT id, email, country, birth_date, currency, status, verification, withdrawals_blocked, tags, affiliate_ref, registration_ip, created_at
		FROM players WHERE id=$1`, id).Scan(&p.ID, &p.Email, &p.Country, &p.BirthDate, &p.Currency, &p.Status, &p.Verification, &p.WithdrawalsBlocked, &p.Tags, &p.AffiliateRef, &p.RegistrationIP, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return httpx.Err(404, "not_found", "player not found")
	}
	if err != nil {
		return err
	}
	bal, err := s.Wallet.Balances(ctx, nil, id)
	if err != nil {
		return err
	}
	var st struct {
		DepositsCount    int64      `json:"deposits_count"`
		DepositsSum      int64      `json:"deposits_sum"`
		WithdrawalsCount int64      `json:"withdrawals_count"`
		WithdrawalsSum   int64      `json:"withdrawals_sum"`
		PendingWithdraw  int64      `json:"pending_withdrawals_sum"`
		InOut            int64      `json:"inout"`
		BetsCount        int64      `json:"bets_count"`
		WinsCount        int64      `json:"wins_count"`
		Turnover         int64      `json:"turnover"`
		TotalWin         int64      `json:"total_win"`
		GGR              int64      `json:"ggr"`
		FirstDepositAt   *time.Time `json:"first_deposit_at"`
		LastBetAt        *time.Time `json:"last_bet_at"`
	}
	err = s.Wallet.Pool.QueryRow(ctx, `SELECT
		count(*) FILTER (WHERE direction='deposit' AND status='completed'),
		COALESCE(sum(amount) FILTER (WHERE direction='deposit' AND status='completed'),0),
		count(*) FILTER (WHERE direction='withdrawal' AND status='completed'),
		COALESCE(sum(amount) FILTER (WHERE direction='withdrawal' AND status='completed'),0),
		COALESCE(sum(amount) FILTER (WHERE direction='withdrawal' AND status IN ('pending','approved')),0),
		min(created_at) FILTER (WHERE direction='deposit' AND status='completed')
		FROM payments WHERE player_id=$1`, id).Scan(&st.DepositsCount, &st.DepositsSum, &st.WithdrawalsCount, &st.WithdrawalsSum, &st.PendingWithdraw, &st.FirstDepositAt)
	if err != nil {
		return err
	}
	// In production these counters come from ClickHouse; Postgres is fine at this scale.
	err = s.Wallet.Pool.QueryRow(ctx, `SELECT count(*), count(*) FILTER (WHERE win_real+win_bonus>0),
		COALESCE(sum(bet_real+bet_bonus),0), COALESCE(sum(win_real+win_bonus),0), max(created_at)
		FROM game_rounds WHERE player_id=$1 AND status<>'rolled_back'`, id).Scan(&st.BetsCount, &st.WinsCount, &st.Turnover, &st.TotalWin, &st.LastBetAt)
	if err != nil {
		return err
	}
	st.InOut = st.DepositsSum - st.WithdrawalsSum
	st.GGR = st.Turnover - st.TotalWin
	vip, err := s.Promo.Vip(ctx, nil, id)
	if err != nil {
		return err
	}
	var vipName string
	_ = s.Wallet.Pool.QueryRow(ctx, `SELECT name FROM vip_levels WHERE level=$1`, vip.Level).Scan(&vipName)
	httpx.JSON(w, 200, map[string]any{"player": p, "balance": bal, "stats": st, "vip": vip, "vip_name": vipName})
	return nil
}

func (s *Service) Rounds(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT gr.id, gr.round_id, g.title, gr.provider, gr.bet_real, gr.bet_bonus, gr.win_real, gr.win_bonus, gr.status, gr.details, gr.created_at
		FROM game_rounds gr JOIN games g ON g.id=gr.game_id WHERE gr.player_id=$1 ORDER BY gr.created_at DESC LIMIT $2`, id, httpx.IntQuery(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	type round struct {
		ID        int64          `json:"id"`
		RoundID   string         `json:"round_id"`
		Game      string         `json:"game"`
		Provider  string         `json:"provider"`
		BetReal   int64          `json:"bet_real"`
		BetBonus  int64          `json:"bet_bonus"`
		WinReal   int64          `json:"win_real"`
		WinBonus  int64          `json:"win_bonus"`
		Status    string         `json:"status"`
		Details   map[string]any `json:"details"`
		CreatedAt time.Time      `json:"created_at"`
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[round])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) PlayerPayments(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	list, err := payments.ListForPlayer(r.Context(), s.Wallet.Pool, id, httpx.IntQuery(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) Transactions(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT t.id, t.type, `+wallet.SignedAmountSQL+`, t.meta, t.created_at,
		(SELECT e.balance_after FROM ledger_entries e JOIN accounts a ON a.id=e.account_id JOIN ledger_tx t2 ON t2.id=e.tx_id
		  WHERE a.player_id=$1 AND a.kind='real' AND (t2.created_at, t2.id) <= (t.created_at, t.id) ORDER BY t2.created_at DESC, e.id DESC LIMIT 1)
		FROM ledger_tx t WHERE t.player_id=$1 ORDER BY t.created_at DESC, t.id DESC LIMIT $2`, id, httpx.IntQuery(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	type item struct {
		ID          uuid.UUID      `json:"id"`
		Type        string         `json:"type"`
		Amount      int64          `json:"amount"`
		Meta        map[string]any `json:"meta"`
		CreatedAt   time.Time      `json:"created_at"`
		RealBalance *int64         `json:"real_balance_after"`
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[item])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) Audit(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT a.id, a.action, a.before, a.after, a.comment, a.created_at, COALESCE(s.email,'system')
		FROM audit_log a LEFT JOIN staff s ON s.id=a.staff_id WHERE a.player_id=$1 ORDER BY a.created_at DESC LIMIT 200`, id)
	if err != nil {
		return err
	}
	type entry struct {
		ID        int64          `json:"id"`
		Action    string         `json:"action"`
		Before    map[string]any `json:"before"`
		After     map[string]any `json:"after"`
		Comment   *string        `json:"comment"`
		CreatedAt time.Time      `json:"created_at"`
		Staff     string         `json:"staff"`
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[entry])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func audit(ctx context.Context, tx pgx.Tx, staff, player uuid.UUID, action string, before, after map[string]any, comment string) error {
	b, _ := json.Marshal(before)
	a, _ := json.Marshal(after)
	_, err := tx.Exec(ctx, `INSERT INTO audit_log (staff_id, player_id, action, before, after, comment) VALUES ($1,$2,$3,$4,$5,$6)`, staff, player, action, b, a, comment)
	return err
}

type actionReq struct {
	Status             *string `json:"status"`
	Verification       *string `json:"verification"`
	WithdrawalsBlocked *bool   `json:"withdrawals_blocked"`
	AddTag             string  `json:"add_tag"`
	RemoveTag          string  `json:"remove_tag"`
	Comment            string  `json:"comment"`
}

var (
	validStatus       = map[string]bool{"active": true, "blocked": true}
	validVerification = map[string]bool{"new": true, "not_verified": true, "manual_review": true, "duplicate": true, "verified": true}
)

// Update applies one account action (status, verification, withdrawal block, tag) with a mandatory comment.
func (s *Service) Update(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req actionReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required for every change")
	}
	staff := auth.From(r.Context()).Subject
	ctx := r.Context()
	err = s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		var status, verification string
		var wb bool
		var tags []string
		if err := tx.QueryRow(ctx, `SELECT status, verification, withdrawals_blocked, tags FROM players WHERE id=$1 FOR UPDATE`, id).Scan(&status, &verification, &wb, &tags); err != nil {
			return httpx.Err(404, "not_found", "player not found")
		}
		switch {
		case req.Status != nil:
			if !validStatus[*req.Status] {
				return httpx.Err(400, "bad_status", "status must be active or blocked")
			}
			if _, err := tx.Exec(ctx, `UPDATE players SET status=$2 WHERE id=$1`, id, *req.Status); err != nil {
				return err
			}
			return audit(ctx, tx, staff, id, "status", map[string]any{"status": status}, map[string]any{"status": *req.Status}, req.Comment)
		case req.Verification != nil:
			if !validVerification[*req.Verification] {
				return httpx.Err(400, "bad_verification", "unknown verification status")
			}
			if _, err := tx.Exec(ctx, `UPDATE players SET verification=$2 WHERE id=$1`, id, *req.Verification); err != nil {
				return err
			}
			return audit(ctx, tx, staff, id, "verification", map[string]any{"verification": verification}, map[string]any{"verification": *req.Verification}, req.Comment)
		case req.WithdrawalsBlocked != nil:
			if _, err := tx.Exec(ctx, `UPDATE players SET withdrawals_blocked=$2 WHERE id=$1`, id, *req.WithdrawalsBlocked); err != nil {
				return err
			}
			return audit(ctx, tx, staff, id, "withdrawals_blocked", map[string]any{"withdrawals_blocked": wb}, map[string]any{"withdrawals_blocked": *req.WithdrawalsBlocked}, req.Comment)
		case req.AddTag != "":
			tag := strings.ToLower(strings.TrimSpace(req.AddTag))
			if _, err := tx.Exec(ctx, `UPDATE players SET tags = array_append(array_remove(tags,$2),$2) WHERE id=$1`, id, tag); err != nil {
				return err
			}
			return audit(ctx, tx, staff, id, "tag_added", nil, map[string]any{"tag": tag}, req.Comment)
		case req.RemoveTag != "":
			if _, err := tx.Exec(ctx, `UPDATE players SET tags = array_remove(tags,$2) WHERE id=$1`, id, req.RemoveTag); err != nil {
				return err
			}
			return audit(ctx, tx, staff, id, "tag_removed", map[string]any{"tag": req.RemoveTag}, nil, req.Comment)
		}
		return httpx.Err(400, "no_action", "nothing to change")
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

type adjustReq struct {
	Kind    string `json:"kind"`   // real | bonus
	Amount  int64  `json:"amount"` // signed cents
	Comment string `json:"comment"`
}

func (s *Service) Adjust(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req adjustReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	ctx := r.Context()
	err = s.Wallet.InTx(ctx, func(tx pgx.Tx) error {
		_, err := s.Wallet.Adjust(ctx, tx, id, req.Kind, req.Amount, "adj:"+uuid.NewString(), map[string]any{"staff_id": staff, "comment": req.Comment})
		if errors.Is(err, wallet.ErrInsufficientFunds) {
			return httpx.Err(402, "insufficient_funds", "balance would go negative")
		}
		if errors.Is(err, wallet.ErrInvalidAmount) {
			return httpx.Err(400, "bad_amount", "kind must be real or bonus and amount non-zero")
		}
		if err != nil {
			return err
		}
		return audit(ctx, tx, staff, id, "balance_adjustment", nil, map[string]any{"kind": req.Kind, "amount": req.Amount}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

// Withdrawals is the approval queue with anti-fraud columns per request.
func (s *Service) Withdrawals(w http.ResponseWriter, r *http.Request) error {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := s.Wallet.Pool.Query(r.Context(), `
		SELECT p.id, p.player_id, pl.email, pl.status, pl.verification, pl.tags, p.method, p.amount, p.status, p.address, p.risk, p.risk_reasons, p.created_at,
		  p.network, p.external_ref, p.crypto_amount, p.approved_at, p.paid_at,
		  (SELECT email FROM staff WHERE id=p.approved_by), (SELECT email FROM staff WHERE id=p.paid_by), (SELECT email FROM staff WHERE id=p.created_by), p.provider,
		  (SELECT min(created_at) FROM payments d WHERE d.player_id=p.player_id AND d.direction='deposit' AND d.status='completed'),
		  (SELECT count(*) FROM payments d WHERE d.player_id=p.player_id AND d.direction='deposit' AND d.status='completed'),
		  (SELECT COALESCE(sum(amount),0) FROM payments d WHERE d.player_id=p.player_id AND d.direction='deposit' AND d.status='completed'),
		  (SELECT count(*) FROM payments d WHERE d.player_id=p.player_id AND d.direction='withdrawal' AND d.status='completed'),
		  (SELECT COALESCE(sum(bet_real+bet_bonus),0) FROM game_rounds g WHERE g.player_id=p.player_id AND g.status<>'rolled_back')
		FROM payments p JOIN players pl ON pl.id=p.player_id
		WHERE p.direction='withdrawal' AND p.status=$1 ORDER BY CASE WHEN p.status IN ('pending','approved') THEN p.created_at END, p.created_at DESC LIMIT 200`, status)
	if err != nil {
		return err
	}
	type item struct {
		ID             uuid.UUID  `json:"id"`
		PlayerID       uuid.UUID  `json:"player_id"`
		Email          string     `json:"email"`
		PlayerStatus   string     `json:"player_status"`
		Verification   string     `json:"verification"`
		Tags           []string   `json:"tags"`
		Method         string     `json:"method"`
		Amount         int64      `json:"amount"`
		Status         string     `json:"status"`
		Address        *string    `json:"address"`
		Risk           *string    `json:"risk"`
		RiskReasons    []string   `json:"risk_reasons"`
		CreatedAt      time.Time  `json:"created_at"`
		Network        *string    `json:"network"`
		TxHash         *string    `json:"tx_hash"`
		CryptoAmount   *string    `json:"crypto_amount"`
		ApprovedAt     *time.Time `json:"approved_at"`
		PaidAt         *time.Time `json:"paid_at"`
		ApprovedBy     *string    `json:"approved_by"`
		PaidBy         *string    `json:"paid_by"`
		CreatedBy      *string    `json:"created_by"` // staff who created a balance payout
		TxURL          string     `json:"tx_url,omitempty"`
		Manual         bool       `json:"manual"` // paid by hand: approve, then mark paid with the tx hash
		FirstDeposit   *time.Time `json:"first_deposit_at"`
		Deposits       int64      `json:"deposits_count"`
		DepositsSum    int64      `json:"deposits_sum"`
		Withdrawals    int64      `json:"withdrawals_count"`
		Turnover       int64      `json:"turnover"`
		PaymentSpeedHr *float64   `json:"payment_speed_hours"`
	}
	list, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (item, error) {
		var it item
		var provider string
		err := row.Scan(&it.ID, &it.PlayerID, &it.Email, &it.PlayerStatus, &it.Verification, &it.Tags, &it.Method, &it.Amount, &it.Status, &it.Address, &it.Risk, &it.RiskReasons, &it.CreatedAt,
			&it.Network, &it.TxHash, &it.CryptoAmount, &it.ApprovedAt, &it.PaidAt, &it.ApprovedBy, &it.PaidBy, &it.CreatedBy, &provider,
			&it.FirstDeposit, &it.Deposits, &it.DepositsSum, &it.Withdrawals, &it.Turnover)
		it.Manual = provider == "manual"
		if it.Network != nil && it.TxHash != nil && it.Status == "completed" {
			it.TxURL = payments.ExplorerURL(*it.Network, *it.TxHash)
		}
		if it.FirstDeposit != nil {
			h := it.CreatedAt.Sub(*it.FirstDeposit).Hours()
			it.PaymentSpeedHr = &h
		}
		return it, err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) decide(approve bool) func(w http.ResponseWriter, r *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := uuid.Parse(chi.URLParam(r, "id"))
		if err != nil {
			return httpx.Err(400, "bad_id", "bad withdrawal id")
		}
		staff := auth.From(r.Context()).Subject
		if approve {
			err = s.Payments.Approve(r.Context(), id, staff)
		} else {
			err = s.Payments.Reject(r.Context(), id, staff)
		}
		if err != nil {
			return err
		}
		var pid uuid.UUID
		var amount int64
		_ = s.Wallet.Pool.QueryRow(r.Context(), `SELECT player_id, amount FROM payments WHERE id=$1`, id).Scan(&pid, &amount)
		action := map[bool]string{true: "withdrawal_approved", false: "withdrawal_rejected"}[approve]
		_ = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
			return audit(r.Context(), tx, staff, pid, action, nil, map[string]any{"payment_id": id, "amount": amount}, "")
		})
		httpx.JSON(w, 200, map[string]any{"ok": true})
		return nil
	}
}

func (s *Service) Approve() func(http.ResponseWriter, *http.Request) error { return s.decide(true) }
func (s *Service) Reject() func(http.ResponseWriter, *http.Request) error  { return s.decide(false) }

// Dashboard shows today's headline numbers.
func (s *Service) Dashboard(w http.ResponseWriter, r *http.Request) error {
	var d struct {
		Players          int64 `json:"players"`
		NewToday         int64 `json:"new_today"`
		DepositsToday    int64 `json:"deposits_today"`
		WithdrawalsToday int64 `json:"withdrawals_today"`
		PendingWithdraw  int64 `json:"pending_withdrawals"`
		AwaitingPayout   int64 `json:"awaiting_payout"` // approved manual payouts not marked paid yet
		TurnoverToday    int64 `json:"turnover_today"`
		GGRToday         int64 `json:"ggr_today"`
	}
	ctx := r.Context()
	err := s.Wallet.Pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM players),
		(SELECT count(*) FROM players WHERE created_at >= date_trunc('day', now())),
		(SELECT COALESCE(sum(amount),0) FROM payments WHERE direction='deposit' AND status='completed' AND updated_at >= date_trunc('day', now())),
		(SELECT COALESCE(sum(amount),0) FROM payments WHERE direction='withdrawal' AND status='completed' AND updated_at >= date_trunc('day', now())),
		(SELECT count(*) FROM payments WHERE direction='withdrawal' AND status='pending'),
		(SELECT count(*) FROM payments WHERE direction='withdrawal' AND status='approved'),
		(SELECT COALESCE(sum(bet_real+bet_bonus),0) FROM game_rounds WHERE status<>'rolled_back' AND created_at >= date_trunc('day', now())),
		(SELECT COALESCE(sum(bet_real+bet_bonus-win_real-win_bonus),0) FROM game_rounds WHERE status<>'rolled_back' AND created_at >= date_trunc('day', now()))`).
		Scan(&d.Players, &d.NewToday, &d.DepositsToday, &d.WithdrawalsToday, &d.PendingWithdraw, &d.AwaitingPayout, &d.TurnoverToday, &d.GGRToday)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, d)
	return nil
}
