-- v0.4: more provably fair A2 Originals: Crash (single player, auto cash-out), Mines and Plinko.
-- They share the player's seed pair (fair_seeds) and nonce with Dice.

INSERT INTO games (slug, title, provider, studio, category, rtp, sort_order, is_new, emoji, color, tags, description, wagering_contribution) VALUES
  ('crash',  'Crash',  'originals', 'originals', 'crash',   99.00, 2, true, '📈', '#ef4444', '{new,provably-fair}',
   'Provably fair: set your auto cash-out and see if the multiplier gets there before it crashes.', 10),
  ('mines',  'Mines',  'originals', 'originals', 'instant', 99.00, 3, true, '💎', '#0ea5e9', '{new,provably-fair}',
   'Provably fair: uncover gems on a 5×5 board, avoid the mines and cash out whenever you like.', 10),
  ('plinko', 'Plinko', 'originals', 'originals', 'instant', 99.00, 4, true, '🔮', '#ec4899', '{new,provably-fair}',
   'Provably fair: drop the ball through 8, 12 or 16 rows of pegs and land on a multiplier.', 10)
ON CONFLICT (slug) DO NOTHING;

-- Stateful Mines rounds. The seed pair is copied in at the start, so the mines are fixed when the
-- bet is placed; the server seed is only revealed when the player rotates the seed pair (which is
-- refused while a round is open).
CREATE TABLE mines_rounds (
    id          BIGSERIAL PRIMARY KEY,
    player_id   UUID NOT NULL REFERENCES players(id),
    game_id     BIGINT NOT NULL REFERENCES games(id),
    round_id    TEXT NOT NULL UNIQUE,            -- game_rounds.round_id (provider 'originals')
    amount      BIGINT NOT NULL CHECK (amount > 0),
    bet_real    BIGINT NOT NULL DEFAULT 0,
    bet_bonus   BIGINT NOT NULL DEFAULT 0,
    mines       INT NOT NULL CHECK (mines BETWEEN 1 AND 24),
    revealed    INT[] NOT NULL DEFAULT '{}',     -- tiles 0..24 in the order they were opened
    server_seed TEXT NOT NULL,
    client_seed TEXT NOT NULL,
    nonce       BIGINT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',    -- open | lost | cashed
    win         BIGINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX mines_rounds_one_open ON mines_rounds (player_id) WHERE status = 'open';
CREATE INDEX mines_rounds_open_created ON mines_rounds (created_at) WHERE status = 'open';
CREATE INDEX mines_rounds_player_idx ON mines_rounds (player_id, created_at DESC);
