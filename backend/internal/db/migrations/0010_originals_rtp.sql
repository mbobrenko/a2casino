-- v0.4: configurable RTP and a max win per bet for the A2 Originals (B2B: buyers pick one of the
-- certified RTP versions). games.rtp stays the single source of truth: for originals it is the RTP
-- the game pays at (one of the presets) and it is what the player site publishes. A change applies
-- to new bets only; every round stores the RTP it was played at (game_rounds.details.rtp,
-- mines_rounds.rtp), so results stay verifiable.

ALTER TABLE games ADD CONSTRAINT games_originals_rtp
    CHECK (provider <> 'originals' OR rtp IN (90, 92, 94, 95, 96, 97, 98, 99));
UPDATE games SET rtp = 99 WHERE provider = 'originals' AND rtp IS NULL;
ALTER TABLE games ADD CONSTRAINT games_originals_rtp_set CHECK (provider <> 'originals' OR rtp IS NOT NULL);

-- Maximum win per bet in cents (originals; NULL = no cap). Default $10,000.
ALTER TABLE games ADD COLUMN max_win BIGINT CHECK (max_win IS NULL OR max_win > 0);
UPDATE games SET max_win = 1000000 WHERE provider = 'originals';

-- An open Mines round keeps the RTP and the cap it was started with.
ALTER TABLE mines_rounds ADD COLUMN rtp INT NOT NULL DEFAULT 99 CHECK (rtp BETWEEN 1 AND 100);
ALTER TABLE mines_rounds ADD COLUMN max_win BIGINT;
