-- ============================================================
-- (1) Drop Collection Box from auto-stamped pack_count.
-- It varies by SKU; should be manual.
-- ============================================================
UPDATE catalog_items
SET pack_count = NULL
WHERE product_type = 'Collection Box';

-- ============================================================
-- (2) Reclassify Pokemon Center ETBs (previously stamped as plain
-- Elite Trainer Box with pack_count=9). They actually contain 11
-- booster packs.
-- ============================================================
UPDATE catalog_items
SET product_type = 'Pokemon Center Elite Trainer Box',
    pack_count = 11
WHERE product_type = 'Elite Trainer Box'
  AND name ~* 'pok[eé]mon center';
