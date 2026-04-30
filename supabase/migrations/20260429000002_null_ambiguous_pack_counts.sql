-- ============================================================
-- Null out pack_count for product types where the count varies
-- across SKUs. Recipe table (catalog_pack_compositions) is now
-- the source of truth for what packs a sealed product contains.
--
-- Universally fixed types kept: Booster Box (36), Booster Bundle
-- (6), Elite Trainer Box (9), Build & Battle (4), Collection Box (4).
-- ============================================================

UPDATE catalog_items
SET pack_count = NULL
WHERE product_type IN (
  'Premium Collection',
  'ex Box',
  'Tin',
  'Pin Collection',
  'Collection',
  'Mini Portfolio',
  'Blister',
  'Booster Pack'
);
