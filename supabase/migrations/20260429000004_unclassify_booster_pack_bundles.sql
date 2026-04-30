-- ============================================================
-- Unclassify Booster-Pack-shaped multi-pack/art-bundle products.
--
-- The original `\bBooster Pack\b/i` regex was too greedy: it tagged
-- products like "Prismatic Evolutions Booster Pack Art Bundle [Set
-- of 4]" as productType='Booster Pack', which then polluted the
-- same-set Booster Pack lookup during decomposition auto-derive.
--
-- Going forward, classifySealedType rejects these via a `reject`
-- pattern. This migration cleans up existing rows so the
-- auto-derive query stops finding them.
--
-- Setting product_type = NULL leaves these rows in the catalog
-- (still searchable, still priceable) but stops them from being
-- misclassified. They can be re-classified to a more specific
-- product_type (e.g., 'Booster Pack Art Bundle') in a future plan.
-- ============================================================

UPDATE catalog_items
SET product_type = NULL
WHERE product_type = 'Booster Pack'
  AND name ~* '(art bundle|\[set of [0-9]+\]|booster pack bundle)';
