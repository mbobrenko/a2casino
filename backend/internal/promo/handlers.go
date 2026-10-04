package promo

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

func idParam(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		return 0, httpx.Err(400, "bad_id", "bad id")
	}
	return id, nil
}

// Offers lists bonuses a visitor can see on the promo page (public).
func (s *Service) Offers(w http.ResponseWriter, r *http.Request) error {
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT `+BonusColumns+` FROM bonuses WHERE active AND trigger IN ('welcome','deposit') ORDER BY id`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Bonus, error) { return ScanBonus(r) })
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"offers": list})
	return nil
}

// MyBonuses lists the player's bonuses plus the deposit offers they can claim.
func (s *Service) MyBonuses(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	list, err := s.PlayerBonuses(r.Context(), nil, pid, 50)
	if err != nil {
		return err
	}
	rows, err := s.Wallet.Pool.Query(r.Context(), `SELECT `+BonusColumns+` FROM bonuses b WHERE active AND trigger='deposit'
		AND NOT EXISTS (SELECT 1 FROM player_bonuses pb WHERE pb.player_id=$1 AND pb.bonus_id=b.id AND pb.status='pending') ORDER BY id`, pid)
	if err != nil {
		return err
	}
	offers, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Bonus, error) { return ScanBonus(r) })
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"bonuses": list, "offers": offers})
	return nil
}

func (s *Service) RedeemHandler(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	var req struct {
		Code string `json:"code"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Code == "" {
		return httpx.Err(400, "bad_code", "enter a promo code")
	}
	var id int64
	err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) (err error) {
		id, err = s.Redeem(r.Context(), tx, pid, req.Code)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"player_bonus_id": id})
	return nil
}

func (s *Service) ClaimOfferHandler(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	bid, err := idParam(r)
	if err != nil {
		return err
	}
	var id int64
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) (err error) {
		id, err = s.ClaimOffer(r.Context(), tx, pid, bid)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"player_bonus_id": id})
	return nil
}

func (s *Service) CancelHandler(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	id, err := idParam(r)
	if err != nil {
		return err
	}
	if err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error { return s.Cancel(r.Context(), tx, pid, id) }); err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

func (s *Service) FreeSpinHandler(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	id, err := idParam(r)
	if err != nil {
		return err
	}
	var res FreeSpinResult
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) (err error) {
		res, err = s.FreeSpin(r.Context(), tx, pid, id)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, res)
	return nil
}

// VipHandler returns the VIP levels and the player's progress (public levels if not logged in).
func (s *Service) VipHandler(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	levels, err := s.Levels(r.Context())
	if err != nil {
		return err
	}
	st, err := s.Vip(r.Context(), nil, pid)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"levels": levels, "status": st})
	return nil
}

func (s *Service) VipLevels(w http.ResponseWriter, r *http.Request) error {
	levels, err := s.Levels(r.Context())
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"levels": levels})
	return nil
}

func (s *Service) claim(fn func(*Service, *http.Request, pgx.Tx) (int64, error)) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		var amount int64
		err := s.Wallet.InTx(r.Context(), func(tx pgx.Tx) (err error) {
			amount, err = fn(s, r, tx)
			return err
		})
		if err != nil {
			return err
		}
		httpx.JSON(w, 200, map[string]any{"amount": amount})
		return nil
	}
}

func (s *Service) ClaimCashbackHandler() func(http.ResponseWriter, *http.Request) error {
	return s.claim(func(s *Service, r *http.Request, tx pgx.Tx) (int64, error) {
		return s.ClaimCashback(r.Context(), tx, auth.From(r.Context()).Subject)
	})
}

func (s *Service) ClaimRakebackHandler() func(http.ResponseWriter, *http.Request) error {
	return s.claim(func(s *Service, r *http.Request, tx pgx.Tx) (int64, error) {
		return s.ClaimRakeback(r.Context(), tx, auth.From(r.Context()).Subject)
	})
}
