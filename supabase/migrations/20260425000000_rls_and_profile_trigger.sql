-- ============================================================
-- Foreign keys to auth.users (drizzle didn't know about auth schema)
-- ============================================================
ALTER TABLE profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE purchases
  ADD CONSTRAINT purchases_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE sales
  ADD CONSTRAINT sales_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_graded_values
  ADD CONSTRAINT user_graded_values_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================
-- Kind check constraint
-- ============================================================
ALTER TABLE catalog_items
  ADD CONSTRAINT catalog_items_kind_check
  CHECK (kind IN ('sealed', 'card'));

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_graded_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_runs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Public catalog: read-only for authenticated and anon users
-- INSERT/UPDATE/DELETE on these tables only via service role (no policy = denied)
-- ============================================================
CREATE POLICY "catalog_items public read"
  ON catalog_items FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "market_prices public read"
  ON market_prices FOR SELECT TO authenticated, anon
  USING (true);

-- ============================================================
-- Per-user tables: owner-only across all operations
-- ============================================================
CREATE POLICY "own profile"
  ON profiles FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "own purchases"
  ON purchases FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own sales"
  ON sales FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own graded values"
  ON user_graded_values FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- refresh_runs: no user policies. Service role only.

-- ============================================================
-- Auto-create profile row when a new auth user is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
