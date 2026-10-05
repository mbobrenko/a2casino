-- Wallet address screening (KYT): sanctions lists, staff blacklist, screening log, withdrawal risk.

CREATE TABLE aml_addresses (
    address     TEXT PRIMARY KEY,               -- normalised: 0x… addresses lower-case, others as is
    list        TEXT NOT NULL,                  -- ofac | blacklist | whitelist
    network     TEXT NOT NULL DEFAULT '',
    reason      TEXT NOT NULL DEFAULT '',
    added_by    UUID REFERENCES staff(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE aml_screenings (
    id          BIGSERIAL PRIMARY KEY,
    address     TEXT NOT NULL,
    network     TEXT NOT NULL DEFAULT '',
    player_id   UUID REFERENCES players(id),
    payment_id  UUID,
    context     TEXT NOT NULL,                  -- withdrawal | deposit | manual
    risk        TEXT NOT NULL,                  -- low | medium | high | severe
    reasons     TEXT[] NOT NULL DEFAULT '{}',
    providers   TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX aml_screenings_address_idx ON aml_screenings (address);
CREATE INDEX aml_screenings_created_idx ON aml_screenings (created_at DESC);

ALTER TABLE payments
    ADD COLUMN risk         TEXT,                -- result of the address screening
    ADD COLUMN risk_reasons TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX payments_address_idx ON payments (address) WHERE address IS NOT NULL;
