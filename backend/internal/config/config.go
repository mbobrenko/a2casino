package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Addr                string
	DatabaseURL         string
	JWTSecret           string
	PublicURL           string // where this API is reachable from the browser
	CallbackURL         string // where the mock provider reaches the casino callbacks
	WebURL              string // player site, for redirects after mock checkout
	MockProviderSecret  string
	PSPWebhookSecret    string
	CryptoWebhookSecret string
	BlockedCountries    map[string]bool
	CryptoConfirmations int
	AdminEmail          string
	AdminPassword       string
	CORSOrigins         []string
	AuthRateLimit       int  // login/register attempts per IP per minute, 0 = off
	DevTools            bool // mock provider, mock PSP and crypto simulator
}

func Load() Config {
	c := Config{
		Addr:                env("ADDR", ":8080"),
		DatabaseURL:         env("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/casino?sslmode=disable"),
		JWTSecret:           env("JWT_SECRET", "dev-secret-change-me"),
		PublicURL:           env("PUBLIC_URL", "http://localhost:8080"),
		CallbackURL:         env("CALLBACK_URL", "http://localhost:8080"),
		WebURL:              env("WEB_URL", "http://localhost:3000"),
		MockProviderSecret:  env("MOCK_PROVIDER_SECRET", "mock-provider-secret"),
		PSPWebhookSecret:    env("PSP_WEBHOOK_SECRET", "mock-psp-secret"),
		CryptoWebhookSecret: env("CRYPTO_WEBHOOK_SECRET", "mock-crypto-secret"),
		BlockedCountries:    map[string]bool{},
		AdminEmail:          env("ADMIN_EMAIL", "admin@a2casino.local"),
		AdminPassword:       env("ADMIN_PASSWORD", "admin12345"),
	}
	// Default block list: markets that require a local licence or prohibit online casino (see architecture doc).
	for _, cc := range strings.Split(env("BLOCKED_COUNTRIES", "US,GB,FR,ES,IT,NL,BR,CO,PE,AR,ZA,CN,IN,ID,VN,TH,MY,KR,JP,PH"), ",") {
		if cc = strings.TrimSpace(strings.ToUpper(cc)); cc != "" {
			c.BlockedCountries[cc] = true
		}
	}
	c.CryptoConfirmations, _ = strconv.Atoi(env("CRYPTO_CONFIRMATIONS", "3"))
	c.AuthRateLimit, _ = strconv.Atoi(env("AUTH_RATE_LIMIT", "20"))
	c.DevTools = env("DEV_TOOLS", "true") == "true"
	c.CORSOrigins = strings.Split(env("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001"), ",")
	return c
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
