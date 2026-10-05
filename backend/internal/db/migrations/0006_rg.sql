-- Responsible gaming: player limits with a cooling-off period, reality checks, time-outs and self-exclusion.
-- Windows are rolling: day = last 24 hours, week = last 7 days, month = last 30 days.

-- kind: deposit | loss | wager (cents) | session (minutes of play, period 'day' only).
-- Lowering or setting a limit applies at once; raising or removing it is stored as pending
-- (pending=true, pending_amount NULL = remove) and applies at effective_at (24 hours later).
CREATE TABLE rg_limits (
    player_id       UUID NOT NULL REFERENCES players(id),
    kind            TEXT NOT NULL,
    period          TEXT NOT NULL,                  -- day | week | month
    amount          BIGINT,                         -- limit in force, NULL = none
    pending         BOOLEAN NOT NULL DEFAULT FALSE,
    pending_amount  BIGINT,
    effective_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, kind, period)
);
CREATE INDEX rg_limits_due_idx ON rg_limits (effective_at) WHERE pending;

CREATE TABLE rg_settings (
    player_id              UUID PRIMARY KEY REFERENCES players(id),
    reality_check_minutes  INT NOT NULL DEFAULT 0      -- 0 = off
);

-- kind: timeout (24h..6 weeks, ends by itself) | self_exclusion (6 months..permanent; at the end the
-- player asks to reopen and waits 24 hours more). status: active | lifted | superseded (replaced by a longer one).
CREATE TABLE rg_exclusions (
    id                   BIGSERIAL PRIMARY KEY,
    player_id            UUID NOT NULL REFERENCES players(id),
    kind                 TEXT NOT NULL,
    duration             TEXT NOT NULL,             -- 24h | 7d | 30d | 6w | 6m | 1y | 5y | permanent
    starts_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at              TIMESTAMPTZ,               -- NULL = permanent
    status               TEXT NOT NULL DEFAULT 'active',
    staff_id             UUID REFERENCES staff(id), -- set when applied from the back office
    reason               TEXT NOT NULL DEFAULT '',
    reopen_requested_at  TIMESTAMPTZ,
    lifted_at            TIMESTAMPTZ
);
CREATE UNIQUE INDEX rg_exclusions_one_active ON rg_exclusions (player_id) WHERE status = 'active';

-- Play sessions for reality checks and the daily time limit: a session ends after 30 minutes without activity.
CREATE TABLE rg_sessions (
    id            BIGSERIAL PRIMARY KEY,
    player_id     UUID NOT NULL REFERENCES players(id),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rg_sessions_player_idx ON rg_sessions (player_id, last_seen_at DESC);

-- History of every change, by the player, staff or the system (a pending limit coming into force).
CREATE TABLE rg_events (
    id          BIGSERIAL PRIMARY KEY,
    player_id   UUID NOT NULL REFERENCES players(id),
    staff_id    UUID REFERENCES staff(id),
    action      TEXT NOT NULL,      -- limit_set | limit_pending | limit_applied | reality_check | exclusion | reopen_requested | exclusion_ended
    kind        TEXT NOT NULL DEFAULT '',
    period      TEXT NOT NULL DEFAULT '',
    before      JSONB,
    after       JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rg_events_player_idx ON rg_events (player_id, created_at DESC);
CREATE INDEX game_rounds_player_created_idx ON game_rounds (player_id, created_at) WHERE status <> 'rolled_back';
