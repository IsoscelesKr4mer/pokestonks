-- ============================================================
-- Plan 10.1: Storefront opt-out flip
--
-- Semantic: row in storefront_listings is now an OVERRIDE, not a
-- "this item is listed" flag. Default storefront visibility is
-- driven by qty raw > 0 + market price availability. The override
-- can either pin a manual price OR hide the item.
-- ============================================================

ALTER TABLE storefront_listings ALTER COLUMN asking_price_cents DROP NOT NULL;

ALTER TABLE storefront_listings DROP CONSTRAINT IF EXISTS storefront_listings_asking_price_nonneg;
ALTER TABLE storefront_listings ADD CONSTRAINT storefront_listings_asking_price_nonneg
  CHECK (asking_price_cents IS NULL OR asking_price_cents >= 0);

ALTER TABLE storefront_listings ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN storefront_listings.asking_price_cents IS
  'Per (user, catalog_item) explicit price override in cents. NULL = use rounded market fallback.';
COMMENT ON COLUMN storefront_listings.hidden IS
  'TRUE = exclude this item from the public storefront, even though qty > 0. FALSE = include normally.';
