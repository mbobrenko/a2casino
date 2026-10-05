# A2Casino API (v0.3)

Base URL: `http://localhost:8080`. JSON everywhere. Money is integer **cents** (USD).
Errors: `{"code": "insufficient_funds", "message": "..."}` with a 4xx/5xx status.
Auth: `Authorization: Bearer <token>` (player tokens and staff tokens are different kinds).
For local testing the player's network country can be faked with the `X-Country: CL` header.

## Player

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `{email, password, country, birth_date: "YYYY-MM-DD", ref?}` | `{token, player_id}`; 403 `country_blocked` / `underage`, 409 `email_taken` |
| POST | `/api/auth/login` | `{email, password}` | `{token, player_id}` |
| GET | `/api/me` | | `{id, email, country, currency, status, verification, created_at, balance: {currency, real, bonus, locked}, exclusion}`; `exclusion` is the active time-out / self-exclusion (see below) or null; `verification` is new / not_verified / pending / manual_review / duplicate / verified |
| GET | `/api/wallet/transactions?limit=` | | `{items: [{id, type, amount, meta, created_at}]}`; `amount` is the signed change of real + bonus |
| GET | `/api/games?category=&studio=&q=&tag=` | (no auth) | `{categories: [...], games: [Game]}`; Game = `{id, slug, title, provider, category, rtp, is_new, studio, emoji, color, tags[], description}` |
| GET | `/api/lobby` | (auth optional) | `{banners: [{id, title, subtitle, cta_text, cta_link, color, emoji}], categories: [{code, title, games}], providers: [{code, title, games}], popular: [Game], new: [Game], recommended: [Game], recent: [Game]}`; recommended/recent are personal when a player token is sent |
| GET | `/api/profile` | | `/api/me` fields + `vip` (as in `/api/vip` status) + `stats: {bets, bet_sum, wins, win_sum, deposits, deposit_sum, withdrawals, withdrawal_sum}` |
| GET | `/api/rounds?limit=` | | bet history `{items: [{id, game, emoji, provider, bet, win, status, created_at}]}` |
| GET | `/api/promo/offers` | (no auth) | `{offers: [Bonus]}`; Bonus = `{id, title, description, kind: deposit_match/no_deposit/freespins, trigger, percent, max_amount, fixed_amount, min_deposit, wager_multiplier, freespins_count, freespin_value, freespin_game, valid_days, active}` |
| GET | `/api/bonuses` | | `{bonuses: [{id, bonus_id, title, description, kind, status: pending/active/completed/forfeited/expired/cancelled, source, amount, wager_required, wager_progress, freespins_left, freespins_won, freespin_game, min_deposit, created_at, expires_at, finished_at}], offers: [Bonus]}` |
| POST | `/api/promo/redeem` | `{code}` | `{player_bonus_id}`; 404 `promo_not_found`, 410 `promo_expired`, 409 `already_used` / `bonus_active` |
| POST | `/api/bonuses/offers/{bonus_id}/claim` | | takes a deposit offer: it waits as pending until a deposit ≥ min_deposit |
| POST | `/api/bonuses/{id}/cancel` | | cancels; an active bonus loses its remaining bonus balance |
| POST | `/api/bonuses/{id}/freespin` | | `{multiplier, win, spins_left, total_won, finished}` |
| GET | `/api/vip/levels` | (no auth) | `{levels: [{level, name, min_points, cashback_pct, rakeback_pct, perks}]}` |
| GET | `/api/vip` | | `{levels, status: {level, points, cashback_available, cashback_from, net_loss, rakeback_available}}`; 1 point = $1 of real-money bets |
| POST | `/api/vip/claim-cashback` / `claim-rakeback` | | `{amount}` credited to real balance; 409 `nothing_to_claim` below $1 |
| POST | `/api/games/{slug}/launch` | | `{type: "iframe", url, game}` or `{type: "originals", game}` |
| GET | `/api/originals/dice/seed` | | `{server_seed_hash, client_seed, nonce, previous_server_seed}` |
| POST | `/api/originals/dice/seed` | `{client_seed?}` | new seed; reveals the previous server seed |
| POST | `/api/originals/dice/bet` | `{amount, target}` (win if roll < target, 2..98) | `{roll, target, multiplier, win, nonce, client_seed, server_seed_hash, balance}` |
| GET | `/api/payments/methods` | (no auth) | `{methods: [{code, title, kind: fiat/crypto, network?, min_cents}]}` |
| POST | `/api/payments/deposit` | `{method, amount}` | fiat: `{type: "redirect", url, payment_id}`; crypto: `{type: "address", network, address, min_cents, note}` |
| POST | `/api/payments/withdraw` | `{method, amount, address?}` | `{payment_id, status: "pending"}`; 403 `kyc_required` until verified (see KYC below); allowed during a time-out / self-exclusion; 409 `bonus_active` while wagering a bonus |
| GET | `/api/payments` | | `{items: [{id, direction, method, amount, status, address, external_ref, crypto_amount, created_at}]}` |
| POST | `/api/dev/crypto/simulate` | `{method, amount_usd_cents, risk?: "high"}` | dev only: pretends the player sent crypto |

### Responsible gaming

Limits: `kind` deposit / loss / wager with `period` day / week / month, and `kind: "session", period: "day"` (play time,
amount in minutes). Money limits are in cents. Windows are rolling: day = last 24 hours, week = last 7 days, month = last 30 days.
Deposit usage = completed deposits + deposits started in the last hour that are still pending; loss = real bets − real wins
(can be negative); wager = real + bonus bets; play time = sum of activity sessions (a gap of 30 min ends a session).
Setting a new limit or lowering one applies immediately; raising or removing one is stored as pending and applies after
24 hours (`effective_at`). Changes are applied lazily on the next read/check.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/rg` | | `{limits: [Limit], reality_check_minutes, exclusion}`; Limit = `{kind, period, amount, pending, pending_amount, effective_at, updated_at, used}` (`amount` null = no limit; `pending` with `pending_amount` null = removal pending) |
| POST | `/api/rg/limits` | `{kind, period, amount}` (`amount: null` removes) | `{applied: bool, effective_at?}`; 400 `bad_kind` / `bad_period` / `bad_amount` |
| POST | `/api/rg/reality-check` | `{minutes}` (0 = off, up to 1440) | `{reality_check_minutes}`; 400 `bad_minutes` |
| POST | `/api/rg/session` | | heartbeat (the site sends it every minute while a tab is visible): `{started_at, elapsed_seconds, bets, wagered, won, net, reality_check_minutes, played_today_minutes, session_limit_minutes}` |
| POST | `/api/rg/exclude` | `{duration}`: time-out `24h` / `7d` / `30d` / `6w`, self-exclusion `6m` / `1y` / `5y` / `permanent` | `{exclusion}`; 400 `bad_duration`, 409 `exclusion_active` if it would end earlier than the current one (it can only be extended) |
| POST | `/api/rg/reopen` | | self-exclusion whose period is over: the account reopens 24 hours after this request; 409 `not_excluded` / `exclusion_not_over` |

Exclusion = `{id, kind: timeout/self_exclusion, duration, starts_at, ends_at (null = permanent), by_staff, reason?, reopen_requested_at, period_over, reopen_at}`.
A time-out ends by itself; a self-exclusion stays in force after `ends_at` until a reopen request + 24 hours.
While excluded the player can log in, see the balance and withdraw; everything else that moves money in is refused with
403 `timeout` or `self_excluded`: deposits, bets (dice, provider `bet` callbacks), free spins, claiming offers, promo codes,
staff-given bonuses. Pending deposit bonuses are cancelled when an exclusion starts, and deposit bonuses / marketing are
suppressed during it.

Limit errors (403): `deposit_limit`, `loss_limit`, `wager_limit` (message names the limit and what is left, e.g.
"this would exceed your daily deposit limit of $100.00: $40.00 left in the current 24 hours (rolling window)"),
`session_limit` (daily play time reached; games, launches and bets refused). For the loss limit a bet is refused if the
real-money part of the stake could take the net loss over the limit. Repeated provider `tx_id`s are not re-checked.

### KYC (identity verification)

Required documents: `id_front`, `id_back` (not for a passport), `address` (proof of address, ≤ 3 months old) and `selfie`
(holding the ID). `id_type` (for `id_front` / `id_back`): passport / id_card / driving_licence. Files: JPG, PNG or PDF,
up to 5 MB, the type is checked by content (magic bytes). Files are private: served only to the owner and to staff, with
`Cache-Control: no-store`. When every required document is uploaded (and none is rejected) `verification` becomes
`pending`; staff approve or reject each document, then confirm the identity (`verified`). Withdrawals need `verified`.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/api/kyc` | | Overview = `{verification, profile: {full_name, birth_date, country, address, city, postal_code}, required: [kind], missing: [kind], documents: [Document]}`; Document = `{id, kind, id_type, file_name, content_type, size, status: pending/approved/rejected, reject_reason, reviewed_at, created_at}` (current document of each kind) |
| POST | `/api/kyc/profile` | `{full_name, birth_date, address, city, postal_code}` | Overview; 400 `bad_full_name` / `bad_address` / `invalid_birth_date`, 403 `underage`, 409 `profile_locked` once verified |
| POST | `/api/kyc/documents` | multipart: `kind`, `id_type?`, `file` | 201 `{id, overview}`; 400 `bad_kind` / `bad_id_type` / `no_file`, 413 `file_too_large`, 415 `bad_file_type`, 409 `already_verified` / `already_approved` (a new upload replaces a pending or rejected one) |
| GET | `/api/kyc/documents/{id}/file` | | the file (own documents only) |


## Back office (staff token; roles admin, finance, support, marketing)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| POST | `/api/bo/login` | `{email, password}` | `{token, role, email}`. Seed admin: `admin@a2casino.local` / `admin12345` |
| GET | `/api/bo/dashboard` | | `{players, new_today, deposits_today, withdrawals_today, pending_withdrawals, turnover_today, ggr_today}` |
| GET | `/api/bo/players?q=&rg=&limit=&offset=` | q = email part, id or tag; rg = excluded / self_excluded / timeout | `{items: [{id, email, country, status, verification, tags, real, bonus, created_at, rg_exclusion}]}`; `rg_exclusion` = kind of the active exclusion or null |
| GET | `/api/bo/players/{id}` | | `{player: {...}, balance: {...}, stats: {deposits_count, deposits_sum, withdrawals_count, withdrawals_sum, pending_withdrawals_sum, inout, bets_count, wins_count, turnover, total_win, ggr, first_deposit_at, last_bet_at}}` |
| GET | `/api/bo/players/{id}/rounds?limit=` | | bet log: `{items: [{id, round_id, game, provider, bet_real, bet_bonus, win_real, win_bonus, status, details, created_at}]}` |
| GET | `/api/bo/players/{id}/payments` | | deposits and withdrawals |
| GET | `/api/bo/players/{id}/transactions` | | ledger: `{items: [{id, type, amount (signed), meta, created_at, real_balance_after}]}` |
| GET | `/api/bo/players/{id}/audit` | | `{items: [{id, action, before, after, comment, created_at, staff}]}` |
| POST | `/api/bo/players/{id}/update` | one of `{status: active/blocked}`, `{verification: new/not_verified/pending/manual_review/duplicate/verified}`, `{withdrawals_blocked: bool}`, `{add_tag}`, `{remove_tag}` plus required `comment` | |
| POST | `/api/bo/players/{id}/adjust` | `{kind: real/bonus, amount (signed), comment}` | finance/admin |
| GET | `/api/bo/withdrawals?status=pending` | | queue with anti-fraud fields: `first_deposit_at, deposits_count, deposits_sum, withdrawals_count, turnover, payment_speed_hours` |
| POST | `/api/bo/withdrawals/{id}/approve` / `reject` | | finance/admin |
| GET | `/api/bo/players/{id}/bonuses` | | player's bonuses (same shape as `/api/bonuses`) |
| POST | `/api/bo/players/{id}/bonuses` | `{bonus_id, comment}` | marketing/admin: give a bonus |
| POST | `/api/bo/players/{id}/bonuses/{pb}/cancel` | `{comment}` | marketing/admin |
| GET | `/api/bo/games?q=&category=&status=` | | `{games: [{id, slug, title, provider, studio, category, status, rtp, sort_order, is_new, blocked_countries, tags, emoji, color, rounds_30d, turnover_30d, ggr_30d}]}` |
| POST | `/api/bo/games/{id}` | any of `{title, category, status: live/hidden/draft/announced/closed, sort_order, is_new, blocked_countries[], tags[], emoji, color, comment}` | marketing/admin |
| GET / POST | `/api/bo/providers`, `/api/bo/providers/{code}` | `{status: live/hidden, blocked_countries[], sort_order, comment}` | a hidden provider hides all its games |
| GET | `/api/bo/bonuses` | | Bonus fields + `given, active_count, completed, granted_sum` |
| POST | `/api/bo/bonuses`, `/api/bo/bonuses/{id}` | Bonus fields (create needs title, kind, trigger) | marketing/admin |
| GET | `/api/bo/promocodes` | | `{promo_codes: [{code, bonus_id, bonus_title, bonus_kind, max_uses, uses, expires_at, active, created_at}]}` |
| POST | `/api/bo/promocodes` | `{code, bonus_id, max_uses (0 = unlimited), expires_at?}` | marketing/admin |
| POST | `/api/bo/promocodes/{code}` | `{active?, max_uses?}` | |
| GET | `/api/bo/vip` / POST `/api/bo/vip/{level}` | `{name, min_points, cashback_pct, rakeback_pct, perks}` | list includes `players` per level |
| GET | `/api/bo/banners` / POST `/api/bo/banners`, `/api/bo/banners/{id}` | `{title, subtitle, cta_text, cta_link, color, emoji, sort_order, active, countries[], starts_at, ends_at}` | |
| GET | `/api/bo/audit?action=&limit=` | | all staff actions: `{items: [{id, action, player_id, player_email, staff_email, before, after, comment, created_at}]}` |

The player card (`GET /api/bo/players/{id}`) also returns `vip` and `vip_name`.

### Responsible gaming and KYC

Staff can only make a player's limits stricter (set a new limit or lower one, immediately) and only apply or extend
exclusions; they cannot raise/remove limits or shorten/lift an exclusion (403 `not_stricter`, 409 `exclusion_active`).
Every change needs a comment and is written to the audit log (`rg_limit`, `rg_exclusion`, `kyc_document_approve`,
`kyc_document_reject`, `verification`). Write actions: admin, support, finance.

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/api/bo/players/{id}/rg` | | `{limits: [Limit], reality_check_minutes, exclusion, history: [{id, action, kind, period, before, after, created_at, staff}]}` (`staff` null = the player or the system) |
| POST | `/api/bo/players/{id}/rg/limits` | `{kind, period, amount, comment}` | stricter only |
| POST | `/api/bo/players/{id}/rg/exclude` | `{duration, comment}` | time-out or self-exclusion on the player's behalf; the comment is stored as the reason |
| GET | `/api/bo/kyc?status=pending|all&limit=` | | queue: `{items: [{player_id, email, full_name, country, verification, pending_docs, documents, oldest_pending_at, last_uploaded_at}]}`, oldest pending first |
| GET | `/api/bo/players/{id}/kyc` | | KYC Overview with all documents (history included) and `reviewed_by` |
| GET | `/api/bo/kyc/documents/{doc}/file` | | the file, `Cache-Control: no-store` |
| POST | `/api/bo/kyc/documents/{doc}/review` | `{decision: approve/reject, reason?}` | reject needs `reason` (shown to the player; status goes back to `not_verified`) |
| POST | `/api/bo/players/{id}/kyc/verify` | `{comment}` | sets `verified`; 409 `docs_not_approved` until every required document is approved, `already_verified` |

### AML: wallet address screening

Crypto withdrawal addresses are screened when the player requests the payout and again on approval:
OFAC sanctioned addresses (bundled list, refreshed daily) and the staff blacklist are `severe` (request refused with 403
`address_blocked`, player gets `withdrawals_blocked` + tag `aml_review`; approval refused with 409 `address_blocked`),
an address already used by another player is `high`. With `CHAINALYSIS_API_KEY` set, Chainalysis' free sanctions API
is also queried; if it is down the result is `medium` ("check manually"). Withdrawals carry `risk` and `risk_reasons`.

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| GET | `/api/bo/aml/addresses?list=manual|ofac|blacklist|whitelist&q=` | | `{items: [{address, list, network, reason, added_by, created_at}], counts: {ofac, blacklist, whitelist}}` |
| POST | `/api/bo/aml/addresses` | `{address, list: blacklist/whitelist, network?, comment}` | finance/admin |
| POST | `/api/bo/aml/addresses/remove` | `{address, comment}` | staff lists only; OFAC entries can't be removed |
| GET | `/api/bo/aml/screenings?risk=&limit=` | | screening log |
| POST | `/api/bo/aml/check` | `{address, network?}` | `{risk: low/medium/high/severe, reasons, providers}` |

## Provider callbacks (seamless wallet)

Signed with `X-Signature: hex(HMAC-SHA256(secret, body))`. Body `{token, round_id, tx_id, amount}`.
`POST /api/provider/mock/{balance|bet|win|rollback}` → `{balance, currency}`. Repeating a `tx_id` is a no-op.

## Payment webhooks

`POST /api/webhooks/nowpayments`: NOWPayments IPN, signed with `x-nowpayments-sig` = hex(HMAC-SHA512(IPN secret, body with keys sorted)).
Deposits with method `nowpayments` create a hosted invoice and return `{type: "redirect", url}`; only `payment_status: finished`
credits the balance, `partially_paid` is left for staff. The method is listed only when `NOWPAYMENTS_API_KEY` is set
(`NOWPAYMENTS_API_URL` defaults to the sandbox). Deposits only.


`POST /api/webhooks/mockpsp` `{payment_id, status: success/failed, psp_ref}` and
`POST /api/webhooks/mockcrypto` `{network, address, tx_hash, amount_usd_cents, crypto_amount, confirmations, risk}`, both HMAC-signed.
A crypto deposit is credited once `confirmations >= CRYPTO_CONFIRMATIONS`; `risk: "high"` freezes it and blocks withdrawals.
