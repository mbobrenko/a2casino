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
| GET | `/api/me` | | `{id, email, country, currency, status, verification, created_at, balance: {currency, real, bonus, locked}}` |
| GET | `/api/wallet/transactions?limit=` | | `{items: [{id, type, amount, meta, created_at}]}`; `amount` is the signed change of real + bonus |
| GET | `/api/games?category=&studio=&q=&tag=` | (no auth) | `{categories: [...], games: [Game]}`; Game = `{id, slug, title, provider, category, rtp, is_new, studio, emoji, color, tags[], description, wagering_contribution}` (percent of each bet counted towards bonus wagering) |
| GET | `/api/lobby` | (auth optional) | `{banners: [{id, title, subtitle, cta_text, cta_link, color, emoji}], categories: [{code, title, games}], providers: [{code, title, games}], popular: [Game], new: [Game], recommended: [Game], recent: [Game]}`; recommended/recent are personal when a player token is sent |
| GET | `/api/profile` | | `/api/me` fields + `vip` (as in `/api/vip` status) + `stats: {bets, bet_sum, wins, win_sum, deposits, deposit_sum, withdrawals, withdrawal_sum}` |
| GET | `/api/rounds?limit=` | | bet history `{items: [{id, game, emoji, provider, bet, win, status, created_at}]}` |
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
| GET | `/api/originals/dice/seed` | | `{server_seed_hash, client_seed, nonce, previous_server_seed}` |
| POST | `/api/originals/dice/seed` | `{client_seed?}` | new seed; reveals the previous server seed |
| POST | `/api/originals/dice/bet` | `{amount, target}` (win if roll < target, 2..98) | `{roll, target, multiplier, win, nonce, client_seed, server_seed_hash, balance}`; 400 `max_bet_exceeded` above the active bonus's max bet |
| GET | `/api/payments/methods` | (no auth) | `{methods: [{code, title, kind: fiat/crypto/gateway, provider, network?, coin?, min_cents, deposit, withdraw}]}`; a code can appear twice (mock deposit connector and manual payout method): pick by the `deposit` / `withdraw` flag |
| POST | `/api/payments/deposit` | `{method, amount}` | fiat: `{type: "redirect", url, payment_id}`; crypto: `{type: "address", network, address, min_cents, note}` |
| POST | `/api/payments/withdraw` | `{method, amount, address?}` | `{payment_id, status: "pending"}`; 400 `amount_too_small` (< $10), `bad_address` (wrong format for the network), `deposit_only`; 403 `kyc_required` until verified, `address_blocked`, `withdrawals_blocked`; 409 `bonus_active` while wagering a bonus |
| GET | `/api/payments` | | `{items: [{id, direction, method, amount, status, address, external_ref, crypto_amount, network, paid_at, created_at, tx_url?}]}`; a paid crypto withdrawal has the tx hash in `external_ref` and a block explorer link in `tx_url` |
| POST | `/api/dev/crypto/simulate` | `{method, amount_usd_cents, risk?: "high"}` | dev only: pretends the player sent crypto |

## Back office (staff token; roles admin, finance, support, marketing)

| Method | Path | Body / query | Notes |
| --- | --- | --- | --- |
| POST | `/api/bo/login` | `{email, password}` | `{token, role, email}`. Seed admin: `admin@a2casino.local` / `admin12345` |
| GET | `/api/bo/dashboard` | | `{players, new_today, deposits_today, withdrawals_today, pending_withdrawals, awaiting_payout, turnover_today, ggr_today}` |
| GET | `/api/bo/players?q=&limit=&offset=` | q = email part, id or tag | `{items: [{id, email, country, status, verification, tags, real, bonus, created_at}]}` |
| GET | `/api/bo/players/{id}` | | `{player: {...}, balance: {...}, stats: {deposits_count, deposits_sum, withdrawals_count, withdrawals_sum, pending_withdrawals_sum, inout, bets_count, wins_count, turnover, total_win, ggr, first_deposit_at, last_bet_at}}` |
| GET | `/api/bo/players/{id}/rounds?limit=` | | bet log: `{items: [{id, round_id, game, provider, bet_real, bet_bonus, win_real, win_bonus, status, details, created_at}]}` |
| GET | `/api/bo/players/{id}/payments` | | deposits and withdrawals |
| GET | `/api/bo/players/{id}/transactions` | | ledger: `{items: [{id, type, amount (signed), meta, created_at, real_balance_after}]}` |
| GET | `/api/bo/players/{id}/audit` | | `{items: [{id, action, before, after, comment, created_at, staff}]}` |
| POST | `/api/bo/players/{id}/update` | one of `{status: active/blocked}`, `{verification: new/not_verified/manual_review/duplicate/verified}`, `{withdrawals_blocked: bool}`, `{add_tag}`, `{remove_tag}` plus required `comment` | |
| POST | `/api/bo/players/{id}/adjust` | `{kind: real/bonus, amount (signed), comment}` | finance/admin |
| GET | `/api/bo/withdrawals?status=pending\|approved\|completed\|rejected` | | queue with anti-fraud fields: `first_deposit_at, deposits_count, deposits_sum, withdrawals_count, turnover, payment_speed_hours`, plus `player_status, manual, network, tx_hash, crypto_amount, tx_url, approved_by, approved_at, paid_by, paid_at, created_by` |
| POST | `/api/bo/withdrawals/{id}/approve` / `reject` | | finance/admin. Approving a manual crypto payout re-screens the address and sets `approved` (awaiting payout); mock connectors complete at once. Reject works on `pending` and `approved` and returns the money to the real balance |
| POST | `/api/bo/withdrawals/{id}/paid` | `{tx_hash, crypto_amount?, comment?}` | finance/admin: completes an `approved` manual payout. `{ok, tx_hash, tx_url}`; 400 `bad_tx_hash` / `bad_crypto_amount`, 409 `not_approved` / `tx_hash_used` |
| POST | `/api/bo/players/{id}/payout` | `{method, address, amount? (cents, 0 = whole real balance), comment}` | finance/admin: balance payout of a blocked or self-excluded account → `{payment_id, status: "pending", amount, risk, risk_reasons}`; 409 `player_active`, `bonus_active`, `nothing_to_pay`; same screening and approve → paid flow |
| GET | `/api/bo/payout-methods` | | `{methods: [...]}` the manual payout methods |
| GET | `/api/bo/players/{id}/bonuses` | | player's bonuses (same shape as `/api/bonuses`) |
| POST | `/api/bo/players/{id}/bonuses` | `{bonus_id, comment}` | marketing/admin: give a bonus |
| POST | `/api/bo/players/{id}/bonuses/{pb}/cancel` | `{comment}` | marketing/admin |
| GET | `/api/bo/games?q=&category=&status=` | | `{games: [{id, slug, title, provider, studio, category, status, rtp, sort_order, is_new, blocked_countries, tags, emoji, color, wagering_contribution, rounds_30d, turnover_30d, ggr_30d}]}` |
| POST | `/api/bo/games/{id}` | any of `{title, category, status: live/hidden/draft/announced/closed, sort_order, is_new, blocked_countries[], tags[], emoji, color, wagering_contribution (0–100), comment}` | marketing/admin |
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
`max_bet_exceeded` ("the maximum bet while a bonus is active is $5.00") before any money moves: Dice and the provider
bet callback alike; free spins are not limited. Each bet adds `amount × wagering_contribution / 100` to wagering
(Dice 10%, other games 100% by default); VIP points and rakeback still count the full real-money bet.

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
