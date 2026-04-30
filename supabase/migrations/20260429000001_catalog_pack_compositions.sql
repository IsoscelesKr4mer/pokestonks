-- ============================================================
-- catalog_pack_compositions
--
-- Recipe table: which booster pack catalog items are bundled in
-- a sealed source product. One row per (source, pack) pair with
-- a quantity. Catalog-level (no user_id); shared across all users.
-- Public read; writes via service role only.
-- ============================================================

CREATE TABLE catalog_pack_compositions (
  id bigserial PRIMARY KEY,
  source_catalog_item_id bigint NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  pack_catalog_item_id bigint NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX catalog_pack_compositions_source_pack_idx
  ON catalog_pack_compositions(source_catalog_item_id, pack_catalog_item_id);

CREATE INDEX catalog_pack_compositions_source_idx
  ON catalog_pack_compositions(source_catalog_item_id, display_order);

ALTER TABLE catalog_pack_compositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_pack_compositions public read"
  ON catalog_pack_compositions FOR SELECT TO authenticated, anon
  USING (true);
