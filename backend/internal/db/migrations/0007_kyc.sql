-- KYC: personal details on the profile and uploaded verification documents.
-- players.verification gains the value 'pending' (all required documents uploaded, waiting for review).

ALTER TABLE players
    ADD COLUMN full_name    TEXT NOT NULL DEFAULT '',
    ADD COLUMN address      TEXT NOT NULL DEFAULT '',
    ADD COLUMN city         TEXT NOT NULL DEFAULT '',
    ADD COLUMN postal_code  TEXT NOT NULL DEFAULT '';

-- kind: id_front | id_back | address | selfie. id_type (for id_*): passport | id_card | driving_licence.
-- status: pending | approved | rejected. The newest document of a kind is the current one.
CREATE TABLE kyc_documents (
    id            BIGSERIAL PRIMARY KEY,
    player_id     UUID NOT NULL REFERENCES players(id),
    kind          TEXT NOT NULL,
    id_type       TEXT NOT NULL DEFAULT '',
    file_name     TEXT NOT NULL DEFAULT '',
    content_type  TEXT NOT NULL,
    size          INT NOT NULL,
    storage       TEXT NOT NULL DEFAULT 'db',   -- where the bytes live: db (kyc_files) | s3 later
    storage_key   TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT NOT NULL DEFAULT '',
    reviewed_by   UUID REFERENCES staff(id),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kyc_documents_player_idx ON kyc_documents (player_id, created_at DESC);
CREATE INDEX kyc_documents_pending_idx ON kyc_documents (created_at) WHERE status = 'pending';

-- File bodies, kept apart from the metadata so listings never read them. Render's free tier has no disk.
CREATE TABLE kyc_files (
    key         TEXT PRIMARY KEY,
    data        BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
