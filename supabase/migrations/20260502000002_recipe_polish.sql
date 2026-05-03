-- ============================================================
-- Plan 9: recipe contents can be any catalog row, not just
-- Booster Pack rows. Rename column to reflect.
--
-- "pack" stays in the table name for historical continuity;
-- callers should read the column name as the source of truth.
-- ============================================================

ALTER TABLE catalog_pack_compositions
  RENAME COLUMN pack_catalog_item_id TO contents_catalog_item_id;

-- Recreate the unique index with the new column name.
DROP INDEX IF EXISTS catalog_pack_compositions_source_pack_idx;
CREATE UNIQUE INDEX catalog_pack_compositions_source_contents_idx
  ON catalog_pack_compositions(source_catalog_item_id, contents_catalog_item_id);

COMMENT ON COLUMN catalog_pack_compositions.contents_catalog_item_id IS
  'FK to catalog_items.id. Any kind allowed (sealed sub-products like Booster Boxes, Booster Packs, or cards for promos).';

COMMENT ON COLUMN box_decompositions.pack_count IS
  'Cost-split divisor at decomp time. Equals sum(quantity) of non-card recipe rows. Historical name retained.';
