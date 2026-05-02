-- Plan 8: Collection-tracking mode
-- Adds an unknown_cost flag to purchases. Lots with unknown_cost = true
-- are excluded from cost basis + unrealized P&L, but still count toward
-- vault current market value and feed realized P&L on sale.
-- Storage convention: when unknown_cost = true, cost_cents = 0. The flag,
-- not the value, is the source of truth.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS unknown_cost BOOLEAN NOT NULL DEFAULT FALSE;
