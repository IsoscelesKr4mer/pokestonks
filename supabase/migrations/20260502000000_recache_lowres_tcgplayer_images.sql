-- ============================================================
-- Re-cache low-resolution TCGplayer product images.
--
-- The previous downloadIfMissing path fetched whatever URL TCGCSV
-- gave us, which is the `_200w.jpg` thumbnail (200 pixels wide).
-- sharp's withoutEnlargement:true left the cached webp at
-- 200x191 — visibly blurry in the Vault grid (e.g. catalog item
-- 65, the Ascended Heroes ETB, was 13.5 KB at 200x191).
--
-- The updated downloader now rewrites TCGplayer URLs to
-- `_in_1000x1000.jpg` before fetching. Clearing image_storage_path
-- here forces those rows to re-cache through the new path on the
-- next /api/cache-images call (triggered automatically by any
-- search that surfaces them).
-- ============================================================
UPDATE catalog_items
SET image_storage_path = NULL
WHERE image_storage_path IS NOT NULL
  AND image_url LIKE 'https://tcgplayer-cdn.tcgplayer.com/%';
