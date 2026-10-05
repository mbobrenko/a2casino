package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/mbobrenko/a2casino/backend/internal/aml"
	"github.com/mbobrenko/a2casino/backend/internal/auth"
	"github.com/mbobrenko/a2casino/backend/internal/backoffice"
	"github.com/mbobrenko/a2casino/backend/internal/config"
	"github.com/mbobrenko/a2casino/backend/internal/db"
	"github.com/mbobrenko/a2casino/backend/internal/games"
	"github.com/mbobrenko/a2casino/backend/internal/httpx"
	"github.com/mbobrenko/a2casino/backend/internal/payments"
	"github.com/mbobrenko/a2casino/backend/internal/player"
	"github.com/mbobrenko/a2casino/backend/internal/promo"
	"github.com/mbobrenko/a2casino/backend/internal/wallet"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := connectWithRetry(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	w := wallet.New(pool)
	issuer := auth.NewIssuer(cfg.JWTSecret)
	if err := backoffice.SeedAdmin(ctx, w, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	go expireBonuses(ctx, &promo.Service{Wallet: w})
	go syncSanctions(ctx, &aml.Service{Pool: pool})

	srv := &http.Server{Addr: cfg.Addr, Handler: Router(cfg, w, issuer), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		log.Printf("api listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdown, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdown)
}

// expireBonuses closes bonuses whose time ran out, once a minute.
func expireBonuses(ctx context.Context, s *promo.Service) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for range t.C {
		if n, err := s.ExpireDue(ctx); err != nil {
			log.Printf("bonus expiry: %v", err)
		} else if n > 0 {
			log.Printf("bonus expiry: closed %d bonuses", n)
		}
	}
}

// syncSanctions loads the bundled OFAC address list, then refreshes it online once a day.
func syncSanctions(ctx context.Context, s *aml.Service) {
	if n, err := s.SyncOFAC(ctx, false); err != nil {
		log.Printf("aml: ofac snapshot: %v", err)
	} else {
		log.Printf("aml: %d sanctioned addresses loaded", n)
	}
	for {
		if n, err := s.SyncOFAC(ctx, true); err != nil {
			log.Printf("aml: ofac refresh: %v", err)
		} else {
			log.Printf("aml: ofac list refreshed, %d addresses", n)
		}
		time.Sleep(24 * time.Hour)
	}
}

func amlService(cfg config.Config, w *wallet.Wallet) *aml.Service {
	s := &aml.Service{Pool: w.Pool}
	if cfg.ChainalysisAPIKey != "" {
		s.Providers = append(s.Providers, aml.Chainalysis{APIKey: cfg.ChainalysisAPIKey})
	}
	return s
}

func Router(cfg config.Config, w *wallet.Wallet, issuer *auth.Issuer) http.Handler {
	pr := &promo.Service{Wallet: w}
	players := &player.Service{Cfg: cfg, Wallet: w, Auth: issuer, Promo: pr}
	gm := &games.Service{Cfg: cfg, Wallet: w, Auth: issuer, Promo: pr}
	am := amlService(cfg, w)
	pay := &payments.Service{Cfg: cfg, Wallet: w, Promo: pr, AML: am}
	bo := &backoffice.Service{Wallet: w, Auth: issuer, Payments: pay, Promo: pr, AML: am}
	h := httpx.Handler

	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer, middleware.Timeout(15*time.Second))
	r.Use(cors(cfg.CORSOrigins))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { httpx.JSON(w, 200, map[string]string{"status": "ok"}) })

	r.Route("/api", func(r chi.Router) {
		limited := rateLimit(cfg.AuthRateLimit, time.Minute)
		r.With(limited).Post("/auth/register", h(players.Register))
		r.With(limited).Post("/auth/login", h(players.Login))
		r.Get("/games", h(gm.Lobby))
		r.Get("/lobby", h(gm.LobbyHome))
		r.Get("/promo/offers", h(pr.Offers))
		r.Get("/vip/levels", h(pr.VipLevels))
		r.Get("/payments/methods", h(pay.ListMethods))

		r.Group(func(r chi.Router) {
			r.Use(issuer.Require("player"))
			r.Get("/me", h(players.Me))
			r.Get("/wallet/transactions", h(players.Transactions))
			r.Get("/profile", h(players.Profile))
			r.Get("/rounds", h(gm.PlayerRounds))
			r.Get("/bonuses", h(pr.MyBonuses))
			r.Post("/promo/redeem", h(pr.RedeemHandler))
			r.Post("/bonuses/offers/{id}/claim", h(pr.ClaimOfferHandler))
			r.Post("/bonuses/{id}/cancel", h(pr.CancelHandler))
			r.Post("/bonuses/{id}/freespin", h(pr.FreeSpinHandler))
			r.Get("/vip", h(pr.VipHandler))
			r.Post("/vip/claim-cashback", h(pr.ClaimCashbackHandler()))
			r.Post("/vip/claim-rakeback", h(pr.ClaimRakebackHandler()))
			r.Post("/games/{slug}/launch", h(gm.Launch))
			r.Get("/originals/dice/seed", h(gm.DiceSeed))
			r.Post("/originals/dice/seed", h(gm.DiceRotate))
			r.Post("/originals/dice/bet", h(gm.DiceBet))
			r.Post("/payments/deposit", h(pay.Deposit))
			r.Post("/payments/withdraw", h(pay.Withdraw))
			r.Get("/payments", h(pay.History))
			if cfg.DevTools {
				r.Post("/dev/crypto/simulate", h(pay.SimulateCrypto))
			}
		})

		// Provider and PSP callbacks are authenticated by HMAC signatures, not tokens.
		r.Post("/provider/mock/balance", h(gm.CBBalance))
		r.Post("/provider/mock/bet", h(gm.CBBet))
		r.Post("/provider/mock/win", h(gm.CBWin))
		r.Post("/provider/mock/rollback", h(gm.CBRollback))
		r.Post("/webhooks/mockpsp", h(pay.PSPWebhook))
		r.Post("/webhooks/mockcrypto", h(pay.CryptoWebhook))
		r.Post("/webhooks/nowpayments", h(pay.NOWPaymentsIPN))

		r.Route("/bo", func(r chi.Router) {
			r.With(limited).Post("/login", h(bo.Login))
			r.Group(func(r chi.Router) {
				r.Use(issuer.Require("staff", "support", "finance", "marketing"))
				r.Get("/dashboard", h(bo.Dashboard))
				r.Get("/players", h(bo.Players))
				r.Get("/players/{id}", h(bo.Player))
				r.Get("/players/{id}/rounds", h(bo.Rounds))
				r.Get("/players/{id}/payments", h(bo.PlayerPayments))
				r.Get("/players/{id}/transactions", h(bo.Transactions))
				r.Get("/players/{id}/audit", h(bo.Audit))
				r.Post("/players/{id}/update", h(bo.Update))
				r.Get("/players/{id}/bonuses", h(bo.PlayerBonuses))
				r.Get("/games", h(bo.Games))
				r.Get("/providers", h(bo.Providers))
				r.Get("/bonuses", h(bo.Bonuses))
				r.Get("/promocodes", h(bo.PromoCodes))
				r.Get("/vip", h(bo.VipLevels))
				r.Get("/banners", h(bo.Banners))
				r.Get("/audit", h(bo.AuditLog))
				r.Get("/aml/addresses", h(bo.AMLAddresses))
				r.Get("/aml/screenings", h(bo.AMLScreenings))
				r.Post("/aml/check", h(bo.AMLCheck))
			})
			// Marketing and catalog management.
			r.Group(func(r chi.Router) {
				r.Use(issuer.Require("staff", "marketing"))
				r.Post("/games/{id}", h(bo.UpdateGame))
				r.Post("/providers/{code}", h(bo.UpdateProvider))
				r.Post("/bonuses", h(bo.CreateBonus))
				r.Post("/bonuses/{id}", h(bo.UpdateBonus))
				r.Post("/promocodes", h(bo.CreatePromoCode))
				r.Post("/promocodes/{code}", h(bo.UpdatePromoCode))
				r.Post("/vip/{level}", h(bo.UpdateVipLevel))
				r.Post("/banners", h(bo.CreateBanner))
				r.Post("/banners/{id}", h(bo.UpdateBanner))
				r.Post("/players/{id}/bonuses", h(bo.GrantBonus))
				r.Post("/players/{id}/bonuses/{pb}/cancel", h(bo.CancelPlayerBonus))
			})
			r.Group(func(r chi.Router) {
				r.Use(issuer.Require("staff", "finance"))
				r.Post("/players/{id}/adjust", h(bo.Adjust))
				r.Get("/withdrawals", h(bo.Withdrawals))
				r.Post("/withdrawals/{id}/approve", h(bo.Approve()))
				r.Post("/withdrawals/{id}/reject", h(bo.Reject()))
				r.Post("/aml/addresses", h(bo.AMLAddAddress))
				r.Post("/aml/addresses/remove", h(bo.AMLRemoveAddress))
			})
		})
	})

	// Mock third parties, served from the same binary for local development.
	if cfg.DevTools {
		r.Get("/mockprovider/game", gm.MockGamePage)
		r.Post("/mockprovider/balance", h(gm.MockBalance))
		r.Post("/mockprovider/spin", h(gm.MockSpin))
		r.Get("/mockpsp/checkout", h(pay.MockCheckout))
		r.Post("/mockpsp/complete", h(pay.MockComplete))
	}
	return r
}

func cors(origins []string) func(http.Handler) http.Handler {
	allowed := map[string]bool{}
	for _, o := range origins {
		allowed[strings.TrimSpace(o)] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if o := r.Header.Get("Origin"); allowed[o] {
				w.Header().Set("Access-Control-Allow-Origin", o)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Country")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// rateLimit is a per-IP fixed window limiter for login and registration.
// In production this moves to Redis / the edge (Cloudflare) so it works across instances.
func rateLimit(n int, window time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	hits := map[string]int{}
	start := time.Now()
	return func(next http.Handler) http.Handler {
		if n <= 0 {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			if time.Since(start) > window {
				hits, start = map[string]int{}, time.Now()
			}
			ip := player.ClientIP(r)
			hits[ip]++
			over := hits[ip] > n
			mu.Unlock()
			if over {
				httpx.Fail(w, httpx.Err(http.StatusTooManyRequests, "rate_limited", "too many attempts, try again later"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
