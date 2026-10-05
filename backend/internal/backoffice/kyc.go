package backoffice

// KYC review: the queue of players waiting for verification, documents on the player card,
// approving or rejecting each document and confirming the identity. Every decision is audited.

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/kyc"
)

func (s *Service) KYCQueue(w http.ResponseWriter, r *http.Request) error {
	list, err := kyc.Queue(r.Context(), s.Wallet.Pool, r.URL.Query().Get("status"), httpx.IntQuery(r, "limit", 100, 500))
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"items": list})
	return nil
}

func (s *Service) PlayerKYC(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	o, err := kyc.GetOverview(r.Context(), s.Wallet.Pool, id, true)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, o)
	return nil
}

func docID(r *http.Request) (int64, error) {
	id, err := strconv.ParseInt(chi.URLParam(r, "doc"), 10, 64)
	if err != nil {
		return 0, httpx.Err(400, "bad_id", "bad document id")
	}
	return id, nil
}

// KYCFile serves a document to staff (any role).
func (s *Service) KYCFile(w http.ResponseWriter, r *http.Request) error {
	id, err := docID(r)
	if err != nil {
		return err
	}
	return s.KYC.ServeFile(w, r, id, uuid.Nil)
}

func (s *Service) ReviewKYCDocument(w http.ResponseWriter, r *http.Request) error {
	id, err := docID(r)
	if err != nil {
		return err
	}
	var req struct {
		Decision string `json:"decision"` // approve | reject
		Reason   string `json:"reason"`   // shown to the player on rejection
		Comment  string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if req.Decision != "approve" && req.Decision != "reject" {
		return httpx.Err(400, "bad_decision", "decision must be approve or reject")
	}
	staff := auth.From(r.Context()).Subject
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		player, before, err := kyc.Review(r.Context(), tx, id, staff, req.Decision == "approve", req.Reason)
		if err != nil {
			return err
		}
		after := map[string]any{"document_id": id, "status": "approved"}
		if req.Decision == "reject" {
			after["status"] = "rejected"
			after["reason"] = strings.TrimSpace(req.Reason)
		}
		return audit(r.Context(), tx, staff, player, "kyc_document_"+req.Decision, map[string]any{"document_id": id, "status": before}, after, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}

func (s *Service) VerifyKYC(w http.ResponseWriter, r *http.Request) error {
	id, err := playerID(r)
	if err != nil {
		return err
	}
	var req struct {
		Comment string `json:"comment"`
	}
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if strings.TrimSpace(req.Comment) == "" {
		return httpx.Err(400, "comment_required", "a comment is required")
	}
	staff := auth.From(r.Context()).Subject
	err = s.Wallet.InTx(r.Context(), func(tx pgx.Tx) error {
		before, err := kyc.Verify(r.Context(), tx, id)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, staff, id, "verification", map[string]any{"verification": before}, map[string]any{"verification": "verified"}, req.Comment)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, map[string]any{"ok": true})
	return nil
}
