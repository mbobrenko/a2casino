package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"testing"
)

var (
	testPNG  = append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'}, bytes.Repeat([]byte{1}, 100)...)
	testJPEG = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, bytes.Repeat([]byte{2}, 100)...)
	testPDF  = []byte("%PDF-1.4\n% test\n%%EOF\n")
)

func (h *apiHarness) upload(token string, fields map[string]string, name string, data []byte) (int, map[string]any) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequest(http.MethodPost, h.srv.URL+"/api/kyc/documents", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func (h *apiHarness) get(path, token string) (*http.Response, []byte) {
	req, _ := http.NewRequest(http.MethodGet, h.srv.URL+path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, b
}

// KYC: profile details, document upload with type checks, private file access, staff review and verification.
func TestKYC(t *testing.T) {
	h := newAPIHarness(t)
	staff := h.staff()
	tok, pid, _ := h.register()

	o := h.must(200, "/api/kyc", tok, nil)
	if o["verification"] != "new" || len(o["missing"].([]any)) != 4 {
		t.Fatalf("initial kyc: %v", o)
	}
	// Type and size checks use the file's bytes, not its name.
	if code, out := h.upload(tok, map[string]string{"kind": "id_front", "id_type": "passport"}, "passport.jpg", []byte("GIF89a not really")); code != 415 || out["code"] != "bad_file_type" {
		t.Fatalf("gif accepted: %d %v", code, out)
	}
	big := append(append([]byte{}, testJPEG...), make([]byte, 5<<20)...)
	if code, out := h.upload(tok, map[string]string{"kind": "id_front", "id_type": "passport"}, "big.jpg", big); code != 413 || out["code"] != "file_too_large" {
		t.Fatalf("6 MB accepted: %d %v", code, out)
	}
	if code, out := h.upload(tok, map[string]string{"kind": "id_front"}, "id.png", testPNG); code != 400 || out["code"] != "bad_id_type" {
		t.Fatalf("missing id type: %d %v", code, out)
	}
	if code, out := h.upload(tok, map[string]string{"kind": "id_front", "id_type": "passport"}, "passport.png", testPNG); code != 201 {
		t.Fatalf("upload: %d %v", code, out)
	} else if m := out["overview"].(map[string]any)["missing"].([]any); len(m) != 2 {
		t.Fatalf("a passport needs no back side: missing %v", m)
	}
	h.upload(tok, map[string]string{"kind": "address"}, "bill.pdf", testPDF)
	code, up := h.upload(tok, map[string]string{"kind": "selfie"}, "selfie.jpg", testJPEG)
	if code != 201 {
		t.Fatalf("selfie: %d %v", code, up)
	}
	selfie := int64(up["id"].(float64))
	// Documents are in, but the profile is not complete yet.
	if v := h.must(200, "/api/kyc", tok, nil)["verification"]; v != "new" {
		t.Fatalf("verification without profile: %v", v)
	}
	h.fail(403, "underage", "/api/kyc/profile", tok, map[string]any{"full_name": "Ana Perez", "birth_date": "2015-01-01", "address": "Av. Siempre Viva 742", "city": "Santiago"})
	h.fail(400, "bad_full_name", "/api/kyc/profile", tok, map[string]any{"full_name": "Ana", "birth_date": "1990-01-01", "address": "Av. Siempre Viva 742", "city": "Santiago"})
	o = h.must(200, "/api/kyc/profile", tok, map[string]any{"full_name": " Ana  Perez ", "birth_date": "1991-02-03", "address": "Av. Siempre Viva 742", "city": "Santiago", "postal_code": "8320000"})
	if o["verification"] != "pending" || o["profile"].(map[string]any)["full_name"] != "Ana Perez" {
		t.Fatalf("after profile: %v", o)
	}

	// Files: the owner and staff only, with the detected type and no caching.
	path := fmt.Sprintf("/api/kyc/documents/%d/file", selfie)
	resp, body := h.get(path, tok)
	if resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/jpeg" || resp.Header.Get("Cache-Control") != "no-store, private" || !bytes.Equal(body, testJPEG) {
		t.Fatalf("own file: %d %v", resp.StatusCode, resp.Header)
	}
	other, _, _ := h.register()
	if resp, _ := h.get(path, other); resp.StatusCode != 404 {
		t.Fatalf("another player's file: %d", resp.StatusCode)
	}
	if resp, _ := h.get(path, ""); resp.StatusCode != 401 {
		t.Fatalf("anonymous file: %d", resp.StatusCode)
	}
	if resp, _ := h.get(fmt.Sprintf("/api/bo/kyc/documents/%d/file", selfie), tok); resp.StatusCode != 401 {
		t.Fatalf("player token on the staff file endpoint: %d", resp.StatusCode)
	}
	if resp, body := h.get(fmt.Sprintf("/api/bo/kyc/documents/%d/file", selfie), staff); resp.StatusCode != 200 || !bytes.Equal(body, testJPEG) {
		t.Fatalf("staff file: %d", resp.StatusCode)
	}

	// Review: the queue, a rejection with a reason the player sees, re-upload, approval and verification.
	queued := false
	for _, x := range h.must(200, "/api/bo/kyc", staff, nil)["items"].([]any) {
		if m := x.(map[string]any); m["player_id"] == pid.String() && m["pending_docs"].(float64) == 3 {
			queued = true
		}
	}
	if !queued {
		t.Fatalf("player not in the KYC queue")
	}
	h.fail(400, "reason_required", fmt.Sprintf("/api/bo/kyc/documents/%d/review", selfie), staff, map[string]any{"decision": "reject"})
	h.must(200, fmt.Sprintf("/api/bo/kyc/documents/%d/review", selfie), staff, map[string]any{"decision": "reject", "reason": "Your face is not visible"})
	o = h.must(200, "/api/kyc", tok, nil)
	if o["verification"] != "not_verified" {
		t.Fatalf("after rejection: %v", o["verification"])
	}
	for _, x := range o["documents"].([]any) {
		if d := x.(map[string]any); d["kind"] == "selfie" && (d["status"] != "rejected" || d["reject_reason"] != "Your face is not visible") {
			t.Fatalf("rejected selfie: %v", d)
		}
	}
	h.fail(409, "docs_not_approved", "/api/bo/players/"+pid.String()+"/kyc/verify", staff, map[string]any{"comment": "ok"})
	if code, out := h.upload(tok, map[string]string{"kind": "selfie"}, "selfie2.jpg", testJPEG); code != 201 || out["overview"].(map[string]any)["verification"] != "pending" {
		t.Fatalf("re-upload: %d %v", code, out)
	}
	card := h.must(200, "/api/bo/players/"+pid.String()+"/kyc", staff, nil)
	docs := card["documents"].([]any)
	if len(docs) != 4 {
		t.Fatalf("staff sees the full history: %d documents", len(docs))
	}
	for _, x := range docs {
		if d := x.(map[string]any); d["status"] == "pending" {
			h.must(200, fmt.Sprintf("/api/bo/kyc/documents/%d/review", int64(d["id"].(float64))), staff, map[string]any{"decision": "approve"})
		}
	}
	if code, out := h.upload(tok, map[string]string{"kind": "selfie"}, "selfie3.jpg", testJPEG); code != 409 || out["code"] != "already_approved" {
		t.Fatalf("upload over an approved document: %d %v", code, out)
	}
	h.fail(400, "comment_required", "/api/bo/players/"+pid.String()+"/kyc/verify", staff, map[string]any{})
	h.must(200, "/api/bo/players/"+pid.String()+"/kyc/verify", staff, map[string]any{"comment": "documents match"})
	if v := h.must(200, "/api/me", tok, nil)["verification"]; v != "verified" {
		t.Fatalf("after verify: %v", v)
	}
	h.fail(409, "profile_locked", "/api/kyc/profile", tok, map[string]any{"full_name": "Ana Perez", "birth_date": "1991-02-03", "address": "Elsewhere 1", "city": "Lima"})
	actions := map[string]int{}
	for _, x := range h.must(200, "/api/bo/players/"+pid.String()+"/audit", staff, nil)["items"].([]any) {
		actions[x.(map[string]any)["action"].(string)]++
	}
	if actions["kyc_document_reject"] != 1 || actions["kyc_document_approve"] != 3 || actions["verification"] != 1 {
		t.Fatalf("audit: %v", actions)
	}
}
