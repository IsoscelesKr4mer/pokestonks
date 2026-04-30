-- ============================================================
-- Recovery from `drizzle-kit push` damage on 2026-04-29
--
-- drizzle-kit push diffed against TS schema files (which don't model
-- RLS, auth.users FKs, or the kind check) and dropped:
--   - RLS on all 9 tables
--   - 8 policies (catalog read, market_prices read, own profile,
--     own purchases, own sales, own graded values, own rips, own
--     decompositions)
--   - 6 FKs to auth.users (profiles, purchases, sales,
--     user_graded_values, rips, box_decompositions)
--   - 2 same-schema FKs (purchases.source_rip_id, purchases.source_decomposition_id)
--   - catalog_items_kind_check
--
-- This migration restores everything. Idempotent: safe to re-run.
-- ============================================================

-- 1. Re-enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_graded_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rips ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_decompositions ENABLE ROW LEVEL SECURITY;

-- 2. Re-create RLS policies (drop-if-exists for idempotency)
DROP POLICY IF EXISTS "catalog_items public read" ON catalog_items;
CREATE POLICY "catalog_items public read"
  ON catalog_items FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "market_prices public read" ON market_prices;
CREATE POLICY "market_prices public read"
  ON market_prices FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "own profile" ON profiles;
CREATE POLICY "own profile"
  ON profiles FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "own purchases" ON purchases;
CREATE POLICY "own purchases"
  ON purchases FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own sales" ON sales;
CREATE POLICY "own sales"
  ON sales FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own graded values" ON user_graded_values;
CREATE POLICY "own graded values"
  ON user_graded_values FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rips" ON rips;
CREATE POLICY "own rips"
  ON rips FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own decompositions" ON box_decompositions;
CREATE POLICY "own decompositions"
  ON box_decompositions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 3. Re-add kind check
ALTER TABLE catalog_items
  DROP CONSTRAINT IF EXISTS catalog_items_kind_check;
ALTER TABLE catalog_items
  ADD CONSTRAINT catalog_items_kind_check
  CHECK (kind IN ('sealed', 'card'));

-- 4. Re-add FKs to auth.users
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_user_id_fkey;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_user_id_fkey;
ALTER TABLE sales
  ADD CONSTRAINT sales_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_graded_values
  DROP CONSTRAINT IF EXISTS user_graded_values_user_id_fkey;
ALTER TABLE user_graded_values
  ADD CONSTRAINT user_graded_values_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE rips
  DROP CONSTRAINT IF EXISTS rips_user_id_fkey;
ALTER TABLE rips
  ADD CONSTRAINT rips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE box_decompositions
  DROP CONSTRAINT IF EXISTS box_decompositions_user_id_fkey;
ALTER TABLE box_decompositions
  ADD CONSTRAINT box_decompositions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. Re-add purchases.source_rip_id FK
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_source_rip_id_rips_id_fk;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_rip_id_rips_id_fk
  FOREIGN KEY (source_rip_id) REFERENCES public.rips(id);

-- 6. Re-add purchases.source_decomposition_id FK (ON DELETE SET NULL per
-- migration 20260428000000)
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_source_decomposition_id_fkey;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_source_decomposition_id_fkey
  FOREIGN KEY (source_decomposition_id)
  REFERENCES box_decompositions(id)
  ON DELETE SET NULL;
