// Package player handles registration, login and the player's own profile and wallet views.
package player

import (
	"errors"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
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

var emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

// Country resolves the request country: the CDN header (Cloudflare) wins, X-Country is for local testing.
func Country(r *http.Request) string {
	for _, h := range []string{"CF-IPCountry", "X-Country"} {
		if v := strings.ToUpper(strings.TrimSpace(r.Header.Get(h))); len(v) == 2 {
			return v
		}
	}
	return ""
}

func ClientIP(r *http.Request) string {
	if v := r.Header.Get("CF-Connecting-IP"); v != "" {
		return v
	}
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	return host
}

type registerReq struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	Country   string `json:"country"`
	BirthDate string `json:"birth_date"` // YYYY-MM-DD
	Ref       string `json:"ref"`
}

func (s *Service) Register(w http.ResponseWriter, r *http.Request) error {
	var req registerReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Country = strings.ToUpper(strings.TrimSpace(req.Country))
	if !emailRe.MatchString(req.Email) {
		return httpx.Err(400, "invalid_email", "invalid email")
	}
	if len(req.Password) < 8 {
		return httpx.Err(400, "weak_password", "password must be at least 8 characters")
	}
	if len(req.Country) != 2 {
		return httpx.Err(400, "invalid_country", "country must be an ISO-3166 alpha-2 code")
	}
	// Geo check: both the declared country and the network country must be allowed.
	if s.Cfg.BlockedCountries[req.Country] {
		return httpx.Err(403, "country_blocked", "registration is not available in your country")
	}
	if c := Country(r); c != "" && s.Cfg.BlockedCountries[c] {
		return httpx.Err(403, "country_blocked", "registration is not available in your country")
	}
	dob, err := time.Parse("2006-01-02", req.BirthDate)
	if err != nil {
		return httpx.Err(400, "invalid_birth_date", "birth_date must be YYYY-MM-DD")
	}
	if dob.AddDate(18, 0, 0).After(time.Now()) {
		return httpx.Err(403, "underage", "you must be 18 or older")
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		return err
	}
	ip := ClientIP(r)
	id := uuid.New()
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		// Duplicate-by-IP check (GeoKYC): allowed, but the account is tagged for review.
		var dupIP bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM players WHERE registration_ip=$1)`, ip).Scan(&dupIP); err != nil {
			return err
		}
		tags := []string{}
		if dupIP {
			tags = append(tags, "dup_ip")
		}
		var ref *string
		if req.Ref != "" {
			ref = &req.Ref
		}
		if _, err := tx.Exec(r.Context(), `INSERT INTO players (id, email, password_hash, country, birth_date, affiliate_ref, registration_ip, tags)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, id, req.Email, hash, req.Country, dob, ref, ip, tags); err != nil {
			return err
		}
		if err := wallet.CreatePlayerAccounts(r.Context(), tx, id, "USD"); err != nil {
			return err
		}
		return s.Promo.OnRegister(r.Context(), tx, id)
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return httpx.Err(409, "email_taken", "email is already registered")
	}
	if err != nil {
		return err
	}
	token, err := s.Auth.Issue(id, "player", "", 24*time.Hour)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"token": token, "player_id": id})
	return nil
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Service) Login(w http.ResponseWriter, r *http.Request) error {
	var req loginReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	var id uuid.UUID
	var hash, status string
	err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT id, password_hash, status FROM players WHERE email=$1`,
		strings.ToLower(strings.TrimSpace(req.Email))).Scan(&id, &hash, &status)
	if err != nil || !auth.CheckPassword(hash, req.Password) {
		return httpx.Err(401, "bad_credentials", "wrong email or password")
	}
	if status == "blocked" {
		return httpx.Err(403, "blocked", "account is blocked, contact support")
	}
	if err := rg.StartSession(r.Context(), s.Wallet.Pool, id); err != nil {
		return err
	}
	token, err := s.Auth.Issue(id, "player", "", 24*time.Hour)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"token": token, "player_id": id})
	return nil
}

func (s *Service) Me(w http.ResponseWriter, r *http.Request) error {
	id := auth.From(r.Context()).Subject
	var email, country, currency, status, verification string
	var created time.Time
	err := s.Wallet.Pool.QueryRow(r.Context(), `SELECT email, country, currency, status, verification, created_at FROM players WHERE id=$1`, id).
		Scan(&email, &country, &currency, &status, &verification, &created)
	if err != nil {
		return err
	}
	bal, err := s.Wallet.Balances(r.Context(), nil, id)
	if err != nil {
		return err
	}
	excl, err := rg.CurrentExclusion(r.Context(), s.Wallet.Pool, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{
		"id": id, "email": email, "country": country, "currency": currency, "status": status,
		"verification": verification, "created_at": created, "balance": bal, "exclusion": excl,
	})
	return nil
}

func (s *Service) Transactions(w http.ResponseWriter, r *http.Request) error {
	id := auth.From(r.Context()).Subject
	limit := httpx.IntQuery(r, "limit", 50, 200)
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT t.id, t.type, `+wallet.SignedAmountSQL+`, t.meta, t.created_at FROM ledger_tx t WHERE t.player_id=$1 ORDER BY t.created_at DESC, t.id DESC LIMIT $2`, id, limit)
	if err != nil {
		return err
	}
	type item struct {
		ID        uuid.UUID      `json:"id"`
		Type      string         `json:"type"`
		Amount    int64          `json:"amount"`
		Meta      map[string]any `json:"meta"`
		CreatedAt time.Time      `json:"created_at"`
	}
	items, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (item, error) {
		var it item
		err := row.Scan(&it.ID, &it.Type, &it.Amount, &it.Meta, &it.CreatedAt)
		return it, err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}

// Profile is the player's account page: details, balances, VIP progress and lifetime stats.
func (s *Service) Profile(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := auth.From(ctx).Subject
	var email, country, currency, status, verification string
	var created time.Time
	err := s.Wallet.Pool.QueryRow(ctx, `SELECT email, country, currency, status, verification, created_at FROM players WHERE id=$1`, id).
		Scan(&email, &country, &currency, &status, &verification, &created)
	if err != nil {
		return err
	}
	bal, err := s.Wallet.Balances(ctx, nil, id)
	if err != nil {
		return err
	}
	vip, err := s.Promo.Vip(ctx, nil, id)
	if err != nil {
		return err
	}
	var stats struct {
		Bets, BetSum, Wins, WinSum, Deposits, DepositSum, Withdrawals, WithdrawalSum int64
	}
	err = s.Wallet.Pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM game_rounds WHERE player_id=$1 AND bet_real+bet_bonus > 0),
		(SELECT COALESCE(sum(bet_real+bet_bonus),0)::BIGINT FROM game_rounds WHERE player_id=$1),
		(SELECT count(*) FROM game_rounds WHERE player_id=$1 AND win_real+win_bonus > 0),
		(SELECT COALESCE(sum(win_real+win_bonus),0)::BIGINT FROM game_rounds WHERE player_id=$1),
		(SELECT count(*) FROM payments WHERE player_id=$1 AND direction='deposit' AND status='completed'),
		(SELECT COALESCE(sum(amount),0)::BIGINT FROM payments WHERE player_id=$1 AND direction='deposit' AND status='completed'),
		(SELECT count(*) FROM payments WHERE player_id=$1 AND direction='withdrawal' AND status IN ('approved','completed')),
		(SELECT COALESCE(sum(amount),0)::BIGINT FROM payments WHERE player_id=$1 AND direction='withdrawal' AND status IN ('approved','completed'))`, id).
		Scan(&stats.Bets, &stats.BetSum, &stats.Wins, &stats.WinSum, &stats.Deposits, &stats.DepositSum, &stats.Withdrawals, &stats.WithdrawalSum)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{
		"id": id, "email": email, "country": country, "currency": currency, "status": status,
		"verification": verification, "created_at": created, "balance": bal, "vip": vip,
		"stats": map[string]int64{
			"bets": stats.Bets, "bet_sum": stats.BetSum, "wins": stats.Wins, "win_sum": stats.WinSum,
			"deposits": stats.Deposits, "deposit_sum": stats.DepositSum, "withdrawals": stats.Withdrawals, "withdrawal_sum": stats.WithdrawalSum,
		},
	})
	return nil
}
