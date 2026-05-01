-- ============================================================
-- Plan 7 — Pricing automation + history
-- Adds: created_at on market_prices, source CHECK,
-- manual override columns on catalog_items.
-- ============================================================

-- 1. created_at on market_prices for telemetry
ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. CHECK constraint on source ('tcgcsv' | 'manual')
ALTER TABLE market_prices
  DROP CONSTRAINT IF EXISTS market_prices_source_check;
ALTER TABLE market_prices
  ADD CONSTRAINT market_prices_source_check
  CHECK (source IN ('tcgcsv', 'manual'));

-- 3. snapshot_date DESC index for chart range queries
CREATE INDEX IF NOT EXISTS market_prices_catalog_date_desc_idx
  ON market_prices (catalog_item_id, snapshot_date DESC);

-- 4. Manual override columns on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS manual_market_cents INTEGER,
  ADD COLUMN IF NOT EXISTS manual_market_at TIMESTAMPTZ;
