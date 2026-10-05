package games

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/player"
)

type Banner struct {
	ID       int64  `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle"`
	CTAText  string `json:"cta_text"`
	CTALink  string `json:"cta_link"`
	Color    string `json:"color"`
	Emoji    string `json:"emoji"`
}

type Provider struct {
	Code  string `json:"code"`
	Title string `json:"title"`
	Games int    `json:"games"`
}

type Category struct {
	Code  string `json:"code"`
	Title string `json:"title"`
	Games int    `json:"games"`
}

var categoryTitles = map[string]string{"slots": "Slots", "crash": "Crash", "table": "Table games", "instant": "Instant", "dice": "Dice"}
var categoryOrder = []string{"slots", "crash", "table", "instant", "dice"}

// LobbyHome is everything the lobby page shows in one request: banners, categories,
// providers and curated rows. A logged-in player (optional bearer token) also gets
// "recently played" and recommendations based on the categories and studios they play.
func (s *Service) LobbyHome(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	country := player.Country(r)
	var pid *uuid.UUID
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		if c, err := s.Auth.Parse(strings.TrimPrefix(h, "Bearer ")); err == nil && c.Kind == "player" {
			pid = &c.Subject
		}
	}
	pool := s.Wallet.Pool

	brows, err := pool.Query(ctx, `SELECT id, title, subtitle, cta_text, cta_link, color, emoji FROM banners
		WHERE active AND (cardinality(countries)=0 OR $1 = ANY(countries))
		AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now())
		ORDER BY sort_order, id`, country)
	if err != nil {
		return err
	}
	banners, err := pgx.CollectRows(brows, pgx.RowToStructByPos[Banner])
	if err != nil {
		return err
	}

	all, err := s.games(ctx, `SELECT `+gameCols+` FROM games g WHERE `+visibleGames+` ORDER BY g.sort_order, g.id`, country)
	if err != nil {
		return err
	}
	counts := map[string]int{}
	studios := map[string]int{}
	for _, g := range all {
		counts[g.Category]++
		studios[g.Studio]++
	}
	cats := []Category{}
	for _, c := range categoryOrder {
		if counts[c] > 0 {
			cats = append(cats, Category{c, categoryTitles[c], counts[c]})
		}
	}
	prows, err := pool.Query(ctx, `SELECT code, title, 0 FROM providers WHERE status='live' AND NOT ($1 = ANY(blocked_countries)) ORDER BY sort_order, code`, country)
	if err != nil {
		return err
	}
	provs, err := pgx.CollectRows(prows, pgx.RowToStructByPos[Provider])
	if err != nil {
		return err
	}
	providers := []Provider{}
	for _, p := range provs {
		if p.Games = studios[p.Code]; p.Games > 0 {
			providers = append(providers, p)
		}
	}

	// Popular: most rounds over the last 30 days, then games tagged "popular".
	popular, err := s.games(ctx, `SELECT `+gameCols+` FROM games g
		LEFT JOIN (SELECT game_id, count(*) n FROM game_rounds WHERE created_at > now() - interval '30 days' GROUP BY game_id) r ON r.game_id=g.id
		WHERE `+visibleGames+` ORDER BY COALESCE(r.n,0) DESC, ('popular' = ANY(g.tags)) DESC, g.sort_order LIMIT 12`, country)
	if err != nil {
		return err
	}
	newest, err := s.games(ctx, `SELECT `+gameCols+` FROM games g WHERE `+visibleGames+` AND g.is_new ORDER BY g.sort_order, g.id DESC LIMIT 12`, country)
	if err != nil {
		return err
	}
	resp := map[string]any{
		"banners": banners, "categories": cats, "providers": providers,
		"popular": popular, "new": newest, "recommended": popular, "recent": []Game{},
	}
	if pid != nil {
		recent, err := s.games(ctx, `SELECT `+gameCols+` FROM games g
			JOIN (SELECT game_id, max(created_at) t FROM game_rounds WHERE player_id=$2 GROUP BY game_id) r ON r.game_id=g.id
			WHERE `+visibleGames+` ORDER BY r.t DESC LIMIT 12`, country, *pid)
		if err != nil {
			return err
		}
		resp["recent"] = recent
		// Recommended: games the player hasn't played, from their favourite categories and studios.
		rec, err := s.games(ctx, `WITH fav AS (
				SELECT g.category, g.studio, count(*) n FROM game_rounds r JOIN games g ON g.id=r.game_id
				WHERE r.player_id=$2 GROUP BY g.category, g.studio)
			SELECT `+gameCols+` FROM games g
			WHERE `+visibleGames+` AND NOT EXISTS (SELECT 1 FROM game_rounds r WHERE r.player_id=$2 AND r.game_id=g.id)
			ORDER BY COALESCE((SELECT sum(n) FROM fav WHERE fav.category=g.category),0)*2
			       + COALESCE((SELECT sum(n) FROM fav WHERE fav.studio=g.studio),0) DESC,
			       ('popular' = ANY(g.tags)) DESC, g.sort_order LIMIT 12`, country, *pid)
		if err != nil {
			return err
		}
		if len(rec) > 0 {
			resp["recommended"] = rec
		}
	}
	httpx.JSON(w, 200, resp)
	return nil
}

func (s *Service) games(ctx context.Context, sql string, args ...any) ([]Game, error) {
	rows, err := s.Wallet.Pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Game])
}

// PlayerRounds is the player's own bet history.
func (s *Service) PlayerRounds(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	limit := httpx.IntQuery(r, "limit", 50, 200)
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT r.id, g.title, g.emoji, r.provider, r.bet_real+r.bet_bonus, r.win_real+r.win_bonus, r.status, r.created_at
		FROM game_rounds r JOIN games g ON g.id=r.game_id WHERE r.player_id=$1 ORDER BY r.created_at DESC, r.id DESC LIMIT $2`, pid, limit)
	if err != nil {
		return err
	}
	type item struct {
		ID        int64     `json:"id"`
		Game      string    `json:"game"`
		Emoji     string    `json:"emoji"`
		Provider  string    `json:"provider"`
		Bet       int64     `json:"bet"`
		Win       int64     `json:"win"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"created_at"`
	}
	items, err := pgx.CollectRows(rows, pgx.RowToStructByPos[item])
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items})
	return nil
}
