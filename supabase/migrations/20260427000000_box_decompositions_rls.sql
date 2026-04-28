-- ============================================================
-- Foreign key from box_decompositions.user_id to auth.users
-- (Drizzle didn't add this because it can't see the auth schema.)
-- ============================================================
ALTER TABLE box_decompositions
  ADD CONSTRAINT box_decompositions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- Back-FK from purchases.source_decomposition_id to box_decompositions
-- (Omitted from Drizzle schema to avoid circular type cycle. DB-level
-- FK still enforced.)
-- ============================================================
ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_decomposition_id_fkey
  FOREIGN KEY (source_decomposition_id) REFERENCES box_decompositions(id);

-- ============================================================
-- Enable RLS on box_decompositions
-- ============================================================
ALTER TABLE box_decompositions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Owner-only policy across all operations
-- ============================================================
CREATE POLICY "own decompositions"
  ON box_decompositions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
