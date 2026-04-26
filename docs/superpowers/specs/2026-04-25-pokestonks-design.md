# Pokestonks Design Spec

**Date:** 2026-04-25
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon

## 1. Purpose

Pokestonks is a personal Pokémon TCG portfolio tracker that replaces the paid features of Collectr / Pokemon Price Tracker. It tracks cost basis vs. current market value for both sealed product and individual cards (with full Collectr-style fidelity: variants, conditions, raw vs. graded), and computes realized + unrealized P&L.

The app is hosted, multi-user (open Google OAuth registration), and accessible from desktop and mobile. The user is primarily a sealed-product collector (MSRP only, vending-machine and retail sourcing) who wants the option to log singles when they appear (pulls, gifts, occasional buys) without losing data fidelity.

This spec supersedes the prior single-user, local-first, FastAPI-based plan in `CLAUDE.md`.

## 2. Architecture & Stack

### 2.1 Components

- **Frontend + backend:** Next.js 15 (App Router), deployed to Vercel Hobby tier. Single repo, single deploy. Server Components by default, Client Components for interactive surfaces.
- **Database:** Supabase Postgres (free tier).
- **Auth:** Supabase Auth, Google OAuth provider, JWT sessions. Open registration (no allowlist for v1).
- **Storage:** Supabase Storage, public bucket for catalog images, served via the built-in CDN.
- **ORM:** Drizzle, with the Postgres driver pointed at Supabase's connection string.
- **Client data layer:** TanStack Query for all data fetching from React components. No raw `fetch` in components.
- **UI:** Tailwind CSS + shadcn/ui components.
- **Charts:** Recharts (price history sparkline, full price chart on detail pages).
- **Cron:** Vercel Cron for the daily price refresh job.

### 2.2 External APIs

- **TCGCSV** (https://tcgcsv.com): free, unauthenticated, hobbyist-run mirror of TCGplayer's daily public pricing. Pricing source for both sealed and singles. Pokémon `categoryId` = 3.
- **Pokémon TCG API** (https://api.pokemontcg.io/v2): free with API key (20k req/day), card metadata and high-quality scans for singles. Not used for sealed.

### 2.3 Hosting topology

```
Browser (responsive) -> Vercel (Next.js + cron) -> Supabase (Postgres + Auth + Storage)
                                              \-> TCGCSV
                                               \-> Pokémon TCG API
```

A single environment variable named `CRON_SECRET` gates the daily price-refresh endpoint so only Vercel Cron can trigger it. Supabase service-role key is stored in Vercel env vars and used only by the cron handler and admin scripts; user-facing requests use the anon key + Row Level Security.

## 3. Data Model

All identifiers are `BIGSERIAL` unless explicitly UUID. All money is integer cents. All dates are `DATE` (no time component) unless they represent a timestamp event, in which case `TIMESTAMPTZ`.

```sql
-- 3.1 profiles: extends Supabase's built-in auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 catalog_items: shared catalog. ONE table for sealed + cards.
CREATE TABLE catalog_items (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('sealed', 'card')),
  name TEXT NOT NULL,
  set_name TEXT,
  set_code TEXT,
  -- sealed-only
  tcgplayer_product_id BIGINT UNIQUE,
  product_type TEXT,                        -- 'ETB', 'Booster Box', 'Booster Bundle', 'Tin', 'Premium Collection', 'Build & Battle', etc.
  msrp_cents INTEGER,
  -- card-only
  pokemon_tcg_card_id TEXT,                 -- e.g., 'sv3pt5-199'
  tcgplayer_sku_id BIGINT,                  -- pricing key for variant
  card_number TEXT,                         -- e.g., '199/091', '074/088'
  rarity TEXT,
  variant TEXT,                             -- 'normal', 'reverse_holo', 'holo', 'full_art', 'alt_art', 'illustration_rare', 'special_illustration_rare', 'hyper_rare'
  -- shared
  image_url TEXT,                           -- upstream CDN URL
  image_storage_path TEXT,                  -- Supabase Storage object key
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON catalog_items (kind, set_code);
CREATE INDEX ON catalog_items USING gin (to_tsvector('english', name));
CREATE INDEX ON catalog_items (card_number) WHERE kind = 'card';

-- 3.3 market_prices: daily snapshots, system-fetched. Shared catalog data.
CREATE TABLE market_prices (
  id BIGSERIAL PRIMARY KEY,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  condition TEXT,                           -- NULL for sealed; 'NM'/'LP'/'MP'/'HP'/'DMG' for cards
  market_price_cents INTEGER,
  low_price_cents INTEGER,
  high_price_cents INTEGER,
  source TEXT NOT NULL DEFAULT 'tcgcsv',
  UNIQUE (catalog_item_id, snapshot_date, condition, source)
);
CREATE INDEX ON market_prices (catalog_item_id, snapshot_date DESC);

-- 3.4 purchases: user-owned lots. RLS-protected.
CREATE TABLE purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id),
  purchase_date DATE NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),  -- per-unit, includes sales tax
  -- card-specific lot details (NULL for sealed)
  condition TEXT,                           -- 'NM' default in app, picker for 'LP'/'MP'/'HP'/'DMG'
  is_graded BOOLEAN NOT NULL DEFAULT FALSE,
  grading_company TEXT,                     -- 'PSA', 'CGC', 'BGS', 'TAG'
  grade NUMERIC(3,1),                       -- 10.0, 9.5, 9.0, etc.
  cert_number TEXT,
  -- meta
  source TEXT,                              -- e.g., 'Walmart vending', 'Target'
  location TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON purchases (user_id, catalog_item_id);

-- 3.5 sales: FIFO matched against purchase lots. RLS-protected.
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  sale_date DATE NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sale_price_cents INTEGER NOT NULL,
  fees_cents INTEGER NOT NULL DEFAULT 0 CHECK (fees_cents >= 0),
  matched_cost_cents INTEGER NOT NULL,      -- snapshot of lot cost basis at sale time, immutable
  platform TEXT,                            -- 'eBay', 'TCGplayer', 'local'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON sales (user_id, sale_date DESC);

-- 3.6 user_graded_values: manual price entries for graded items. RLS-protected.
CREATE TABLE user_graded_values (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id),
  grading_company TEXT NOT NULL,
  grade NUMERIC(3,1) NOT NULL,
  value_cents INTEGER NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX ON user_graded_values (user_id, catalog_item_id, grading_company, grade, recorded_at DESC);

-- 3.7 refresh_runs: observability for the daily cron
CREATE TABLE refresh_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,                     -- 'running', 'succeeded', 'failed'
  total_items INTEGER,
  succeeded INTEGER,
  failed INTEGER,
  errors_json JSONB
);
```

## 4. Row Level Security

All tables have RLS enabled. Two access patterns:

### 4.1 Public catalog (read-only for users, write-only for service role)

```sql
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_items public read" ON catalog_items FOR SELECT USING (true);
CREATE POLICY "market_prices public read" ON market_prices FOR SELECT USING (true);
-- INSERT/UPDATE/DELETE on these tables is gated by service-role key only
-- (no policy for write operations means RLS denies them by default for anon).
```

### 4.2 Per-user tables (owner-only across all operations)

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_graded_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile" ON profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own purchases" ON purchases FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own sales" ON sales FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own graded values" ON user_graded_values FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

A trigger on `auth.users` insert creates a corresponding `profiles` row.

## 5. Core User Flows

### 5.1 Sign in
A single `Continue with Google` button. Supabase OAuth handles the round-trip. New users get an empty dashboard with a `Add your first product` CTA.

### 5.2 Add a catalog item
The user types into a unified search box. The backend queries TCGCSV (sealed + cards) and Pokémon TCG API (cards) in parallel, dedupes by upstream identifier, and returns the top results with thumbnails.

A filter chip row above the results lets the user narrow by `[All] [Sealed] [Cards]`.

Search tokens are parsed flexibly:
- Pure numeric or `XXX/YYY` patterns match the `card_number` field (exact or prefix).
- Text tokens match `name`, `set_name`, and `set_code`.
- A query like `charizard 199` becomes an AND of `name LIKE '%charizard%'` AND (`name LIKE '%199%'` OR `card_number LIKE '199/%'`).

When the user picks a result, the catalog row is created (or reused if already in the shared catalog), the image is downloaded asynchronously into Supabase Storage, the latest market price is fetched on demand, and the user is redirected to the log-purchase form with this item pre-selected.

If nothing matches, an `Add manually` path lets the user enter name, set, kind, and image URL. Manual entries are flagged in audit metadata.

### 5.3 Log a purchase
Form fields: `catalog item` (pre-filled), `date` (default today), `quantity` (default 1, with `+/-` controls), `per-unit cost with tax` (default to MSRP if known), `source` (chip-style picker over recent sources, with `+ other` for new entries), `location` (optional), `notes` (optional).

For card lots, additional fields appear inline below cost: `condition` (default NM, picker for LP/MP/HP/DMG) and a `This is graded` toggle that reveals grading company / grade / cert when on.

Submit creates a row in `purchases` and redirects to the product detail page.

### 5.4 Log a sale
From a holding's detail page, `Log sale` opens a form: `date`, `quantity`, `gross sale price`, `fees`, `platform`.

The backend runs FIFO (see Section 7) and shows a per-lot breakdown before the user confirms. The user can optionally override FIFO and pick specific lots.

Submit creates one or more `sales` rows, each with `matched_cost_cents` snapshot for immutability.

### 5.5 Update a graded value
From a graded holding's detail page, `Update value` opens a single-field form. Submit writes a new row to `user_graded_values`. The detail page renders a sparkline of value-over-time from this table.

### 5.6 View dashboard / drill in
The Hub layout (Section 6.1) loads on `/`. Tapping a top mover or holding link drills to a detail page with image, current price, P&L, purchase + sales history, and a price chart with 30d / 90d / all-time toggles.

## 6. UI Pages & Routes

### 6.1 Page tree

```
/                               Dashboard, Hub layout
/login                          Public, Google OAuth start
/onboarding                     First-run, empty-state CTA

/holdings                       Full holdings list
/holdings/[catalogItemId]       Per-product detail

/purchases/new                  Add purchase wizard
/purchases/[id]/edit            Edit a purchase row

/sales                          Sales log + realized P&L
/sales/new                      Log sale (FIFO breakdown shown)
/sales/[id]/edit                Edit a sale (recomputes FIFO)

/settings                       Profile, sources, exports, danger zone
```

### 6.2 API routes

```
GET   /api/search?q=...&kind=all|sealed|cards
GET   /api/catalog/[id]
POST  /api/catalog

GET   /api/purchases
POST  /api/purchases
PATCH /api/purchases/[id]
DELETE /api/purchases/[id]

GET   /api/sales
POST  /api/sales
PATCH /api/sales/[id]
DELETE /api/sales/[id]

GET   /api/portfolio

POST  /api/graded-values
GET   /api/graded-values?catalogItemId=...

POST  /api/cron/refresh-prices                 (gated by CRON_SECRET)
GET   /api/export?type=purchases|sales|pnl&year=
```

### 6.3 Navigation chrome

**Mobile (bottom tab bar, 5 slots):** Dashboard, Holdings, Add (center, opens add-purchase wizard), Sales, Settings.

**Desktop (top nav):** logo + horizontal links + `+ Add` button (top-right) with a keyboard shortcut.

### 6.4 Dashboard layout (Hub direction)

A multi-card layout chosen during brainstorming:
- Top-spanning card: portfolio value + sparkline.
- Side-by-side cards: unrealized P&L, realized YTD P&L.
- Bottom card: top movers list (3-5 holdings with thumbnail, name, and `% change`).

Tap any element to drill in. Full holdings list lives one tap or click away on the Holdings tab.

### 6.5 Server vs Client components

| Page | Strategy |
|---|---|
| `/`, `/holdings`, `/holdings/[id]`, `/sales`, `/settings` | Server component fetches initial data with Drizzle, client islands for charts and modals |
| `/purchases/new`, `/sales/new`, `/purchases/[id]/edit` | Client component (form state, search-as-you-type), API routes for mutations |
| `/login`, `/onboarding` | Server component, no data fetching |

### 6.6 Loading and empty states

Each route segment has a `loading.tsx` with shadcn Skeleton placeholders matching the eventual layout. Each segment has an `error.tsx` with `Retry` and `Back to dashboard` actions.

Empty states are designed for: zero holdings, zero sales, zero matches in search, paused-database (Supabase free-tier wakeup) with a friendly message.

## 7. P&L Math

All math lives in `lib/services/pnl.ts`, unit-tested independently of HTTP and DB layers. Money is integer cents throughout; formatting happens only at render.

### 7.1 Definitions

For a given `(user_id, catalog_item_id)`:

```
quantity_held       = sum(purchases.quantity) - sum(sales.quantity)
cost_basis_open     = sum over open lots: purchase.cost_cents * remaining_qty
current_unit_value  = latest market_price (raw/sealed) OR latest user_graded_value (graded)
current_value_open  = quantity_held * current_unit_value
unrealized_pnl      = current_value_open - cost_basis_open
unrealized_pnl_pct  = unrealized_pnl / cost_basis_open    (NULL when cost_basis_open = 0)
```

For each sale row:

```
realized_pnl_sale = sale.sale_price_cents - sale.fees_cents - sale.matched_cost_cents
```

Portfolio totals:

```
portfolio_value     = sum(current_value_open)
total_invested      = sum(purchases.cost_cents * purchases.quantity)   (lifetime)
total_unrealized    = sum(unrealized_pnl)                               (open only)
total_realized_ytd  = sum(realized_pnl_sale where sale_date IN current year)
total_realized_life = sum(realized_pnl_sale)
```

### 7.2 FIFO matching

When a sale of `qty=N` is logged for `catalog_item_id=X`:

1. Fetch all purchases for `(user, X)` ordered by `purchase_date ASC`, then by `id ASC` to break ties.
2. Compute `remaining = lot.quantity - sum(existing sales rows for that lot)`.
3. Walk lots in order, allocating `min(N_remaining, lot_remaining)` to the new sale, creating one `sales` row per lot consumed, decrementing `N_remaining`.
4. If `N_remaining > 0` after walking all lots, reject with an error showing total held vs requested.
5. The user can override FIFO and pick specific lots, useful for tax-lot management.

Each created `sales` row stores `matched_cost_cents` as a snapshot of `lot.cost_cents * allocated_qty`. This makes historical realized P&L immutable: editing a purchase's cost does not retroactively alter past realized numbers.

### 7.3 Edge cases

| Case | Behavior |
|---|---|
| `cost_basis_open = 0` | `unrealized_pnl_pct = NULL`, render as `—` |
| Negative cost | Validation rejects at API layer |
| Sale price = 0 (giveaway) | Allowed. Realized P&L = `-matched_cost`. Notes flag in UI |
| Refund / return | Soft-delete the purchase. If sales reference it, block deletion with an error |
| Stale price (no snapshot in last N days) | Use most recent snapshot; UI shows `Stale (3d ago)` badge on detail page |
| Mid-sale price update | FIFO match locked at sale time via `matched_cost_cents` |
| Bulk price drift on graded items | Manual: user updates `user_graded_values`. Dashboard warns when `last_priced_at > 30 days` |
| Multi-currency | Out of scope. USD only. |

### 7.4 Render-time formatting

- API responses always return integer cents.
- Frontend uses one helper, `formatCents(cents)`, returning strings like `$1,234.56`.
- Negatives render as `-$100.00`, not accounting parens.
- Percentages: 1 decimal place, sign always shown (`+17.4%` / `-3.2%`).
- `null` values render as `—`.

### 7.5 Required tests for `pnl.ts`

- Single purchase, no sale: cost basis correct, qty_held = purchase.qty.
- Single purchase, partial sale: realized = (price - cost * sold_qty), open qty = bought - sold.
- Multi-purchase FIFO across two lots, full sale: cost basis from oldest first.
- Multi-purchase FIFO with manual lot override: uses chosen lots, ignores date order.
- Oversell: rejected with proper error.
- Sale with fees: `realized = price - fees - cost`.
- Graded lot pricing: uses `user_graded_values` not `market_prices`.
- Cost basis = 0: `pct = null`, no division-by-zero.
- Tax-year filter for realized P&L: matches sales by `sale_date.year`.
- Stale price (snapshot > 7d old): still computes value, returns `is_stale = true` flag.

## 8. Background Jobs & Integrations

### 8.1 Daily price refresh

**Trigger:** Vercel Cron, schedule `0 6 * * *` (06:00 UTC, after TCGCSV's daily update).
**Endpoint:** `POST /api/cron/refresh-prices`, gated by `CRON_SECRET` header.

**Algorithm:**

```
1. Load all distinct catalog_item_ids that appear in any user's purchases.
2. Group by kind:
     sealed -> query TCGCSV by tcgplayer_product_id
     card   -> query TCGCSV by tcgplayer_sku_id (per condition tier)
3. Batch fetches in groups of ~100, with small jitter delay between groups.
4. INSERT INTO market_prices ... ON CONFLICT (catalog_item_id, snapshot_date, condition, source) DO UPDATE.
5. Log per-item failures to refresh_runs.errors_json.
6. Return summary JSON for Vercel cron logs.
```

**Failure handling:**

| Failure | Behavior |
|---|---|
| TCGCSV down | 3 retries with backoff, then fail run, alert via Vercel cron failure notification |
| Single item not found | Skip, log, continue |
| Vercel function timeout (10s on Hobby) | Paginate work across invocations using a `next_offset` cursor. Only relevant when catalog grows past ~500 items |
| Cold start | Acceptable, runs daily not interactively |

### 8.2 TCGCSV client

**Endpoints used:**
- `GET /tcgplayer/3/groups`: Pokémon group list (cached in memory for the cron run, refreshed weekly).
- `GET /tcgplayer/3/{groupId}/products`: products in a group.
- `GET /tcgplayer/3/{groupId}/prices`: daily prices, parsed with PapaParse.

**Used for:** catalog discovery (sealed + cards), daily price snapshots, sealed product images.

**No auth required.** Free, public.

### 8.3 Pokémon TCG API client

**Endpoint:** `GET https://api.pokemontcg.io/v2/cards`.
**Auth:** `X-Api-Key` header from `POKEMONTCG_API_KEY` env var. 20k req/day free tier.
**Used for:** card variant catalog (search), high-quality card images, rich card metadata.
**Caching:** card data is persisted to `catalog_items` on first fetch; images are downloaded once to Supabase Storage. The upstream API is only hit for new cards a user searches for.

### 8.4 Image storage flow

On catalog item creation:
1. User picks a search result. API receives upstream `image_url`.
2. `POST /api/catalog` creates the `catalog_items` row, returns it immediately with `image_url` pointing at upstream so the UI shows something fast.
3. A non-blocking server-side fetch downloads the image, uploads to Supabase Storage at path `catalog/{catalog_item_id}.{ext}`.
4. `UPDATE catalog_items SET image_storage_path = '...' WHERE id = ...`.
5. Frontend uses one helper: `getImageUrl(item) = supabaseStoragePublicUrl(item.image_storage_path) ?? item.image_url`. Graceful fallback to upstream while ours is in flight.

**Format:** WebP at quality 85, max 800px wide. Public bucket, served via Supabase CDN.

### 8.5 Rate limit posture

| API | Limit | Pattern | Headroom |
|---|---|---|---|
| TCGCSV | None published | Daily cron | Comfortable |
| Pokémon TCG API | 20k/day with key | On-demand from search, ~1 call per new catalog item | Comfortable |
| Supabase free | 500MB DB, 1GB storage, 50k MAU | Single user thousands of purchases is well under | Comfortable through significant growth |
| Vercel Hobby | 100GB bandwidth, 100h serverless | Mostly server-rendered + light cron | Comfortable |

If any becomes a real ceiling: Supabase Pro ($25/mo), Vercel Pro ($20/mo), or paid Pokémon TCG tier.

## 9. Out of Scope (v2+)

Explicitly not in v1:

- Bulk CSV import.
- Mobile native app (responsive web is the answer).
- Trading / marketplace integrations (selling on eBay through the app).
- Grading workflow (PSA submission tracking). Graded *holding* tracking is in v1; submission is not.
- Cross-user features (leaderboards, comparisons, shared collections, comments).
- Singles deck builder, format legality, set completion percentage.
- Multi-currency. USD only.
- Notifications (price alerts, ATH alerts).
- Two-factor auth, audit logs, admin panel.
- Receipt photo upload / OCR.

## 10. Coding conventions

- No em dashes in user-facing copy.
- Money stored as integer cents everywhere. Never floats. Format only at render.
- Dates as ISO `YYYY-MM-DD` strings or Postgres `DATE`, never `TIMESTAMP` where time is not meaningful.
- API responses always include the local Supabase Storage image URL when available, with upstream URL as fallback.
- All P&L calculations live in `lib/services/pnl.ts`, single source of truth, fully unit-tested.
- Frontend uses TanStack Query for all data fetching, no raw `fetch` in components.
- Drizzle schema files live under `lib/db/schema/`, one file per table.

## 11. Project structure

```
pokestonks/
  app/                              Next.js App Router
    (authenticated)/                grouped layout with auth middleware
      page.tsx                      dashboard
      holdings/
      purchases/
      sales/
      settings/
    login/
    onboarding/
    api/
      search/
      catalog/
      purchases/
      sales/
      portfolio/
      graded-values/
      cron/refresh-prices/
      export/
  lib/
    db/
      schema/                       drizzle table defs
      client.ts                     drizzle + supabase wiring
    services/
      pnl.ts                        P&L math, FIFO
      tcgcsv.ts                     TCGCSV client
      pokemontcg.ts                 Pokémon TCG API client
      images.ts                     download + storage upload
      search.ts                     unified search service
    supabase/
      server.ts                     server client helper
      browser.ts                    browser client helper
  components/
    ui/                             shadcn-generated
    dashboard/
    forms/
    charts/
  docs/superpowers/specs/           this file lives here
  drizzle/                          generated migrations
  CLAUDE.md
  package.json
```

## 12. Open questions

- **Pokémon Center exclusives and other channels TCGCSV may not list.** Manual override path covers this for v1 (manual catalog entry, manual price). Revisit if it becomes common.
- **Vending-machine SKUs that differ from retail.** Same answer: manual entry + flag in UI.
- **Sales tax variation across receipts.** Cost field accepts the actual paid amount including tax, no breakout. If users want tax broken out for tax-prep purposes later, add an optional `tax_cents` column.

## 13. First build step

After this spec is approved and an implementation plan is written:
1. Scaffold Next.js + Supabase + Drizzle.
2. Apply schema migrations (Sections 3 + 4).
3. Implement `services/tcgcsv.ts` and the search endpoint.
4. Verify `GET /api/search?q=151+ETB&kind=sealed` returns the SV151 ETB result with image.

That milestone proves the data pipeline works before any user-facing UI is built on top of it.
