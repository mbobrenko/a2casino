-- v0.2: richer lobby (providers, art, banners), bonuses with wagering, promo codes, VIP levels.

-- Providers can be switched off or geo-blocked as a whole.
CREATE TABLE providers (
    code        TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'live',      -- live | hidden
    blocked_countries TEXT[] NOT NULL DEFAULT '{}',
    sort_order  INT NOT NULL DEFAULT 100
);

ALTER TABLE games
    ADD COLUMN studio      TEXT NOT NULL DEFAULT 'mock',   -- providers.code shown in the lobby
    ADD COLUMN emoji       TEXT NOT NULL DEFAULT '🎰',
    ADD COLUMN color       TEXT NOT NULL DEFAULT '#7c5cff',
    ADD COLUMN tags        TEXT[] NOT NULL DEFAULT '{}',    -- e.g. popular, jackpot, megaways, live
    ADD COLUMN description TEXT NOT NULL DEFAULT '';

-- Demo studios. All of them are served by the mock provider integration.
INSERT INTO providers (code, title, sort_order) VALUES
  ('originals', 'A2 Originals', 1),
  ('lumen',     'Lumen Gaming', 10),
  ('aurora',    'Aurora Studios', 20),
  ('redfox',    'RedFox Play', 30),
  ('spinwise',  'Spinwise', 40),
  ('mock',      'Mock Provider', 90);

UPDATE games SET studio='originals', emoji='🎲', color='#22c55e', tags='{popular,provably-fair}', description='Доказуемо честная игра: угадайте, будет ли результат меньше цели.' WHERE slug='dice';
UPDATE games SET studio='lumen',    emoji='🍒', color='#ef4444', tags='{popular}' WHERE slug='mock-fruit-slot';
UPDATE games SET studio='aurora',   emoji='🏺', color='#eab308', tags='{popular,jackpot}' WHERE slug='mock-gold-slot';
UPDATE games SET studio='redfox',   emoji='🎡', color='#0ea5e9' WHERE slug='mock-roulette';
UPDATE games SET studio='spinwise', emoji='🎟️', color='#a855f7' WHERE slug='mock-scratch';

INSERT INTO games (slug, title, provider, studio, category, rtp, sort_order, is_new, emoji, color, tags) VALUES
  ('book-of-sands',     'Book of Sands',     'mock', 'aurora',   'slots',   96.20, 12, false, '📜', '#d97706', '{popular}'),
  ('neon-nights',       'Neon Nights',       'mock', 'lumen',    'slots',   96.50, 14, true,  '🌃', '#ec4899', '{}'),
  ('wild-buffalo',      'Wild Buffalo',      'mock', 'redfox',   'slots',   95.90, 16, false, '🦬', '#92400e', '{megaways}'),
  ('sugar-rush-x',      'Sugar Rush X',      'mock', 'spinwise', 'slots',   96.10, 18, true,  '🍬', '#f472b6', '{popular}'),
  ('dragon-fortune',    'Dragon Fortune',    'mock', 'aurora',   'slots',   96.00, 22, false, '🐉', '#dc2626', '{jackpot}'),
  ('aztec-gold',        'Aztec Gold',        'mock', 'lumen',    'slots',   95.80, 24, false, '🗿', '#65a30d', '{megaways}'),
  ('lucky-clover',      'Lucky Clover',      'mock', 'spinwise', 'slots',   96.30, 26, false, '🍀', '#16a34a', '{}'),
  ('pirate-bay',        'Pirate Bay',        'mock', 'redfox',   'slots',   96.40, 28, true,  '🏴‍☠️', '#1e3a8a', '{}'),
  ('aviator-x',         'Aviator X',         'mock', 'spinwise', 'crash',   97.00, 6,  true,  '✈️', '#f97316', '{popular}'),
  ('rocket-moon',       'Rocket Moon',       'mock', 'lumen',    'crash',   97.00, 8,  false, '🚀', '#6366f1', '{}'),
  ('plinko-drop',       'Plinko Drop',       'mock', 'redfox',   'instant', 97.00, 32, false, '🔻', '#14b8a6', '{popular}'),
  ('mines-field',       'Mines',             'mock', 'spinwise', 'instant', 97.00, 34, true,  '💣', '#334155', '{}'),
  ('blackjack-classic', 'Blackjack Classic', 'mock', 'aurora',   'table',   99.40, 36, false, '🃏', '#047857', '{}'),
  ('baccarat-pro',      'Baccarat Pro',      'mock', 'redfox',   'table',   98.90, 38, false, '🎴', '#7f1d1d', '{}'),
  ('american-roulette', 'American Roulette', 'mock', 'lumen',    'table',   94.70, 40, false, '🎯', '#b91c1c', '{}'),
  ('keno-blast',        'Keno Blast',        'mock', 'aurora',   'instant', 95.00, 42, false, '🔢', '#0891b2', '{}');

-- Promo banners on the lobby (CMS).
CREATE TABLE banners (
    id          BIGSERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    subtitle    TEXT NOT NULL DEFAULT '',
    cta_text    TEXT NOT NULL DEFAULT '',
    cta_link    TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#7c5cff',
    emoji       TEXT NOT NULL DEFAULT '🎁',
    sort_order  INT NOT NULL DEFAULT 100,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    countries   TEXT[] NOT NULL DEFAULT '{}',     -- empty = everywhere
    starts_at   TIMESTAMPTZ,
    ends_at     TIMESTAMPTZ
);

-- Bonus templates. kind:
--   deposit_match: percent of a deposit up to max_amount, needs min_deposit
--   no_deposit:    fixed_amount credited right away
--   freespins:     freespins_count spins of freespin_value on freespin_game; wins go to bonus balance
-- trigger: welcome (offered on registration, applies to the first deposit) | deposit | promo_code | manual
CREATE TABLE bonuses (
    id                BIGSERIAL PRIMARY KEY,
    title             TEXT NOT NULL,
    description       TEXT NOT NULL DEFAULT '',
    kind              TEXT NOT NULL,
    trigger           TEXT NOT NULL DEFAULT 'manual',
    percent           INT NOT NULL DEFAULT 0,
    max_amount        BIGINT NOT NULL DEFAULT 0,
    fixed_amount      BIGINT NOT NULL DEFAULT 0,
    min_deposit       BIGINT NOT NULL DEFAULT 0,
    wager_multiplier  INT NOT NULL DEFAULT 0,       -- wagering = bonus amount x multiplier
    freespins_count   INT NOT NULL DEFAULT 0,
    freespin_value    BIGINT NOT NULL DEFAULT 0,
    freespin_game     TEXT NOT NULL DEFAULT '',
    valid_days        INT NOT NULL DEFAULT 7,
    active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promo_codes (
    code        TEXT PRIMARY KEY,                 -- stored upper-case
    bonus_id    BIGINT NOT NULL REFERENCES bonuses(id),
    max_uses    INT NOT NULL DEFAULT 0,           -- 0 = unlimited
    uses        INT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A bonus given to a player. status: pending (waits for a deposit) | active | completed | forfeited | expired | cancelled
CREATE TABLE player_bonuses (
    id              BIGSERIAL PRIMARY KEY,
    player_id       UUID NOT NULL REFERENCES players(id),
    bonus_id        BIGINT NOT NULL REFERENCES bonuses(id),
    status          TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT '',     -- welcome | promo:CODE | staff | offer
    amount          BIGINT NOT NULL DEFAULT 0,    -- bonus money credited
    wager_required  BIGINT NOT NULL DEFAULT 0,
    wager_progress  BIGINT NOT NULL DEFAULT 0,
    freespins_left  INT NOT NULL DEFAULT 0,
    freespins_won   BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ
);
CREATE INDEX player_bonuses_player_idx ON player_bonuses (player_id, created_at DESC);
-- At most one bonus in play (active) per player; pending offers can wait alongside it.
CREATE UNIQUE INDEX player_bonuses_one_active ON player_bonuses (player_id) WHERE status = 'active';
CREATE UNIQUE INDEX player_bonuses_one_per_promo ON player_bonuses (player_id, source) WHERE source LIKE 'promo:%';

-- VIP: 1 point per $1 wagered from real money (players.wagered_real is in cents). Cashback is a % of weekly net losses,
-- rakeback a % of every real-money bet, both claimed by the player as real money.
CREATE TABLE vip_levels (
    level         INT PRIMARY KEY,
    name          TEXT NOT NULL,
    min_points    BIGINT NOT NULL,
    cashback_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
    rakeback_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % of real-money turnover
    perks         TEXT NOT NULL DEFAULT ''
);
INSERT INTO vip_levels (level, name, min_points, cashback_pct, rakeback_pct, perks) VALUES
  (1, 'Bronze',   0,      0,  0,    'Приветственный бонус'),
  (2, 'Silver',   500,    5,  0.05, 'Кэшбэк 5%, рейкбэк'),
  (3, 'Gold',     2500,   8,  0.10, 'Кэшбэк 8%, ускоренный вывод'),
  (4, 'Platinum', 10000,  10, 0.20, 'Кэшбэк 10%, персональный менеджер'),
  (5, 'Diamond',  50000,  15, 0.30, 'Кэшбэк 15%, эксклюзивные бонусы');

ALTER TABLE players
    ADD COLUMN wagered_real      BIGINT NOT NULL DEFAULT 0,            -- cents of real money bet, lifetime
    ADD COLUMN vip_level         INT NOT NULL DEFAULT 1,
    ADD COLUMN rakeback_accrued  NUMERIC(14,4) NOT NULL DEFAULT 0,   -- cents, fractional
    ADD COLUMN cashback_from     TIMESTAMPTZ NOT NULL DEFAULT now(); -- start of the current cashback period

INSERT INTO bonuses (title, description, kind, trigger, percent, max_amount, min_deposit, wager_multiplier, valid_days) VALUES
  ('Приветственный бонус 100%', '100% на первый депозит до $500, вейджер x35', 'deposit_match', 'welcome', 100, 50000, 1000, 35, 14);
INSERT INTO bonuses (title, description, kind, trigger, fixed_amount, wager_multiplier, valid_days) VALUES
  ('Бонус без депозита $5', '$5 на бонусный счёт по промокоду, вейджер x40', 'no_deposit', 'promo_code', 500, 40, 7);
INSERT INTO bonuses (title, description, kind, trigger, freespins_count, freespin_value, freespin_game, wager_multiplier, valid_days) VALUES
  ('50 фриспинов в Book of Sands', '50 вращений по $0.20, выигрыш с вейджером x30', 'freespins', 'promo_code', 50, 20, 'book-of-sands', 30, 7);
INSERT INTO bonuses (title, description, kind, trigger, percent, max_amount, min_deposit, wager_multiplier, valid_days) VALUES
  ('Релоад 50%', '50% на депозит до $200, вейджер x30', 'deposit_match', 'deposit', 50, 20000, 2000, 30, 7);

INSERT INTO promo_codes (code, bonus_id) SELECT 'WELCOME5', id FROM bonuses WHERE kind='no_deposit';
INSERT INTO promo_codes (code, bonus_id) SELECT 'SPINS50', id FROM bonuses WHERE kind='freespins';

INSERT INTO banners (title, subtitle, cta_text, cta_link, color, emoji, sort_order) VALUES
  ('100% на первый депозит', 'До $500 к вашему первому пополнению', 'Получить', '/promo', '#7c5cff', '🎁', 1),
  ('50 фриспинов', 'Промокод SPINS50 в разделе «Промо»', 'Активировать', '/promo', '#f59e0b', '🎰', 2),
  ('VIP-клуб A2', 'Кэшбэк до 15% и рейкбэк с каждой ставки', 'Подробнее', '/vip', '#0ea5e9', '👑', 3);
