# A2Casino API (v0.4)

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
| GET | `/api/games?category=&studio=&q=&tag=` | (no auth) | `{categories: [...], games: [Game]}`; Game = `{id, slug, title, provider, category, rtp, is_new, studio, emoji, color, tags[], description, wagering_contribution, max_win}` (wagering_contribution: percent of each bet counted towards bonus wagering; rtp: for originals the RTP version the game runs at now; max_win: originals' maximum win per bet in cents, null = none) |
| GET | `/api/lobby` | (auth optional) | `{banners: [{id, title, subtitle, cta_text, cta_link, color, emoji}], categories: [{code, title, games}], providers: [{code, title, games}], popular: [Game], new: [Game], recommended: [Game], recent: [Game]}`; recommended/recent are personal when a player token is sent |
| GET | `/api/profile` | | `/api/me` fields + `vip` (as in `/api/vip` status) + `stats: {bets, bet_sum, wins, win_sum, deposits, deposit_sum, withdrawals, withdrawal_sum}` |
| GET | `/api/rounds?limit=` | | bet history `{items: [{id, game, slug, emoji, color, provider, bet, win, status, created_at}]}` (`game` is the title; `slug` and `color` let the site show the game's cover) |
| GET | `/api/promo/offers` | (no auth) | `{offers: [Bonus]}`; Bonus = `{id, title, description, kind: deposit_match/no_deposit/freespins, trigger, percent, max_amount, fixed_amount, min_deposit, wager_multiplier, freespins_count, freespin_value, freespin_game, valid_days, active, max_bet}` (max_bet: cents per bet while the bonus is active, 0 = no limit) |
| GET | `/api/bonuses` | | `{bonuses: [{id, bonus_id, title, description, kind, status: pending/active/completed/forfeited/expired/cancelled, source, amount, wager_required, wager_progress, freespins_left, freespins_won, freespin_game, min_deposit, max_bet, created_at, expires_at, finished_at}], offers: [Bonus]}` |
| POST | `/api/promo/redeem` | `{code}` | `{player_bonus_id}`; 404 `promo_not_found`, 410 `promo_expired`, 409 `already_used` / `bonus_active` |
| POST | `/api/bonuses/offers/{bonus_id}/claim` | | takes a deposit offer: it waits as pending until a deposit ≥ min_deposit |
| POST | `/api/bonuses/{id}/cancel` | | cancels; an active bonus loses its remaining bonus balance |
| POST | `/api/bonuses/{id}/freespin` | | `{multiplier, win, spins_left, total_won, finished}` |
| GET | `/api/vip/levels` | (no auth) | `{levels: [{level, name, min_points, cashback_pct, rakeback_pct, perks}]}` |
| GET | `/api/vip` | | `{levels, status: {level, points, cashback_available, cashback_from, net_loss, rakeback_available}}`; 1 point = $1 of real-money bets |
| POST | `/api/vip/claim-cashback` / `claim-rakeback` | | `{amount}` credited to real balance; 409 `nothing_to_claim` below $1 |
| POST | `/api/games/{slug}/launch` | | `{type: "iframe", url, game}` or `{type: "originals", game}` |
| GET | `/api/originals/seed` (alias `/api/originals/dice/seed`) | | `{server_seed_hash, client_seed, nonce, previous_server_seed}`: the seed pair shared by all originals |
| POST | `/api/originals/seed` (alias `/api/originals/dice/seed`) | `{client_seed?}` | new seed pair, nonce 0; reveals the previous server seed; 409 `round_open` while a Mines round is open |
| POST | `/api/originals/dice/bet` | `{amount, target}` (win if roll < target, 2..98) | `{game, roll, target, multiplier, bet, win, rtp, max_win, max_win_applied, nonce, client_seed, server_seed_hash, balance}`; 400 `max_bet_exceeded` above the active bonus's max bet |
| POST | `/api/originals/crash/bet` | `{amount, target}` (auto cash-out 1.01..1000, two decimals) | `{game, crash_point, target, cashed_out, bet, win, rtp, max_win, max_win_applied, nonce, client_seed, server_seed_hash, balance}`; settles at once, win = amount × target (capped at max_win) when crash_point ≥ target; 400 `bad_target` |
| POST | `/api/originals/plinko/bet` | `{amount, rows: 8/12/16, risk: low/medium/high}` | `{game, rows, risk, path: [0/1 per row, 1 = right], slot, multiplier, bet, win, rtp, max_win, max_win_applied, nonce, client_seed, server_seed_hash, balance}`; 400 `bad_rows` / `bad_risk` |
| GET | `/api/originals/plinko/tables?rtp=&all=` | (no auth) | `{rtp, current_rtp, presets: [90, …, 99], tables: [{rows, risk, multipliers[], rtp}], by_rtp?}`: the tables of the RTP Plinko runs at now (`current_rtp`), or of the preset in `?rtp=` (400 `bad_rtp`); `?all=1` adds `by_rtp: {"90": [tables], …}` |
| POST | `/api/originals/mines/start` | `{amount, mines: 1..24}` | `{round: MinesRound, balance}`; 409 `round_open` (one open round per player), 400 `bad_mines` |
| POST | `/api/originals/mines/reveal` | `{tile: 0..24}` (row × 5 + column) | `{round, balance}`; a mine ends the round (`status: lost`); revealing the last safe tile cashes out automatically; 409 `no_round` / `already_revealed`, 400 `bad_tile` |
| POST | `/api/originals/mines/cashout` | | `{round, balance}`; pays `round.payout`; 409 `no_round` / `nothing_revealed` |
| GET | `/api/originals/mines/current` | | `{round: MinesRound or null, balance}`: the open round, to resume after a reload |
| GET | `/api/payments/methods` | (no auth) | `{methods: [{code, title, kind: fiat/crypto/gateway, provider, network?, coin?, min_cents, deposit, withdraw}]}`; a code can appear twice (mock deposit connector and manual payout method): pick by the `deposit` / `withdraw` flag |
| POST | `/api/payments/deposit` | `{method, amount}` | fiat: `{type: "redirect", url, payment_id}`; crypto: `{type: "address", network, address, min_cents, note}` |
| POST | `/api/payments/withdraw` | `{method, amount, address?}` | `{payment_id, status: "pending"}`; 400 `amount_too_small` (< $10), `bad_address` (wrong format for the network), `deposit_only`; 403 `kyc_required` until verified (see KYC below), `address_blocked`, `withdrawals_blocked`; allowed during a time-out / self-exclusion; 409 `bonus_active` while wagering a bonus |
| GET | `/api/payments` | | `{items: [{id, direction, method, amount, status, address, external_ref, crypto_amount, network, paid_at, created_at, tx_url?}]}`; a paid crypto withdrawal has the tx hash in `external_ref` and a block explorer link in `tx_url` |
| POST | `/api/dev/crypto/simulate` | `{method, amount_usd_cents, risk?: "high"}` | dev only: pretends the player sent crypto |

### A2 Labs (provably fair)

Dice, Crash, Mines and Plinko (`provider: originals`, studio "A2 Labs") share **one seed pair per player**
(`fair_seeds`): the server seed's SHA-256 is shown before betting, the nonce goes up by one with every bet in any of the
four games, and rotating the pair reveals the previous server seed. All results use HMAC-SHA256 with the server seed
(as text) as the key; the formulas live in `backend/internal/games/fair.go` and `web/lib/fair.ts` (in-browser verifier):

- Dice: `HMAC(server, "client:nonce")`, first 4 bytes as uint32 `% 10000 / 100`; pays `amount × RTP / target` (RTP in percent).
- Crash: H = first 52 bits of `HMAC(server, "client:nonce")`, E = 2^52, `crash = max(1.00, floor(RTP·E / (E − H)) / 100)`,
  so P(crash ≥ m) = R / m and every auto cash-out returns R. Single player, no manual cash-out (the site animates the result).
- Float stream (Mines, Plinko): `HMAC(server, "client:nonce:cursor")` for cursor 0, 1, …; every 4 bytes → uint32 / 2^32.
- Mines: Fisher–Yates over tiles 0..24 (`for i = 24..1: j = floor(f × (i+1)); swap`), the first `mines` tiles are mines.
  Multiplier after n gems = `R × C(25, n) / C(25 − mines, n)`, payout rounded down to the cent.
- Plinko: one float per row, `≥ 0.5` = right; slot = number of rights; pays the slot of the rows/risk table of the
  round's RTP (`/api/originals/plinko/tables`). The 99% tables (RTP 98.9–99.2%) are the base; the other versions scale
  them to the target in integer hundredths (round half up), then add/take 0.01x on symmetric slot pairs (closest to the
  target first, keeping ≥ 0.01x and non-increasing towards the centre) until the sum is as close as it gets: every
  derived table returns its RTP within 0.01 pp (`backend/internal/games/plinko_tables.go`, same algorithm in `web/lib/fair.ts`).

**RTP versions (B2B).** Each original runs at one of the presets **90, 92, 94, 95, 96, 97, 98, 99** % (R = RTP / 100),
stored in `games.rtp` (default 99; a CHECK constraint allows only the presets for originals). It is the same for every
player and is never adjusted per player or dynamically: only an admin changes it in the back office (comment required,
audit `game_rtp_change`). A change applies to new bets only: a bet reads the game row with a share lock, every round stores
the RTP it used (`game_rounds.details.rtp`, each result's `rtp`), and an open Mines round keeps the RTP it started with
(`mines_rounds.rtp`). Verification uses the round's RTP.

**Max win per bet.** `games.max_win` (cents, default $10,000 for originals, admin only, audit `game_max_win_change`).
A payout above it is paid at max_win (`max_win_applied: true` in the result and `details`); a stake above it is refused
with 400 `bet_too_high`; a Mines round whose payout reaches it is cashed out automatically (`max_win_reached`). An open
Mines round keeps the cap it started with (`mines_rounds.max_win`).

Every original: min bet $0.10, the active bonus's max bet (400 `max_bet_exceeded`), RG checks (403 `timeout`,
`self_excluded`, `loss_limit`, `wager_limit`, `session_limit`), wagering contribution 10% by default (editable per game in
the back office), VIP points / rakeback on the real-money part. Rounds are recorded in `game_rounds` (provider `originals`,
`details` holds the result and the seed fields) and show in `/api/rounds` and the back-office bet log.

MinesRound = `{id, bet, mines, revealed: [tile], status: open/lost/cashed, win, multiplier, next_multiplier?, payout, rtp, max_win, max_win_reached,
mines_positions? (only once the round is over), nonce, client_seed, server_seed_hash, created_at}`. The stake is taken at
start (the game_rounds row is `open` until the round ends). Reveal and cash-out are allowed during a time-out /
self-exclusion so an open round can be finished. A round left open for 24 hours is cashed out by a background task
(every 10 minutes) at its current multiplier; with no tile revealed the stake is returned (`details.auto_cashout: true`).

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
403 `timeout` or `self_excluded`: deposits, bets (originals, provider `bet` callbacks), free spins, claiming offers, promo codes,
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
| GET | `/api/bo/dashboard` | | `{players, new_today, deposits_today, withdrawals_today, pending_withdrawals, awaiting_payout, turnover_today, ggr_today}` |
| GET | `/api/bo/players?q=&rg=&limit=&offset=` | q = email part, id or tag; rg = excluded / self_excluded / timeout | `{items: [{id, email, country, status, verification, tags, real, bonus, created_at, rg_exclusion}]}`; `rg_exclusion` = kind of the active exclusion or null |
| GET | `/api/bo/players/{id}` | | `{player: {...}, balance: {...}, stats: {deposits_count, deposits_sum, withdrawals_count, withdrawals_sum, pending_withdrawals_sum, inout, bets_count, wins_count, turnover, total_win, ggr, first_deposit_at, last_bet_at}}` |
| GET | `/api/bo/players/{id}/rounds?limit=` | | bet log: `{items: [{id, round_id, game, provider, bet_real, bet_bonus, win_real, win_bonus, status, details, created_at}]}` |
| GET | `/api/bo/players/{id}/payments` | | deposits and withdrawals |
| GET | `/api/bo/players/{id}/transactions` | | ledger: `{items: [{id, type, amount (signed), meta, created_at, real_balance_after}]}` |
| GET | `/api/bo/players/{id}/audit` | | `{items: [{id, action, before, after, comment, created_at, staff}]}` |
| POST | `/api/bo/players/{id}/update` | one of `{status: active/blocked}`, `{verification: new/not_verified/pending/manual_review/duplicate/verified}`, `{withdrawals_blocked: bool}`, `{add_tag}`, `{remove_tag}` plus required `comment` | |
| POST | `/api/bo/players/{id}/adjust` | `{kind: real/bonus, amount (signed), comment}` | finance/admin |
| GET | `/api/bo/withdrawals?status=pending\|approved\|completed\|rejected` | | queue with anti-fraud fields: `first_deposit_at, deposits_count, deposits_sum, withdrawals_count, turnover, payment_speed_hours`, plus `player_status, manual, network, tx_hash, crypto_amount, tx_url, approved_by, approved_at, paid_by, paid_at, created_by` |
| POST | `/api/bo/withdrawals/{id}/approve` / `reject` | | finance/admin. Approving a manual crypto payout re-screens the address and sets `approved` (awaiting payout); mock connectors complete at once. Reject works on `pending` and `approved` and returns the money to the real balance |
| POST | `/api/bo/withdrawals/{id}/paid` | `{tx_hash, crypto_amount?, comment?}` | finance/admin: completes an `approved` manual payout. `{ok, tx_hash, tx_url}`; 400 `bad_tx_hash` / `bad_crypto_amount`, 409 `not_approved` / `tx_hash_used` |
| POST | `/api/bo/players/{id}/payout` | `{method, address, amount? (cents, 0 = whole real balance), comment}` | finance/admin: balance payout of a blocked or self-excluded account → `{payment_id, status: "pending", amount, risk, risk_reasons}`; 409 `player_active`, `bonus_active`, `nothing_to_pay`; same screening and approve → paid flow |
| GET | `/api/bo/payout-methods` | | `{methods: [...]}` the manual payout methods |
| GET | `/api/bo/players/{id}/bonuses` | | player's bonuses (same shape as `/api/bonuses`) |
| POST | `/api/bo/players/{id}/bonuses` | `{bonus_id, comment}` | marketing/admin: give a bonus |
| POST | `/api/bo/players/{id}/bonuses/{pb}/cancel` | `{comment}` | marketing/admin |
| GET | `/api/bo/games?q=&category=&status=` | | `{games: [{id, slug, title, provider, studio, category, status, rtp, max_win, rtp_configurable, sort_order, is_new, blocked_countries, tags, emoji, color, wagering_contribution, rounds_30d, turnover_30d, ggr_30d}], rtp_presets: [90, …, 99]}` |
| POST | `/api/bo/games/{id}` | any of `{title, category, status: live/hidden/draft/announced/closed, sort_order, is_new, blocked_countries[], tags[], emoji, color, wagering_contribution (0–100), rtp, max_win, comment}` | marketing/admin. `rtp` (a preset) and `max_win` (cents, $1–$10,000,000) are **admin only** (403 `forbidden`), originals only (400 `rtp_not_configurable`), need a comment (400 `comment_required`), 400 `bad_rtp` / `bad_max_win`; audited as `game_rtp_change` / `game_max_win_change` with before and after |
| GET / POST | `/api/bo/providers`, `/api/bo/providers/{code}` | `{status: live/hidden, blocked_countries[], sort_order, comment}` | a hidden provider hides all its games |
| GET | `/api/bo/bonuses` | | Bonus fields + `given, active_count, completed, granted_sum` |
| POST | `/api/bo/bonuses`, `/api/bo/bonuses/{id}` | Bonus fields incl. `max_bet` (create needs title, kind, trigger) | marketing/admin |
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

### Manual crypto payouts

Production withdrawal methods (provider `manual`, offered whatever `DEV_TOOLS` says, min $10): `usdt_trc20` (TRC20),
`usdt_erc20` and `usdc_erc20` (ERC20), `btc` (BTC), `eth` (ETH), `ltc` (LTC). The address is checked per network:
TRON `T…` Base58Check (34 chars), EVM `0x` + 40 hex, Bitcoin bech32/bech32m `bc1…` or Base58Check `1…`/`3…`,
Litecoin `ltc1…` or `L…`/`M…` (checksums verified). Flow: `pending` → approve (AML re-screen) → `approved` → staff send the
coins from the casino's exchange or wallet → `POST …/paid` with the tx hash (64 hex; `0x` + 64 hex for Ethereum) → `completed`
(ledger: locked → `house_crypto_clearing`, audit `withdrawal_paid`). Explorer links: tronscan.org, etherscan.io,
mempool.space, blockchair.com (LTC). A tx hash can be used once. In dev the mock crypto connectors are deposit-only,
so crypto withdrawals take the same manual path; `card_mock` still pays out on approval. Automating the sending step
through NOWPayments mass payouts is a later step.

### Bonus rules

While a player has an active bonus, a bet above the bonus's `max_bet` (default $5) is refused with 400
`max_bet_exceeded` ("the maximum bet while a bonus is active is $5.00") before any money moves: the originals and the provider
bet callback alike; free spins are not limited. Each bet adds `amount × wagering_contribution / 100` to wagering
(A2 Labs 10%, other games 100% by default); VIP points and rakeback still count the full real-money bet.

## Provider callbacks (seamless wallet)

Signed with `X-Signature: hex(HMAC-SHA256(secret, body))`. Body `{token, round_id, tx_id, amount}`.
`POST /api/provider/mock/{balance|bet|win|rollback}` → `{balance, currency}`. Repeating a `tx_id` is a no-op.
`bet` answers 400 `{code: "max_bet_exceeded", message}` when the stake is above the active bonus's max bet (the provider
shows the message and cancels the spin); a retried bet that was already accepted is not checked again.

## Payment webhooks

`POST /api/webhooks/nowpayments`: NOWPayments IPN, signed with `x-nowpayments-sig` = hex(HMAC-SHA512(IPN secret, body with keys sorted)).
Deposits with method `nowpayments` create a hosted invoice and return `{type: "redirect", url}`; only `payment_status: finished`
credits the balance, `partially_paid` is left for staff. The method is listed only when `NOWPAYMENTS_API_KEY` is set
(`NOWPAYMENTS_API_URL` defaults to the sandbox). Deposits only; withdrawals are manual crypto payouts (above).


`POST /api/webhooks/mockpsp` `{payment_id, status: success/failed, psp_ref}` and
`POST /api/webhooks/mockcrypto` `{network, address, tx_hash, amount_usd_cents, crypto_amount, confirmations, risk}`, both HMAC-signed.
A crypto deposit is credited once `confirmations >= CRYPTO_CONFIRMATIONS`; `risk: "high"` freezes it and blocks withdrawals.
