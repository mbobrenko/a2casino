-- A2Casino schema v1. Money is stored in minor units (cents) as BIGINT.

CREATE TABLE players (
    id              UUID PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    country         CHAR(2) NOT NULL,
    birth_date      DATE NOT NULL,
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    status          TEXT NOT NULL DEFAULT 'active',            -- active | blocked
    verification    TEXT NOT NULL DEFAULT 'new',               -- new | not_verified | manual_review | duplicate | verified
    withdrawals_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    tags            TEXT[] NOT NULL DEFAULT '{}',
    affiliate_ref   TEXT,
    registration_ip TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallet: double-entry ledger. Every transaction's entries sum to zero.
-- Player accounts: real, bonus, locked (pending withdrawals).
-- House accounts (player_id NULL): game, psp_clearing, crypto_clearing, bonus_cost.
CREATE TABLE accounts (
    id          BIGSERIAL PRIMARY KEY,
    player_id   UUID REFERENCES players(id),
    kind        TEXT NOT NULL,
    currency    CHAR(3) NOT NULL,
    balance     BIGINT NOT NULL DEFAULT 0,
    UNIQUE NULLS NOT DISTINCT (player_id, kind, currency)
);

CREATE TABLE ledger_tx (
    id              UUID PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    type            TEXT NOT NULL,      -- deposit | withdraw_hold | withdraw_release | withdraw_complete | bet | win | rollback | adjustment
    player_id       UUID REFERENCES players(id),
    amount          BIGINT NOT NULL,    -- absolute amount moved, for display
    meta            JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_tx_player_idx ON ledger_tx (player_id, created_at DESC);

CREATE TABLE ledger_entries (
    id            BIGSERIAL PRIMARY KEY,
    tx_id         UUID NOT NULL REFERENCES ledger_tx(id),
    account_id    BIGINT NOT NULL REFERENCES accounts(id),
    amount        BIGINT NOT NULL,      -- signed
    balance_after BIGINT               -- NULL for house accounts (not row-locked, see wallet.go)
);
CREATE INDEX ledger_entries_tx_idx ON ledger_entries (tx_id);

-- Transactional outbox: events for Kafka (relay is a later step).
CREATE TABLE outbox (
    id          BIGSERIAL PRIMARY KEY,
    topic       TEXT NOT NULL,
    key         TEXT NOT NULL,
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);

-- Games catalog.
CREATE TABLE games (
    id          BIGSERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    provider    TEXT NOT NULL,          -- mock | originals
    category    TEXT NOT NULL,          -- slots | crash | table | instant | dice
    status      TEXT NOT NULL DEFAULT 'live',  -- draft | announced | live | hidden | closed
    rtp         NUMERIC(5,2),
    sort_order  INT NOT NULL DEFAULT 100,
    is_new      BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_countries TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE game_sessions (
    token       TEXT PRIMARY KEY,
    player_id   UUID NOT NULL REFERENCES players(id),
    game_id     BIGINT NOT NULL REFERENCES games(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per game round; bet split by money source so wins are credited back proportionally.
CREATE TABLE game_rounds (
    id          BIGSERIAL PRIMARY KEY,
    provider    TEXT NOT NULL,
    round_id    TEXT NOT NULL,
    player_id   UUID NOT NULL REFERENCES players(id),
    game_id     BIGINT NOT NULL REFERENCES games(id),
    bet_real    BIGINT NOT NULL DEFAULT 0,
    bet_bonus   BIGINT NOT NULL DEFAULT 0,
    win_real    BIGINT NOT NULL DEFAULT 0,
    win_bonus   BIGINT NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open',   -- open | settled | rolled_back
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at  TIMESTAMPTZ,
    UNIQUE (provider, round_id)
);
CREATE INDEX game_rounds_player_idx ON game_rounds (player_id, created_at DESC);

-- Provably fair seeds for originals (dice).
CREATE TABLE fair_seeds (
    player_id     UUID PRIMARY KEY REFERENCES players(id),
    server_seed   TEXT NOT NULL,
    client_seed   TEXT NOT NULL,
    nonce         BIGINT NOT NULL DEFAULT 0,
    prev_server_seed TEXT
);

-- Payments: fiat and crypto deposits and withdrawals.
CREATE TABLE payments (
    id            UUID PRIMARY KEY,
    player_id     UUID NOT NULL REFERENCES players(id),
    direction     TEXT NOT NULL,          -- deposit | withdrawal
    method        TEXT NOT NULL,          -- card_mock | usdt_trc20 | ...
    provider      TEXT NOT NULL,          -- mockpsp | mockcrypto
    amount        BIGINT NOT NULL,        -- in player currency (USD cents)
    status        TEXT NOT NULL,          -- pending | confirming | completed | failed | approved | rejected
    address       TEXT,                   -- crypto deposit address or withdrawal address
    external_ref  TEXT,                   -- PSP id or tx hash
    crypto_amount TEXT,
    confirmations INT NOT NULL DEFAULT 0,
    approved_by   UUID,
    meta          JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payments_player_idx ON payments (player_id, created_at DESC);
CREATE INDEX payments_status_idx ON payments (direction, status);
CREATE UNIQUE INDEX payments_external_ref_idx ON payments (provider, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE crypto_addresses (
    player_id   UUID NOT NULL REFERENCES players(id),
    network     TEXT NOT NULL,
    address     TEXT NOT NULL UNIQUE,
    PRIMARY KEY (player_id, network)
);

-- Back office staff and audit.
CREATE TABLE staff (
    id            UUID PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL,          -- admin | finance | support
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    staff_id    UUID REFERENCES staff(id),
    player_id   UUID REFERENCES players(id),
    action      TEXT NOT NULL,
    before      JSONB,
    after       JSONB,
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_player_idx ON audit_log (player_id, created_at DESC);

INSERT INTO games (slug, title, provider, category, rtp, sort_order, is_new) VALUES
  ('mock-fruit-slot',   'Fruit Mania',     'mock',      'slots',   96.00, 10, false),
  ('mock-gold-slot',    'Golden Pharaoh',  'mock',      'slots',   95.50, 20, true),
  ('mock-roulette',     'Euro Roulette',   'mock',      'table',   97.30, 30, false),
  ('mock-scratch',      'Lucky Scratch',   'mock',      'instant', 95.00, 40, false),
  ('dice',              'Dice',            'originals', 'dice',    99.00, 5,  true);
