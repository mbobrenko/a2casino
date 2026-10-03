package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/mbobrenko/a2casino/backend/internal/httpx"
)

type Claims struct {
	Subject uuid.UUID
	Kind    string // player | staff
	Role    string // staff role
}

type ctxKey struct{}

type Issuer struct{ secret []byte }

func NewIssuer(secret string) *Issuer { return &Issuer{secret: []byte(secret)} }

func (i *Issuer) Issue(sub uuid.UUID, kind, role string, ttl time.Duration) (string, error) {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": sub.String(), "kind": kind, "role": role,
		"exp": time.Now().Add(ttl).Unix(), "iat": time.Now().Unix(),
	})
	return t.SignedString(i.secret)
}

func (i *Issuer) Parse(token string) (Claims, error) {
	t, err := jwt.Parse(token, func(t *jwt.Token) (any, error) { return i.secret, nil }, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !t.Valid {
		return Claims{}, err
	}
	m := t.Claims.(jwt.MapClaims)
	sub, err := uuid.Parse(m["sub"].(string))
	if err != nil {
		return Claims{}, err
	}
	role, _ := m["role"].(string)
	kind, _ := m["kind"].(string)
	return Claims{Subject: sub, Kind: kind, Role: role}, nil
}

// Require returns middleware that accepts a bearer token of the given kind
// and, for staff, one of the allowed roles (admin always passes).
func (i *Issuer) Require(kind string, roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			c, err := i.Parse(strings.TrimPrefix(h, "Bearer "))
			if err != nil || !strings.HasPrefix(h, "Bearer ") || c.Kind != kind {
				httpx.Fail(w, httpx.Err(http.StatusUnauthorized, "unauthorized", "login required"))
				return
			}
			if kind == "staff" && len(roles) > 0 && c.Role != "admin" && !contains(roles, c.Role) {
				httpx.Fail(w, httpx.Err(http.StatusForbidden, "forbidden", "role "+c.Role+" cannot do this"))
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, c)))
		})
	}
}

func From(ctx context.Context) Claims {
	c, _ := ctx.Value(ctxKey{}).(Claims)
	return c
}

func HashPassword(p string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(p), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
