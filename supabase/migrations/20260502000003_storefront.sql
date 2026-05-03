-- ============================================================
-- Plan 10: Storefront tables
--
-- share_tokens         — public-link rows, owner-only RLS
-- storefront_listings  — per (user, catalog_item) asking price
--
-- Service-role bypass on the public /storefront/[token] route
-- is achieved by using the direct-Postgres Drizzle client
-- (lib/db/client.ts), which is not subject to PostgREST RLS.
-- The RLS policies below remain in place for the standard
-- authenticated (PostgREST/anon) access paths.
-- ============================================================

CREATE TABLE share_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('storefront')),
  label TEXT NOT NULL DEFAULT '',
  header_title TEXT,
  header_subtitle TEXT,
  contact_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX share_tokens_user_idx ON share_tokens (user_id, revoked_at);

CREATE TABLE storefront_listings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  asking_price_cents INTEGER NOT NULL CHECK (asking_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, catalog_item_id)
);
CREATE INDEX storefront_listings_user_idx ON storefront_listings (user_id);

ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own share_tokens" ON share_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE storefront_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own storefront_listings" ON storefront_listings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON COLUMN share_tokens.kind IS
  'Discriminator. Only ''storefront'' in v1; future plans (vault-share) will widen the CHECK.';
COMMENT ON COLUMN share_tokens.revoked_at IS
  'Soft-revoke timestamp. NULL means active. Public route renders 410 + "taken down" copy when set.';
COMMENT ON COLUMN storefront_listings.asking_price_cents IS
  'Per (user, catalog_item) asking price in cents. PK enforces uniqueness; UPSERT on conflict.';
