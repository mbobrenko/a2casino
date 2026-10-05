// Package kyc handles identity verification: the player's personal details, uploaded documents
// (identity document front and back, proof of address, selfie with the document) and their review.
//
// players.verification moves to "pending" once the profile is complete and every required document
// is uploaded, back to "not_verified" when staff reject a document, and to "verified" only when staff
// confirm the identity after approving every document. Withdrawals still require "verified".
package kyc

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

const MaxFileSize = 5 << 20 // 5 MB per file

// DB is a pool or a transaction.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store keeps document files. DBStore keeps them in Postgres (the free Render host has no persistent
// disk); an S3 implementation can replace it later, with kyc_documents.storage telling them apart.
type Store interface {
	Name() string
	// Put saves the file. tx is the transaction that records the document, for stores that can join it.
	Put(ctx context.Context, tx pgx.Tx, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
}

type DBStore struct{ Pool *pgxpool.Pool }

func (DBStore) Name() string { return "db" }

func (DBStore) Put(ctx context.Context, tx pgx.Tx, key string, data []byte) error {
	_, err := tx.Exec(ctx, `INSERT INTO kyc_files (key, data) VALUES ($1,$2)`, key, data)
	return err
}

func (s DBStore) Get(ctx context.Context, key string) ([]byte, error) {
	var data []byte
	err := s.Pool.QueryRow(ctx, `SELECT data FROM kyc_files WHERE key=$1`, key).Scan(&data)
	return data, err
}

type Service struct {
	Pool  *pgxpool.Pool
	Store Store
}

var (
	Kinds   = []string{"id_front", "id_back", "address", "selfie"}
	IDTypes = map[string]bool{"passport": true, "id_card": true, "driving_licence": true}
)

// sniff identifies a file by its first bytes; the client's content type is not trusted.
func sniff(b []byte) (contentType, ext string) {
	switch {
	case bytes.HasPrefix(b, []byte{0xFF, 0xD8, 0xFF}):
		return "image/jpeg", "jpg"
	case bytes.HasPrefix(b, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}):
		return "image/png", "png"
	case bytes.HasPrefix(b, []byte("%PDF-")):
		return "application/pdf", "pdf"
	}
	return "", ""
}

type Document struct {
	ID           int64      `json:"id"`
	Kind         string     `json:"kind"`
	IDType       string     `json:"id_type"`
	FileName     string     `json:"file_name"`
	ContentType  string     `json:"content_type"`
	Size         int        `json:"size"`
	Status       string     `json:"status"` // pending | approved | rejected
	RejectReason string     `json:"reject_reason"`
	ReviewedAt   *time.Time `json:"reviewed_at"`
	ReviewedBy   *string    `json:"reviewed_by"` // staff email (back office only)
	CreatedAt    time.Time  `json:"created_at"`
}

const docCols = `d.id, d.kind, d.id_type, d.file_name, d.content_type, d.size, d.status, d.reject_reason, d.reviewed_at, s.email, d.created_at`

func scanDocs(rows pgx.Rows, err error) ([]Document, error) {
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Document])
}

// Documents lists a player's documents, newest first; current=true keeps only the newest of each kind.
func Documents(ctx context.Context, db DB, player uuid.UUID, current bool) ([]Document, error) {
	q := `SELECT ` + docCols + ` FROM kyc_documents d LEFT JOIN staff s ON s.id=d.reviewed_by WHERE d.player_id=$1 ORDER BY d.created_at DESC, d.id DESC`
	if current {
		q = `SELECT * FROM (SELECT DISTINCT ON (d.kind) ` + docCols + ` FROM kyc_documents d LEFT JOIN staff s ON s.id=d.reviewed_by
			WHERE d.player_id=$1 ORDER BY d.kind, d.created_at DESC, d.id DESC) x ORDER BY created_at DESC`
	}
	return scanDocs(db.Query(ctx, q, player))
}

type Profile struct {
	FullName   string    `json:"full_name"`
	BirthDate  time.Time `json:"birth_date"`
	Country    string    `json:"country"`
	Address    string    `json:"address"`
	City       string    `json:"city"`
	PostalCode string    `json:"postal_code"`
}

func (p Profile) complete() bool {
	return p.FullName != "" && p.Address != "" && p.City != ""
}

func loadProfile(ctx context.Context, db DB, player uuid.UUID) (Profile, string, error) {
	var p Profile
	var verification string
	err := db.QueryRow(ctx, `SELECT full_name, birth_date, country, address, city, postal_code, verification FROM players WHERE id=$1`, player).
		Scan(&p.FullName, &p.BirthDate, &p.Country, &p.Address, &p.City, &p.PostalCode, &verification)
	return p, verification, err
}

// required lists the document kinds still needed: the back of the ID is not needed for a passport.
func required(docs []Document) []string {
	idType := ""
	for _, d := range docs {
		if d.Kind == "id_front" {
			idType = d.IDType
		}
	}
	req := []string{"id_front", "id_back", "address", "selfie"}
	if idType == "passport" {
		req = []string{"id_front", "address", "selfie"}
	}
	return req
}

type Overview struct {
	Verification string     `json:"verification"`
	Profile      Profile    `json:"profile"`
	Required     []string   `json:"required"`
	Missing      []string   `json:"missing"` // required kinds with no document, or only a rejected one
	Documents    []Document `json:"documents"`
}

// GetOverview is the verification state; all=true lists every document ever uploaded (back office).
func GetOverview(ctx context.Context, db DB, player uuid.UUID, all bool) (Overview, error) {
	var o Overview
	var err error
	if o.Profile, o.Verification, err = loadProfile(ctx, db, player); err != nil {
		return o, err
	}
	cur, err := Documents(ctx, db, player, true)
	if err != nil {
		return o, err
	}
	o.Required = required(cur)
	o.Missing = missing(o.Required, cur, "pending", "approved")
	o.Documents = cur
	if all {
		o.Documents, err = Documents(ctx, db, player, false)
	}
	return o, err
}

// missing returns the required kinds whose current document is not in one of the given statuses.
func missing(req []string, cur []Document, statuses ...string) []string {
	have := map[string]string{}
	for _, d := range cur {
		have[d.Kind] = d.Status
	}
	out := []string{}
	for _, k := range req {
		ok := false
		for _, s := range statuses {
			ok = ok || have[k] == s
		}
		if !ok {
			out = append(out, k)
		}
	}
	return out
}

// refresh moves an unverified player to "pending" once the profile and all documents are in.
func refresh(ctx context.Context, tx pgx.Tx, player uuid.UUID) error {
	p, verification, err := loadProfile(ctx, tx, player)
	if err != nil {
		return err
	}
	if verification != "new" && verification != "not_verified" {
		return nil
	}
	cur, err := Documents(ctx, tx, player, true)
	if err != nil {
		return err
	}
	if !p.complete() || len(missing(required(cur), cur, "pending", "approved")) > 0 {
		return nil
	}
	_, err = tx.Exec(ctx, `UPDATE players SET verification='pending' WHERE id=$1`, player)
	return err
}

// ---- Player handlers ----

func (s *Service) Get(w http.ResponseWriter, r *http.Request) error {
	o, err := GetOverview(r.Context(), s.Pool, auth.From(r.Context()).Subject, false)
	if err != nil {
		return err
	}
	httpx.JSON(w, 200, o)
	return nil
}

type profileReq struct {
	FullName   string `json:"full_name"`
	BirthDate  string `json:"birth_date"`
	Address    string `json:"address"`
	City       string `json:"city"`
	PostalCode string `json:"postal_code"`
}

func clean(s string, max int) (string, bool) {
	s = strings.Join(strings.Fields(s), " ")
	return s, utf8.RuneCountInString(s) <= max
}

func (s *Service) UpdateProfile(w http.ResponseWriter, r *http.Request) error {
	var req profileReq
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	var ok1, ok2, ok3, ok4 bool
	req.FullName, ok1 = clean(req.FullName, 100)
	req.Address, ok2 = clean(req.Address, 200)
	req.City, ok3 = clean(req.City, 100)
	req.PostalCode, ok4 = clean(req.PostalCode, 20)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		return httpx.Err(400, "too_long", "a field is too long")
	}
	if utf8.RuneCountInString(req.FullName) < 3 || !strings.Contains(req.FullName, " ") {
		return httpx.Err(400, "bad_full_name", "enter your first and last name as in your ID")
	}
	if utf8.RuneCountInString(req.Address) < 5 || req.City == "" {
		return httpx.Err(400, "bad_address", "enter your street address and city")
	}
	dob, err := time.Parse("2006-01-02", req.BirthDate)
	if err != nil {
		return httpx.Err(400, "invalid_birth_date", "birth_date must be YYYY-MM-DD")
	}
	if dob.AddDate(18, 0, 0).After(time.Now()) {
		return httpx.Err(403, "underage", "you must be 18 or older")
	}
	if dob.Year() < 1900 {
		return httpx.Err(400, "invalid_birth_date", "check your date of birth")
	}
	pid := auth.From(r.Context()).Subject
	err = pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		var verification string
		if err := tx.QueryRow(r.Context(), `SELECT verification FROM players WHERE id=$1 FOR UPDATE`, pid).Scan(&verification); err != nil {
			return err
		}
		if verification == "verified" {
			return httpx.Err(409, "profile_locked", "your account is verified: contact support to change your details")
		}
		if _, err := tx.Exec(r.Context(), `UPDATE players SET full_name=$2, birth_date=$3, address=$4, city=$5, postal_code=$6 WHERE id=$1`,
			pid, req.FullName, dob, req.Address, req.City, req.PostalCode); err != nil {
			return err
		}
		return refresh(r.Context(), tx, pid)
	})
	if err != nil {
		return err
	}
	return s.Get(w, r)
}

// Upload takes one document as multipart/form-data: kind, id_type (for id_front / id_back) and file.
func (s *Service) Upload(w http.ResponseWriter, r *http.Request) error {
	pid := auth.From(r.Context()).Subject
	r.Body = http.MaxBytesReader(w, r.Body, MaxFileSize+64<<10)
	mr, err := r.MultipartReader()
	if err != nil {
		return httpx.Err(400, "bad_form", "send the file as multipart/form-data")
	}
	var kind, idType, name string
	var data []byte
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return httpx.Err(413, "file_too_large", "files can be up to 5 MB")
		}
		if err != nil {
			return httpx.Err(400, "bad_form", "cannot read the upload")
		}
		switch part.FormName() {
		case "kind", "id_type":
			v, _ := io.ReadAll(io.LimitReader(part, 64))
			if part.FormName() == "kind" {
				kind = strings.TrimSpace(string(v))
			} else {
				idType = strings.TrimSpace(string(v))
			}
		case "file":
			name = part.FileName()
			data, err = io.ReadAll(io.LimitReader(part, MaxFileSize+1))
			if errors.As(err, &mbe) || len(data) > MaxFileSize {
				return httpx.Err(413, "file_too_large", "files can be up to 5 MB")
			}
			if err != nil {
				return httpx.Err(400, "bad_form", "cannot read the upload")
			}
		}
		part.Close()
	}
	valid := false
	for _, k := range Kinds {
		valid = valid || k == kind
	}
	if !valid {
		return httpx.Err(400, "bad_kind", "kind must be id_front, id_back, address or selfie")
	}
	if kind == "id_front" || kind == "id_back" {
		if !IDTypes[idType] {
			return httpx.Err(400, "bad_id_type", "choose the document type: passport, id_card or driving_licence")
		}
	} else {
		idType = ""
	}
	if len(data) == 0 {
		return httpx.Err(400, "no_file", "choose a file to upload")
	}
	ctype, ext := sniff(data)
	if ctype == "" {
		return httpx.Err(415, "bad_file_type", "only JPG, PNG and PDF files are accepted")
	}
	name, _ = clean(name, 120)
	if name == "" {
		name = kind + "." + ext
	}
	var id int64
	err = pgx.BeginFunc(r.Context(), s.Pool, func(tx pgx.Tx) error {
		ctx := r.Context()
		var verification, status string
		if err := tx.QueryRow(ctx, `SELECT verification FROM players WHERE id=$1 FOR UPDATE`, pid).Scan(&verification); err != nil {
			return err
		}
		if verification == "verified" {
			return httpx.Err(409, "already_verified", "your account is already verified")
		}
		err := tx.QueryRow(ctx, `SELECT status FROM kyc_documents WHERE player_id=$1 AND kind=$2 ORDER BY created_at DESC, id DESC LIMIT 1`, pid, kind).Scan(&status)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if status == "approved" {
			return httpx.Err(409, "already_approved", "this document is already approved")
		}
		key := "kyc/" + pid.String() + "/" + uuid.NewString() + "." + ext
		if err := s.Store.Put(ctx, tx, key, data); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO kyc_documents (player_id, kind, id_type, file_name, content_type, size, storage, storage_key)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, pid, kind, idType, name, ctype, len(data), s.Store.Name(), key).Scan(&id); err != nil {
			return err
		}
		return refresh(ctx, tx, pid)
	})
	if err != nil {
		return err
	}
	o, err := GetOverview(r.Context(), s.Pool, pid, false)
	if err != nil {
		return err
	}
	httpx.JSON(w, 201, map[string]any{"id": id, "overview": o})
	return nil
}

// PlayerFile serves one of the player's own documents.
func (s *Service) PlayerFile(w http.ResponseWriter, r *http.Request) error {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		return httpx.Err(400, "bad_id", "bad document id")
	}
	return s.ServeFile(w, r, id, auth.From(r.Context()).Subject)
}

// ServeFile writes a document's file. owner, when not uuid.Nil, must own the document.
func (s *Service) ServeFile(w http.ResponseWriter, r *http.Request, id int64, owner uuid.UUID) error {
	var player uuid.UUID
	var ctype, key, kind string
	err := s.Pool.QueryRow(r.Context(), `SELECT player_id, content_type, storage_key, kind FROM kyc_documents WHERE id=$1`, id).Scan(&player, &ctype, &key, &kind)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner != uuid.Nil && player != owner) {
		return httpx.Err(404, "not_found", "document not found")
	}
	if err != nil {
		return err
	}
	data, err := s.Store.Get(r.Context(), key)
	if err != nil {
		return err
	}
	ext := key[strings.LastIndex(key, ".")+1:]
	h := w.Header()
	h.Set("Content-Type", ctype)
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("Cache-Control", "no-store, private")
	h.Set("Pragma", "no-cache")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s-%d.%s"`, kind, id, ext))
	w.WriteHeader(200)
	_, _ = w.Write(data)
	return nil
}

// ---- Staff actions (called from the back office, which writes the audit log) ----

// Review approves or rejects one document. It returns the player and the document's previous status.
func Review(ctx context.Context, tx pgx.Tx, docID int64, staff uuid.UUID, approve bool, reason string) (uuid.UUID, string, error) {
	var player uuid.UUID
	var status string
	err := tx.QueryRow(ctx, `SELECT player_id, status FROM kyc_documents WHERE id=$1 FOR UPDATE`, docID).Scan(&player, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return player, "", httpx.Err(404, "not_found", "document not found")
	}
	if err != nil {
		return player, "", err
	}
	next := "approved"
	if !approve {
		next = "rejected"
		if strings.TrimSpace(reason) == "" {
			return player, status, httpx.Err(400, "reason_required", "give the player a reason for the rejection")
		}
	} else {
		reason = ""
	}
	if _, err := tx.Exec(ctx, `UPDATE kyc_documents SET status=$2, reject_reason=$3, reviewed_by=$4, reviewed_at=now() WHERE id=$1`,
		docID, next, strings.TrimSpace(reason), staff); err != nil {
		return player, status, err
	}
	if !approve {
		// The player has to upload a new document: the account is no longer waiting for review.
		if _, err := tx.Exec(ctx, `UPDATE players SET verification='not_verified' WHERE id=$1 AND verification='pending'`, player); err != nil {
			return player, status, err
		}
	}
	return player, status, nil
}

// Verify confirms the player's identity once every required document is approved. It returns the old status.
func Verify(ctx context.Context, tx pgx.Tx, player uuid.UUID) (string, error) {
	var verification string
	if err := tx.QueryRow(ctx, `SELECT verification FROM players WHERE id=$1 FOR UPDATE`, player).Scan(&verification); err != nil {
		return "", httpx.Err(404, "not_found", "player not found")
	}
	if verification == "verified" {
		return verification, httpx.Err(409, "already_verified", "the player is already verified")
	}
	cur, err := Documents(ctx, tx, player, true)
	if err != nil {
		return verification, err
	}
	if m := missing(required(cur), cur, "approved"); len(m) > 0 {
		return verification, httpx.Err(409, "docs_not_approved", "approve every required document first: "+strings.Join(m, ", "))
	}
	_, err = tx.Exec(ctx, `UPDATE players SET verification='verified' WHERE id=$1`, player)
	return verification, err
}

type QueueItem struct {
	PlayerID       uuid.UUID  `json:"player_id"`
	Email          string     `json:"email"`
	FullName       string     `json:"full_name"`
	Country        string     `json:"country"`
	Verification   string     `json:"verification"`
	PendingDocs    int64      `json:"pending_docs"`
	Documents      int64      `json:"documents"`
	OldestPending  *time.Time `json:"oldest_pending_at"`
	LastUploadedAt *time.Time `json:"last_uploaded_at"`
}

// Queue lists players waiting for a KYC review (status=pending), or every player who uploaded documents (status=all).
func Queue(ctx context.Context, db DB, status string, limit int) ([]QueueItem, error) {
	rows, err := db.Query(ctx, `SELECT p.id, p.email, p.full_name, p.country, p.verification,
			count(*) FILTER (WHERE d.status='pending'), count(*), min(d.created_at) FILTER (WHERE d.status='pending'), max(d.created_at)
		FROM players p JOIN kyc_documents d ON d.player_id=p.id
		GROUP BY p.id
		HAVING $1='all' OR p.verification='pending' OR count(*) FILTER (WHERE d.status='pending') > 0
		ORDER BY min(d.created_at) FILTER (WHERE d.status='pending') NULLS LAST, max(d.created_at) DESC LIMIT $2`, status, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[QueueItem])
}
