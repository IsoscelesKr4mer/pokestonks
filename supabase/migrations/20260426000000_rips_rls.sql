-- ============================================================
-- Foreign key from rips.user_id to auth.users
-- (Drizzle didn't add this because it can't see the auth schema.)
-- ============================================================
ALTER TABLE rips
  ADD CONSTRAINT rips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- Enable RLS on rips
-- ============================================================
ALTER TABLE rips ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Owner-only policy across all operations
-- ============================================================
CREATE POLICY "own rips"
  ON rips FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
