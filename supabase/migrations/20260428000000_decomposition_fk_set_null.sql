-- ============================================================
-- Fix: purchases.source_decomposition_id back-FK was added in
-- 20260427000000_box_decompositions_rls.sql without an ON DELETE
-- clause, defaulting to NO ACTION. This blocks undoing a
-- decomposition: the soft-deleted pack-child still references the
-- box_decompositions row, so the final DELETE FROM box_decompositions
-- raises a FK violation.
--
-- Switch to ON DELETE SET NULL so that hard-deleting the
-- decomposition row clears the dangling reference on the (now
-- soft-deleted) child purchase row. The child row stays in the DB
-- with deleted_at set; only the provenance pointer goes null.
-- ============================================================
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_source_decomposition_id_fkey;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_decomposition_id_fkey
  FOREIGN KEY (source_decomposition_id)
  REFERENCES box_decompositions(id)
  ON DELETE SET NULL;
