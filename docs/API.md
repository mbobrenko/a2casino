# A2Casino API (v0.1)

Base URL: `http://localhost:8080`. JSON everywhere. Money is integer **cents** (USD).
Errors: `{"code": "insufficient_funds", "message": "..."}` with a 4xx/5xx status.
Auth: `Authorization: Bearer <token>` (player tokens and staff tokens are different kinds).
For local testing the player's network country can be faked with the `X-Country: CL` header.

## Player

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{email, password, country, birth_date: "YYYY-MM-DD", ref?}` | `{token, player_id}`; 403 `country_blocked` / `underage`, 409 `email_taken` |
| POST | `/api/auth/login` | `{email, password}` | `{token, player_id}` |
| GET | `/api/me` | | `{id, email, country, currency, status, verification, created_at, balance: {currency, real, bonus, locked}}` |
| GET | `/api/wallet/transactions?limit=` | | `{items: [{id, type, amount, meta, created_at}]}`; `amount` is the signed change of real + bonus |
| GET | `/api/games?category=` | (no auth) | `{categories: [...], games: [{id, slug, title, provider, category, rtp, is_new}]}` |
| POST | `/api/games/{slug}/launch` | | `{type: "iframe", url, game}` or `{type: "originals", game}` |
| GET | `/api/originals/dice/seed` | | `{server_seed_hash, client_seed, nonce, previous_server_seed}` |
| POST | `/api/originals/dice/seed` | `{client_seed?}` | new seed; reveals the previous server seed |
| POST | `/api/originals/dice/bet` | `{amount, target}` (win if roll < target, 2..98) | `{roll, target, multiplier, win, nonce, client_seed, server_seed_hash, balance}` |
| GET | `/api/payments/methods` | (no auth) | `{methods: [{code, title, kind: fiat/crypto, network?, min_cents}]}` |
| POST | `/api/payments/deposit` | `{method, amount}` | fiat: `{type: "redirect", url, payment_id}`; crypto: `{type: "address", network, address, min_cents, note}` |
| POST | `/api/payments/withdraw` | `{method, amount, address?}` | `{payment_id, status: "pending"}`; 403 `kyc_required` until verified |
| GET | `/api/payments` | | `{items: [{id, direction, method, amount, status, address, external_ref, crypto_amount, created_at}]}` |
| POST | `/api/dev/crypto/simulate` | `{method, amount_usd_cents, risk?: "high"}` | dev only: pretends the player sent crypto |

## Back office (staff token; roles admin, finance, support)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| POST | `/api/bo/login` | `{email, password}` | `{token, role, email}`. Seed admin: `admin@a2casino.local` / `admin12345` |
| GET | `/api/bo/dashboard` | | `{players, new_today, deposits_today, withdrawals_today, pending_withdrawals, turnover_today, ggr_today}` |
| GET | `/api/bo/players?q=&limit=&offset=` | q = email part, id or tag | `{items: [{id, email, country, status, verification, tags, real, bonus, created_at}]}` |
| GET | `/api/bo/players/{id}` | | `{player: {...}, balance: {...}, stats: {deposits_count, deposits_sum, withdrawals_count, withdrawals_sum, pending_withdrawals_sum, inout, bets_count, wins_count, turnover, total_win, ggr, first_deposit_at, last_bet_at}}` |
| GET | `/api/bo/players/{id}/rounds?limit=` | | bet log: `{items: [{id, round_id, game, provider, bet_real, bet_bonus, win_real, win_bonus, status, details, created_at}]}` |
| GET | `/api/bo/players/{id}/payments` | | deposits and withdrawals |
| GET | `/api/bo/players/{id}/transactions` | | ledger: `{items: [{id, type, amount (signed), meta, created_at, real_balance_after}]}` |
| GET | `/api/bo/players/{id}/audit` | | `{items: [{id, action, before, after, comment, created_at, staff}]}` |
| POST | `/api/bo/players/{id}/update` | one of `{status: active/blocked}`, `{verification: new/not_verified/manual_review/duplicate/verified}`, `{withdrawals_blocked: bool}`, `{add_tag}`, `{remove_tag}` plus required `comment` | |
| POST | `/api/bo/players/{id}/adjust` | `{kind: real/bonus, amount (signed), comment}` | finance/admin |
| GET | `/api/bo/withdrawals?status=pending` | | queue with anti-fraud fields: `first_deposit_at, deposits_count, deposits_sum, withdrawals_count, turnover, payment_speed_hours` |
| POST | `/api/bo/withdrawals/{id}/approve` / `reject` | | finance/admin |

## Provider callbacks (seamless wallet)

Signed with `X-Signature: hex(HMAC-SHA256(secret, body))`. Body `{token, round_id, tx_id, amount}`.
`POST /api/provider/mock/{balance|bet|win|rollback}` → `{balance, currency}`. Repeating a `tx_id` is a no-op.

## Payment webhooks

`POST /api/webhooks/mockpsp` `{payment_id, status: success/failed, psp_ref}` and
`POST /api/webhooks/mockcrypto` `{network, address, tx_hash, amount_usd_cents, crypto_amount, confirmations, risk}`, both HMAC-signed.
A crypto deposit is credited once `confirmations >= CRYPTO_CONFIRMATIONS`; `risk: "high"` freezes it and blocks withdrawals.
