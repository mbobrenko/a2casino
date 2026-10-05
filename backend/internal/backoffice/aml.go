package backoffice

import (
	"context"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

// AMLAddresses lists the staff blacklist/whitelist and, on request, the sanctions list.
func (s *Service) AMLAddresses(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	list := q.Get("list")
	if list == "" {
		list = "manual"
	}
	var counts struct{ OFAC, Black, White int64 }
	_ = s.Wallet.Pool.QueryRow(r.Context(), `SELECT count(*) FILTER (WHERE list='ofac'), count(*) FILTER (WHERE list='blacklist'), count(*) FILTER (WHERE list='whitelist') FROM aml_addresses`).
		Scan(&counts.OFAC, &counts.Black, &counts.White)
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT a.address, a.list, a.network, a.reason, s.email AS added_by, a.created_at
		FROM aml_addresses a LEFT JOIN staff s ON s.id=a.added_by
		WHERE (($1='manual' AND a.list IN ('blacklist','whitelist')) OR a.list=$1) AND ($2='' OR a.address ILIKE '%'||$2||'%')
		ORDER BY a.created_at DESC LIMIT 200`, list, strings.TrimSpace(q.Get("q")))
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": items, "counts": map[string]int64{"ofac": counts.OFAC, "blacklist": counts.Black, "whitelist": counts.White}})
	return nil
}

func (s *Service) AMLAddAddress(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Address string `json:"address"`
		List    string `json:"list"` // blacklist | whitelist
		Network string `json:"network"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	addr := aml.Normalize(req.Address)
	if len(addr) < 20 {
		return httpx.Err(400, "bad_address", "enter a wallet address")
	}
	if req.List != "blacklist" && req.List != "whitelist" {
		return httpx.Err(400, "bad_list", "list must be blacklist or whitelist")
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	err := s.change(r, "aml_"+req.List+"_add", func(ctx context.Context, tx pgx.Tx) (any, error) {
		var list string
		if err := tx.QueryRow(ctx, `SELECT list FROM aml_addresses WHERE address=$1`, addr).Scan(&list); err == nil && list == "ofac" {
			return nil, httpx.Err(409, "sanctioned", "this address is on the OFAC sanctions list and cannot be changed")
		}
		_, err := tx.Exec(ctx, `INSERT INTO aml_addresses (address, list, network, reason, added_by) VALUES ($1,$2,$3,$4,$5)
			ON CONFLICT (address) DO UPDATE SET list=EXCLUDED.list, network=EXCLUDED.network, reason=EXCLUDED.reason, added_by=EXCLUDED.added_by, created_at=now()`,
			addr, req.List, req.Network, req.Comment, staff)
		return map[string]any{"address": addr, "list": req.List}, err
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

func (s *Service) AMLRemoveAddress(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Address string `json:"address"`
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	addr := aml.Normalize(req.Address)
	err := s.change(r, "aml_address_remove", func(ctx context.Context, tx pgx.Tx) (any, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM aml_addresses WHERE address=$1 AND list IN ('blacklist','whitelist')`, addr)
		if err == nil && tag.RowsAffected() == 0 {
			err = httpx.Err(404, "not_found", "address is not on the staff lists")
		}
		return map[string]any{"address": addr}, err
	}, req.Comment)
	if err != nil {
		return err
	}
	ok(w)
	return nil
}

func (s *Service) AMLScreenings(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	return s.list(w, r, "items", `SELECT sc.id, sc.address, sc.network, sc.player_id::text AS player_id, p.email AS player_email, sc.payment_id::text AS payment_id,
		sc.context, sc.risk, sc.reasons, sc.providers, sc.created_at
		FROM aml_screenings sc LEFT JOIN players p ON p.id=sc.player_id
		WHERE ($1='' OR sc.risk=$1) ORDER BY sc.created_at DESC LIMIT $2`, q.Get("risk"), httpx.IntQuery(r, "limit", 100, 500))
}

// AMLCheck screens an address on demand (logged as a manual check).
func (s *Service) AMLCheck(w http.ResponseWriter, r *http.Request) error {
	var req struct {
		Address string `json:"address"`
		Network string `json:"network"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if len(strings.TrimSpace(req.Address)) < 20 {
		return httpx.Err(400, "bad_address", "enter a wallet address")
	}
	var res aml.Result
	err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) (err error) {
		res, err = s.AML.Screen(r.Context(), tx, req.Network, req.Address, "manual", nil, nil)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, res)
	return nil
}
