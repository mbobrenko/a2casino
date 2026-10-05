-- v0.3: manual crypto payouts. Staff approve a withdrawal, send the coins from the casino's
-- exchange account or wallet themselves, then mark it paid with the transaction hash.
-- Withdrawal statuses: pending -> approved (awaiting payout) -> completed, or rejected.

ALTER TABLE payments
    ADD COLUMN network     TEXT,                         -- TRC20 | ERC20 | BTC | ETH | LTC for crypto payouts
    ADD COLUMN approved_at TIMESTAMPTZ,
    ADD COLUMN paid_by     UUID REFERENCES staff(id),    -- who marked the payout as sent
    ADD COLUMN paid_at     TIMESTAMPTZ,
    ADD COLUMN created_by  UUID REFERENCES staff(id);    -- set when staff created the withdrawal (balance payout of a closed account)
