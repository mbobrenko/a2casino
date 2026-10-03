package httpx

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
)

type Error struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *Error) Error() string { return e.Message }

func Err(status int, code, msg string) *Error {
	return &Error{Status: status, Code: code, Message: msg}
}

func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func Fail(w http.ResponseWriter, err error) {
	var e *Error
	if errors.As(err, &e) {
		JSON(w, e.Status, e)
		return
	}
	// Internal details go to the log, never to the client.
	log.Printf("internal error: %v", err)
	JSON(w, http.StatusInternalServerError, Err(500, "internal", "internal error"))
}

func Decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	if err := dec.Decode(v); err != nil {
		return Err(http.StatusBadRequest, "bad_json", "invalid JSON body")
	}
	return nil
}

func IntQuery(r *http.Request, name string, def, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || v <= 0 {
		return def
	}
	if v > max {
		return max
	}
	return v
}

// Handler adapts a func returning an error to http.HandlerFunc.
func Handler(fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			Fail(w, err)
		}
	}
}
