-- v0.3: bonus abuse rules. While a bonus is active, a single bet may not exceed the bonus's
-- max_bet, and each game counts towards wagering with its own contribution percentage.

ALTER TABLE bonuses
    ADD COLUMN max_bet BIGINT NOT NULL DEFAULT 500 CHECK (max_bet >= 0);   -- cents per bet/spin/round, 0 = no limit

ALTER TABLE games
    ADD COLUMN wagering_contribution INT NOT NULL DEFAULT 100
        CHECK (wagering_contribution BETWEEN 0 AND 100);                     -- percent of each bet counted towards wagering

UPDATE games SET wagering_contribution = 10 WHERE slug = 'dice';
