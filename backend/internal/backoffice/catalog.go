package backoffice

// Catalog and marketing management: games, providers, bonuses, promo codes,
// VIP levels and lobby banners. Every change is written to the audit log.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

// auditObj records a change that is not tied to one player.
func auditObj(ctx context.Context, tx pgx.Tx, staff uuid.UUID, action string, before, after any, comment string) error {
	b, _ := json.Marshal(before)
	a, _ := json.Marshal(after)
	_, err := tx.Exec(ctx, `INSERT INTO audit_log (staff_id, action, before, after, comment) VALUES ($1,$2,$3,$4,$5)`, staff, action, b, a, comment)
	return err
}

// patch builds "UPDATE table SET ... WHERE key=$1" from the non-nil fields.
type patch struct {
	sets []string
	args []any
	diff map[string]any
}

func newPatch(key any) *patch { return &patch{args: []any{key}, diff: map[string]any{}} }

func (p *patch) add(col string, v any) {
	p.args = append(p.args, v)
	p.sets = append(p.sets, fmt.Sprintf("%s=$%d", col, len(p.args)))
	p.diff[col] = v
}

func (p *patch) exec(ctx context.Context, tx pgx.Tx, table, key string) error {
	if len(p.sets) == 0 {
		return httpx.Err(400, "nothing_to_change", "nothing to change")
	}
	tag, err := tx.Exec(ctx, `UPDATE `+table+` SET `+strings.Join(p.sets, ", ")+` WHERE `+key+`=$1`, p.args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return httpx.Err(404, "not_found", "not found")
	}
	return nil
}

func intID(r *http.Request, name string) (int64, error) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	if err != nil {
		return 0, httpx.Err(400, "bad_id", "bad id")
	}
	return id, nil
}

func upperCodes(list []string) []string {
	out := []string{}
	for _, c := range list {
		if c = strings.ToUpper(strings.TrimSpace(c)); len(c) == 2 {
			out = append(out, c)
		}
	}
	return out
}

func (s *Service) list(w http.ResponseWriter, r *http.Request, key, sql string, args ...any) error {
	rows, err := s.Wallet.Pool.Query(r.Context(), sql, args...)
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{key: items})
	return nil
}

func (s *Service) change(r *http.Request, action string, fn func(ctx context.Context, tx pgx.Tx) (any, error), comment string) error {
	staff := auth.From(r.Context()).Subject
	return s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		after, err := fn(r.Context(), tx)
		if err != nil {
			return err
		}
		return auditObj(r.Context(), tx, staff, action, nil, after, comment)
	})
}

func ok(w http.ResponseWriter) { httpx.JSON(w, 200, map[string]any{"ok": true}) }

// ---- Games ----

func (s *Service) Games(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	return s.list(w, r, "games", `SELECT g.id, g.slug, g.title, g.provider, g.studio, g.category, g.status, g.rtp::float8 AS rtp,
		g.sort_order, g.is_new, g.blocked_countries, g.tags, g.emoji, g.color,
		COALESCE(st.rounds,0) AS rounds_30d, COALESCE(st.turnover,0) AS turnover_30d, COALESCE(st.ggr,0) AS ggr_30d
		FROM games g LEFT JOIN (SELECT game_id, count(*) rounds, sum(bet_real+bet_bonus)::BIGINT turnover,
			sum(bet_real+bet_bonus-win_real-win_bonus)::BIGINT ggr FROM game_rounds
			WHERE created_at > now() - interval '30 days' AND status<>'rolled_back' AND provider<>'freespins' GROUP BY game_id) st ON st.game_id=g.id
		WHERE ($1='' OR g.title ILIKE '%'||$1||'%' OR g.slug ILIKE '%'||$1||'%') AND ($2='' OR g.category=$2) AND ($3='' OR g.status=$3)
		ORDER BY g.sort_order, g.id`, q.Get("q"), q.Get("category"), q.Get("status"))
}

var validGameStatus = map[string]bool{"draft": true, "announced": true, "live": true, "hidden": true, "closed": true}
var validCategory = map[string]bool{"slots": true, "crash": true, "table": true, "instant": true, "dice": true}

func (s *Service) UpdateGame(w http.ResponseWriter, r *http.Request) error {
	id, err := intID(r, "id")
	if err != nil {
		return err
	}
	var req struct {
		Title            *string   `json:"title"`
		Category         *string   `json:"category"`
		Status           *string   `json:"status"`
		SortOrder        *int      `json:"sort_order"`
		IsNew            *bool     `json:"is_new"`
		BlockedCountries *[]string `json:"blocked_countries"`
		Tags             *[]string `json:"tags"`
		Emoji            *string   `json:"emoji"`
		Color            *string   `json:"color"`
		Comment          string    `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(id)
	if req.Title != nil && strings.TrimSpace(*req.Title) != "" {
		p.add("title", strings.TrimSpace(*req.Title))
	}
	if req.Category != nil {
		if !validCategory[*req.Category] {
			return httpx.Err(400, "bad_category", "unknown category")
		}
		p.add("category", *req.Category)
	}
	if req.Status != nil {
		if !validGameStatus[*req.Status] {
			return httpx.Err(400, "bad_status", "unknown status")
		}
		p.add("status", *req.Status)
	}
	if req.SortOrder != nil {
		p.add("sort_order", *req.SortOrder)
	}
	if req.IsNew != nil {
		p.add("is_new", *req.IsNew)
	}
	if req.BlockedCountries != nil {
		p.add("blocked_countries", upperCodes(*req.BlockedCountries))
	}
	if req.Tags != nil {
		tags := []string{}
		for _, t := range *req.Tags {
			if t = strings.ToLower(strings.TrimSpace(t)); t != "" {
				tags = append(tags, t)
			}
		}
		p.add("tags", tags)
	}
	if req.Emoji != nil {
		p.add("emoji", *req.Emoji)
	}
	if req.Color != nil {
		p.add("color", *req.Color)
	}
	err = s.change(r, "game_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["game_id"] = id
		return p.diff, p.exec(ctx, tx, "games", "id")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Providers ----

func (s *Service) Providers(w http.ResponseWriter, r *http.Request) error {
	return s.list(w, r, "providers", `SELECT p.code, p.title, p.status, p.blocked_countries, p.sort_order,
		(SELECT count(*) FROM games g WHERE g.studio=p.code) AS games
		FROM providers p ORDER BY p.sort_order, p.code`)
}

func (s *Service) UpdateProvider(w http.ResponseWriter, r *http.Request) error {
	code := chi.URLParam(r, "code")
	var req struct {
		Status           *string   `json:"status"`
		BlockedCountries *[]string `json:"blocked_countries"`
		SortOrder        *int      `json:"sort_order"`
		Comment          string    `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(code)
	if req.Status != nil {
		if *req.Status != "live" && *req.Status != "hidden" {
			return httpx.Err(400, "bad_status", "status must be live or hidden")
		}
		p.add("status", *req.Status)
	}
	if req.BlockedCountries != nil {
		p.add("blocked_countries", upperCodes(*req.BlockedCountries))
	}
	if req.SortOrder != nil {
		p.add("sort_order", *req.SortOrder)
	}
	err := s.change(r, "provider_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["provider"] = code
		return p.diff, p.exec(ctx, tx, "providers", "code")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Bonuses ----

func (s *Service) Bonuses(w http.ResponseWriter, r *http.Request) error {
	return s.list(w, r, "bonuses", `SELECT b.id, b.title, b.description, b.kind, b.trigger, b.percent, b.max_amount, b.fixed_amount,
		b.min_deposit, b.wager_multiplier, b.freespins_count, b.freespin_value, b.freespin_game, b.valid_days, b.active,
		count(pb.id) AS given,
		count(pb.id) FILTER (WHERE pb.status='active') AS active_count,
		count(pb.id) FILTER (WHERE pb.status='completed') AS completed,
		COALESCE(sum(pb.amount) FILTER (WHERE pb.status<>'pending'),0)::BIGINT AS granted_sum
		FROM bonuses b LEFT JOIN player_bonuses pb ON pb.bonus_id=b.id GROUP BY b.id ORDER BY b.id`)
}

type bonusReq struct {
	Title           *string `json:"title"`
	Description     *string `json:"description"`
	Kind            *string `json:"kind"`
	Trigger         *string `json:"trigger"`
	Percent         *int    `json:"percent"`
	MaxAmount       *int64  `json:"max_amount"`
	FixedAmount     *int64  `json:"fixed_amount"`
	MinDeposit      *int64  `json:"min_deposit"`
	WagerMultiplier *int    `json:"wager_multiplier"`
	FreespinsCount  *int    `json:"freespins_count"`
	FreespinValue   *int64  `json:"freespin_value"`
	FreespinGame    *string `json:"freespin_game"`
	ValidDays       *int    `json:"valid_days"`
	Active          *bool   `json:"active"`
	Comment         string  `json:"comment"`
}

var validKind = map[string]bool{"deposit_match": true, "no_deposit": true, "freespins": true}
var validTrigger = map[string]bool{"welcome": true, "deposit": true, "promo_code": true, "manual": true}

func (b bonusReq) fill(p *patch) error {
	if b.Title != nil {
		if strings.TrimSpace(*b.Title) == "" {
			return httpx.Err(400, "bad_title", "title is required")
		}
		p.add("title", strings.TrimSpace(*b.Title))
	}
	if b.Description != nil {
		p.add("description", *b.Description)
	}
	if b.Kind != nil {
		if !validKind[*b.Kind] {
			return httpx.Err(400, "bad_kind", "unknown bonus kind")
		}
		p.add("kind", *b.Kind)
	}
	if b.Trigger != nil {
		if !validTrigger[*b.Trigger] {
			return httpx.Err(400, "bad_trigger", "unknown trigger")
		}
		p.add("trigger", *b.Trigger)
	}
	for _, f := range []struct {
		col string
		v   any
		neg bool
	}{
		{"percent", b.Percent, b.Percent != nil && *b.Percent < 0},
		{"max_amount", b.MaxAmount, b.MaxAmount != nil && *b.MaxAmount < 0},
		{"fixed_amount", b.FixedAmount, b.FixedAmount != nil && *b.FixedAmount < 0},
		{"min_deposit", b.MinDeposit, b.MinDeposit != nil && *b.MinDeposit < 0},
		{"wager_multiplier", b.WagerMultiplier, b.WagerMultiplier != nil && *b.WagerMultiplier < 0},
		{"freespins_count", b.FreespinsCount, b.FreespinsCount != nil && *b.FreespinsCount < 0},
		{"freespin_value", b.FreespinValue, b.FreespinValue != nil && *b.FreespinValue < 0},
		{"valid_days", b.ValidDays, b.ValidDays != nil && *b.ValidDays < 1},
	} {
		if f.neg {
			return httpx.Err(400, "bad_"+f.col, f.col+" is out of range")
		}
		switch v := f.v.(type) {
		case *int:
			if v != nil {
				p.add(f.col, *v)
			}
		case *int64:
			if v != nil {
				p.add(f.col, *v)
			}
		}
	}
	if b.FreespinGame != nil {
		p.add("freespin_game", *b.FreespinGame)
	}
	if b.Active != nil {
		p.add("active", *b.Active)
	}
	return nil
}

func (s *Service) CreateBonus(w http.ResponseWriter, r *http.Request) error {
	var req bonusReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Title == nil || req.Kind == nil || req.Trigger == nil {
		return httpx.Err(400, "bad_request", "title, kind and trigger are required")
	}
	p := newPatch(nil)
	if err := req.fill(p); err != nil {
		return err
	}
	var id int64
	err := s.change(r, "bonus_create", func(ctx context.Context, tx pgx.Tx) (any, error) {
		cols := make([]string, 0, len(p.sets))
		ph := make([]string, 0, len(p.sets))
		for i, set := range p.sets {
			cols = append(cols, strings.SplitN(set, "=", 2)[0])
			ph = append(ph, fmt.Sprintf("$%d", i+1))
		}
		err := tx.QueryRow(ctx, `INSERT INTO bonuses (`+strings.Join(cols, ",")+`) VALUES (`+strings.Join(ph, ",")+`) RETURNING id`, p.args[1:]...).Scan(&id)
		p.diff["id"] = id
		return p.diff, err
	}, req.Comment)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"id": id})
	return nil
}

func (s *Service) UpdateBonus(w http.ResponseWriter, r *http.Request) error {
	id, err := intID(r, "id")
	if err != nil {
		return err
	}
	var req bonusReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(id)
	if err := req.fill(p); err != nil {
		return err
	}
	err = s.change(r, "bonus_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["bonus_id"] = id
		return p.diff, p.exec(ctx, tx, "bonuses", "id")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Promo codes ----

func (s *Service) PromoCodes(w http.ResponseWriter, r *http.Request) error {
	return s.list(w, r, "promo_codes", `SELECT c.code, c.bonus_id, b.title AS bonus_title, b.kind AS bonus_kind, c.max_uses, c.uses, c.expires_at, c.active, c.created_at
		FROM promo_codes c JOIN bonuses b ON b.id=c.bonus_id ORDER BY c.created_at DESC`)
}

func (s *Service) CreatePromoCode(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Code      string     `json:"code"`
		BonusID   int64      `json:"bonus_id"`
		MaxUses   int        `json:"max_uses"`
		ExpiresAt *time.Time `json:"expires_at"`
		Comment   string     `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	req.Code = strings.ToUpper(strings.TrimSpace(req.Code))
	if len(req.Code) < 3 || len(req.Code) > 32 || strings.ContainsAny(req.Code, " \t") {
		return httpx.Err(400, "bad_code", "code must be 3-32 characters without spaces")
	}
	if req.MaxUses < 0 {
		return httpx.Err(400, "bad_max_uses", "max_uses must be 0 (unlimited) or more")
	}
	err := s.change(r, "promo_create", func(ctx context.Context, tx pgx.Tx) (any, error) {
		_, err := tx.Exec(ctx, `INSERT INTO promo_codes (code, bonus_id, max_uses, expires_at) VALUES ($1,$2,$3,$4)`, req.Code, req.BonusID, req.MaxUses, req.ExpiresAt)
		if err != nil && strings.Contains(err.Error(), "23505") {
			return nil, httpx.Err(409, "code_taken", "this code already exists")
		}
		if err != nil && strings.Contains(err.Error(), "23503") {
			return nil, httpx.Err(400, "bad_bonus", "unknown bonus")
		}
		return map[string]any{"code": req.Code, "bonus_id": req.BonusID, "max_uses": req.MaxUses, "expires_at": req.ExpiresAt}, err
	}, req.Comment)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"code": req.Code})
	return nil
}

func (s *Service) UpdatePromoCode(w http.ResponseWriter, r *http.Request) error {
	code := strings.ToUpper(chi.URLParam(r, "code"))
	var req struct {
		Active  *bool  `json:"active"`
		MaxUses *int   `json:"max_uses"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(code)
	if req.Active != nil {
		p.add("active", *req.Active)
	}
	if req.MaxUses != nil {
		p.add("max_uses", *req.MaxUses)
	}
	err := s.change(r, "promo_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["code"] = code
		return p.diff, p.exec(ctx, tx, "promo_codes", "code")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Player bonuses ----

func (s *Service) PlayerBonuses(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	list, err := s.Promo.PlayerBonuses(r.Context(), nil, id, 100)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) GrantBonus(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req struct {
		BonusID int64  `json:"bonus_id"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	var pbID int64
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		if pbID, err = s.Promo.Grant(r.Context(), tx, id, req.BonusID); err != nil {
			return err
		}
		return audit(r.Context(), tx, staff, id, "bonus_grant", nil, map[string]any{"bonus_id": req.BonusID, "player_bonus_id": pbID}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"player_bonus_id": pbID})
	return nil
}

func (s *Service) CancelPlayerBonus(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	pbID, err := intID(r, "pb")
	if err != nil {
		return err
	}
	var req struct {
		Comment string `json:"comment"`
	}
	_ = httpx.Decode(r, &req)
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		if err := s.Promo.Cancel(r.Context(), tx, id, pbID); err != nil {
			return err
		}
		return audit(r.Context(), tx, staff, id, "bonus_cancel", nil, map[string]any{"player_bonus_id": pbID}, req.Comment)
	})
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- VIP ----

func (s *Service) VipLevels(w http.ResponseWriter, r *http.Request) error {
	return s.list(w, r, "levels", `SELECT l.level, l.name, l.min_points, l.cashback_pct::float8 AS cashback_pct, l.rakeback_pct::float8 AS rakeback_pct, l.perks,
		(SELECT count(*) FROM players p WHERE p.vip_level=l.level) AS players
		FROM vip_levels l ORDER BY l.level`)
}

func (s *Service) UpdateVipLevel(w http.ResponseWriter, r *http.Request) error {
	level, err := intID(r, "level")
	if err != nil {
		return err
	}
	var req struct {
		Name        *string  `json:"name"`
		MinPoints   *int64   `json:"min_points"`
		CashbackPct *float64 `json:"cashback_pct"`
		RakebackPct *float64 `json:"rakeback_pct"`
		Perks       *string  `json:"perks"`
		Comment     string   `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(level)
	if req.Name != nil {
		p.add("name", *req.Name)
	}
	if req.MinPoints != nil {
		if *req.MinPoints < 0 || (level == 1 && *req.MinPoints != 0) {
			return httpx.Err(400, "bad_min_points", "level 1 must start at 0 points")
		}
		p.add("min_points", *req.MinPoints)
	}
	if req.CashbackPct != nil {
		if *req.CashbackPct < 0 || *req.CashbackPct > 50 {
			return httpx.Err(400, "bad_cashback", "cashback must be 0-50%")
		}
		p.add("cashback_pct", *req.CashbackPct)
	}
	if req.RakebackPct != nil {
		if *req.RakebackPct < 0 || *req.RakebackPct > 5 {
			return httpx.Err(400, "bad_rakeback", "rakeback must be 0-5% of turnover")
		}
		p.add("rakeback_pct", *req.RakebackPct)
	}
	if req.Perks != nil {
		p.add("perks", *req.Perks)
	}
	err = s.change(r, "vip_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["level"] = level
		return p.diff, p.exec(ctx, tx, "vip_levels", "level")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Banners ----

func (s *Service) Banners(w http.ResponseWriter, r *http.Request) error {
	return s.list(w, r, "banners", `SELECT id, title, subtitle, cta_text, cta_link, color, emoji, sort_order, active, countries, starts_at, ends_at FROM banners ORDER BY sort_order, id`)
}

type bannerReq struct {
	Title     *string    `json:"title"`
	Subtitle  *string    `json:"subtitle"`
	CTAText   *string    `json:"cta_text"`
	CTALink   *string    `json:"cta_link"`
	Color     *string    `json:"color"`
	Emoji     *string    `json:"emoji"`
	SortOrder *int       `json:"sort_order"`
	Active    *bool      `json:"active"`
	Countries *[]string  `json:"countries"`
	StartsAt  *time.Time `json:"starts_at"`
	EndsAt    *time.Time `json:"ends_at"`
	Comment   string     `json:"comment"`
}

func (b bannerReq) fill(p *patch) {
	for col, v := range map[string]*string{"title": b.Title, "subtitle": b.Subtitle, "cta_text": b.CTAText, "cta_link": b.CTALink, "color": b.Color, "emoji": b.Emoji} {
		if v != nil {
			p.add(col, *v)
		}
	}
	if b.SortOrder != nil {
		p.add("sort_order", *b.SortOrder)
	}
	if b.Active != nil {
		p.add("active", *b.Active)
	}
	if b.Countries != nil {
		p.add("countries", upperCodes(*b.Countries))
	}
	if b.StartsAt != nil {
		p.add("starts_at", *b.StartsAt)
	}
	if b.EndsAt != nil {
		p.add("ends_at", *b.EndsAt)
	}
}

func (s *Service) CreateBanner(w http.ResponseWriter, r *http.Request) error {
	var req bannerReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		return httpx.Err(400, "bad_title", "title is required")
	}
	var id int64
	err := s.change(r, "banner_create", func(ctx context.Context, tx pgx.Tx) (any, error) {
		if err := tx.QueryRow(ctx, `INSERT INTO banners (title) VALUES ($1) RETURNING id`, *req.Title).Scan(&id); err != nil {
			return nil, err
		}
		p := newPatch(id)
		req.fill(p)
		p.diff["id"] = id
		return p.diff, p.exec(ctx, tx, "banners", "id")
	}, req.Comment)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"id": id})
	return nil
}

func (s *Service) UpdateBanner(w http.ResponseWriter, r *http.Request) error {
	id, err := intID(r, "id")
	if err != nil {
		return err
	}
	var req bannerReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	p := newPatch(id)
	req.fill(p)
	err = s.change(r, "banner_update", func(ctx context.Context, tx pgx.Tx) (any, error) {
		p.diff["banner_id"] = id
		return p.diff, p.exec(ctx, tx, "banners", "id")
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

// ---- Global audit log ----

func (s *Service) AuditLog(w http.ResponseWriter, r *http.Request) error {
	limit := httpx.IntQuery(r, "limit", 100, 500)
	return s.list(w, r, "items", `SELECT a.id, a.action, a.player_id::text AS player_id, p.email AS player_email, s.email AS staff_email, a.before, a.after, a.comment, a.created_at
		FROM audit_log a LEFT JOIN staff s ON s.id=a.staff_id LEFT JOIN players p ON p.id=a.player_id
		WHERE ($1='' OR a.action=$1) ORDER BY a.created_at DESC, a.id DESC LIMIT $2`, r.URL.Query().Get("action"), limit)
}
