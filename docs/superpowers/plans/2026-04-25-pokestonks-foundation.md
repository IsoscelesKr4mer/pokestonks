# Pokestonks Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation for Pokestonks: a deployed Next.js + Supabase app where a user can sign in with Google, see an empty dashboard with proper navigation chrome on both desktop and mobile, and sign out. No catalog, no purchases yet — just the shell and auth.

**Architecture:** Next.js 15 App Router on Vercel Hobby. Supabase for Postgres + Auth + Storage. Drizzle ORM for type-safe DB access (over Supabase Postgres connection string). Supabase RLS enforces user data isolation at the database layer so app-level filtering is a defense-in-depth, not a primary control. Tailwind + shadcn/ui for UI. TanStack Query for client data fetching (set up here, used heavily in later plans).

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Postgres + Auth + Storage), Drizzle ORM (postgres-js driver), TanStack Query 5, Vitest for unit tests, Playwright for E2E smoke tests.

**Spec reference:** `docs/superpowers/specs/2026-04-25-pokestonks-design.md` Sections 2 (Architecture), 3 (Data Model), 4 (RLS), 5.1 (Sign in flow), 6.3 (Navigation chrome), 11 (Project structure).

---

## File Structure

After this plan completes, the project will look like this. Files marked `(stub)` are scaffolded with placeholder content for now and filled out in later plans.

```
pokestonks/
├── .env.local.example                          # template for required env vars
├── .gitignore                                  # node_modules, .env.local, .next, etc.
├── CLAUDE.md                                   # already exists
├── README.md                                   # short, points at spec + plan
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts                           # drizzle-kit config
├── components.json                             # shadcn/ui config
├── vitest.config.ts
├── playwright.config.ts
├── middleware.ts                               # auth gate, redirects unauth to /login
├── app/
│   ├── layout.tsx                              # root layout, providers
│   ├── globals.css                             # tailwind directives
│   ├── (authenticated)/                        # route group, gated by middleware
│   │   ├── layout.tsx                          # nav chrome (top + bottom tab bar)
│   │   ├── page.tsx                            # / dashboard placeholder
│   │   ├── holdings/page.tsx                   # (stub) "Coming soon"
│   │   ├── sales/page.tsx                      # (stub) "Coming soon"
│   │   ├── settings/page.tsx                   # signout button
│   │   └── onboarding/page.tsx                 # first-run welcome
│   ├── login/page.tsx                          # public, "Continue with Google"
│   └── auth/callback/route.ts                  # OAuth callback handler
├── lib/
│   ├── db/
│   │   ├── client.ts                           # drizzle client wired to Supabase
│   │   └── schema/
│   │       ├── index.ts                        # re-exports
│   │       ├── profiles.ts
│   │       ├── catalogItems.ts
│   │       ├── marketPrices.ts
│   │       ├── purchases.ts
│   │       ├── sales.ts
│   │       ├── userGradedValues.ts
│   │       └── refreshRuns.ts
│   ├── supabase/
│   │   ├── browser.ts                          # createBrowserClient helper
│   │   ├── server.ts                           # createServerClient helper
│   │   └── middleware.ts                       # session refresh in middleware
│   └── query/
│       └── provider.tsx                        # TanStack Query client provider
├── components/
│   ├── ui/                                     # shadcn-generated (Button, Card, etc.)
│   ├── nav/
│   │   ├── TopNav.tsx                          # desktop top bar
│   │   └── BottomTabBar.tsx                    # mobile bottom nav
│   └── auth/
│       └── SignOutButton.tsx
├── drizzle/                                    # generated migrations
│   └── 0000_initial_schema.sql
├── supabase/
│   └── migrations/                             # hand-written SQL migrations (RLS, triggers)
│       └── 20260425000000_rls_and_profile_trigger.sql
├── tests/
│   └── e2e/
│       └── auth.spec.ts                        # Playwright sign-in smoke test
└── docs/
    └── superpowers/
        ├── specs/2026-04-25-pokestonks-design.md   # already exists
        └── plans/2026-04-25-pokestonks-foundation.md # this file
```

**Boundaries enforced by structure:**

- `lib/db/schema/*` — table definitions only. No queries.
- `lib/supabase/*` — client construction only. No business logic.
- `lib/query/*` — TanStack Query setup only.
- `app/(authenticated)/*` — gated by middleware, all routes here assume a session exists.
- `app/login`, `app/auth/callback` — the only public surfaces.
- `components/ui/*` — shadcn primitives, never edited directly.
- `components/nav/*` — composed UI for navigation chrome.

---

## Manual Prerequisites (do these once before starting Task 1)

These are external setup steps that can't be automated. Document them up front so the engineer doesn't get stuck mid-plan.

- [ ] **Create a Supabase project at https://supabase.com/dashboard.**
  - Project name: `pokestonks`
  - Region: nearest US region
  - Database password: generate and save in 1Password (or equivalent)
  - On creation, save the following from `Project Settings → API`:
    - Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
    - Anon public key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
    - Service role secret (`SUPABASE_SERVICE_ROLE_KEY`) — server-side only
  - From `Project Settings → Database → Connection string`, copy the `psql` connection string in **Direct connection** mode and the **Transaction pooler** mode. Save both as `DATABASE_URL_DIRECT` (used by Drizzle migrations) and `DATABASE_URL` (used by app at runtime).

- [ ] **Enable Google OAuth in Supabase.**
  - Go to `Authentication → Providers → Google`, enable.
  - In Google Cloud Console, create OAuth client (Web application). Authorized redirect URI: `https://<your-supabase-project>.supabase.co/auth/v1/callback`.
  - Paste Client ID + Secret back into Supabase.

- [ ] **Get a Pokémon TCG API key at https://dev.pokemontcg.io/.** Save as `POKEMONTCG_API_KEY`. (Not used until Plan 2, but easier to register now.)

---

## Task 1: Initialize repo and Next.js project

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, etc. (Next.js scaffold output)

- [ ] **Step 1: Initialize git**

```bash
cd /c/Users/Michael/Documents/Claude/Pokemon_Portfolio
git init
git config user.email "dixonm7@gmail.com"
git config user.name "Michael Dixon"
```

- [ ] **Step 2: Run create-next-app into the current directory**

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir false \
  --import-alias "@/*" \
  --turbopack \
  --no-experimental-https
```

When prompted whether to overwrite existing files, accept (we'll restore CLAUDE.md and `docs/` from git). Skim the output for the Next.js version installed; the rest of this plan assumes 15.x.

- [ ] **Step 3: Restore CLAUDE.md and docs**

Run `git status`. CLAUDE.md and `docs/` should still be present (untracked but not deleted). If create-next-app deleted them somehow, restore from `git stash list` or recreate from the spec.

- [ ] **Step 4: Verify dev server boots**

```bash
npm run dev
```

Visit http://localhost:3000. The Next.js welcome page should render. Stop with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: initialize Next.js 15 + TypeScript + Tailwind scaffold"
```

---

## Task 2: Install core runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase, Drizzle, TanStack Query**

```bash
npm install @supabase/supabase-js @supabase/ssr \
  drizzle-orm postgres \
  @tanstack/react-query @tanstack/react-query-devtools \
  zod
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D drizzle-kit \
  vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/jest-dom \
  @playwright/test \
  tsx
```

- [ ] **Step 3: Initialize Playwright browsers**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Verify package.json**

Open `package.json` and confirm all packages above appear under `dependencies` or `devDependencies`. No version errors in `npm ls`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add supabase, drizzle, tanstack query, vitest, playwright"
```

---

## Task 3: Set up shadcn/ui

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, `components/ui/card.tsx`, `components/ui/skeleton.tsx`

- [ ] **Step 1: Initialize shadcn**

```bash
npx shadcn@latest init
```

When prompted:
- Style: `Default`
- Base color: `Slate`
- CSS variables: `Yes`

This creates `components.json` and updates `tailwind.config.ts` + `app/globals.css`.

- [ ] **Step 2: Add the Button, Card, Skeleton, and Sheet components**

```bash
npx shadcn@latest add button card skeleton sheet sonner
```

- [ ] **Step 3: Verify components render**

Edit `app/page.tsx` temporarily to:

```tsx
import { Button } from '@/components/ui/button';

export default function Home() {
  return <Button>Hello</Button>;
}
```

Run `npm run dev` and confirm the styled button renders at http://localhost:3000. Then revert `app/page.tsx` to the create-next-app default — Task 9 will replace it properly.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: configure shadcn/ui with default theme + base components"
```

---

## Task 4: Environment variable template and gitignore hardening

**Files:**
- Create: `.env.local.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create `.env.local.example`**

```
# Supabase: from Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# Server-side only. Never expose to the client.
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Postgres connection strings
# DATABASE_URL: pooled, used at runtime by the app
DATABASE_URL=postgresql://postgres:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
# DATABASE_URL_DIRECT: direct, used only by drizzle-kit for migrations
DATABASE_URL_DIRECT=postgresql://postgres:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres

# Pokemon TCG API
POKEMONTCG_API_KEY=

# Cron secret: random string, gates /api/cron/* endpoints. Used in later plans.
CRON_SECRET=
```

- [ ] **Step 2: Verify `.gitignore` excludes `.env.local`**

Open `.gitignore`. Confirm these lines exist (create-next-app should have added the first three):

```
# local env files
.env*.local
.env.local
.env

# editor
.vscode/
.idea/

# os
.DS_Store
Thumbs.db

# brainstorming companion
.superpowers/
```

If the brainstorming or editor lines are missing, add them.

- [ ] **Step 3: Copy template to actual env file and fill it in**

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste the values you saved during Manual Prerequisites. Save.

- [ ] **Step 4: Verify env file is ignored by git**

```bash
git status --short | grep -E '\.env\.local$'
```

Expected: empty output (file ignored). If `.env.local` shows up, fix `.gitignore` before continuing.

- [ ] **Step 5: Commit**

```bash
git add .env.local.example .gitignore
git commit -m "chore: add env template and harden gitignore"
```

---

## Task 5: Drizzle schema files

**Files:**
- Create: `lib/db/schema/profiles.ts`, `lib/db/schema/catalogItems.ts`, `lib/db/schema/marketPrices.ts`, `lib/db/schema/purchases.ts`, `lib/db/schema/sales.ts`, `lib/db/schema/userGradedValues.ts`, `lib/db/schema/refreshRuns.ts`, `lib/db/schema/index.ts`

- [ ] **Step 1: Create `lib/db/schema/profiles.ts`**

```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
```

- [ ] **Step 2: Create `lib/db/schema/catalogItems.ts`**

```ts
import { pgTable, bigserial, text, integer, date, timestamp, bigint, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    setName: text('set_name'),
    setCode: text('set_code'),
    tcgplayerProductId: bigint('tcgplayer_product_id', { mode: 'number' }).unique(),
    productType: text('product_type'),
    msrpCents: integer('msrp_cents'),
    pokemonTcgCardId: text('pokemon_tcg_card_id'),
    tcgplayerSkuId: bigint('tcgplayer_sku_id', { mode: 'number' }),
    cardNumber: text('card_number'),
    rarity: text('rarity'),
    variant: text('variant'),
    imageUrl: text('image_url'),
    imageStoragePath: text('image_storage_path'),
    releaseDate: date('release_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindSetCodeIdx: index('catalog_items_kind_set_code_idx').on(t.kind, t.setCode),
    nameSearchIdx: index('catalog_items_name_search_idx').using('gin', sql`to_tsvector('english', ${t.name})`),
    cardNumberIdx: index('catalog_items_card_number_idx').on(t.cardNumber).where(sql`${t.kind} = 'card'`),
  })
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
```

- [ ] **Step 3: Create `lib/db/schema/marketPrices.ts`**

```ts
import { pgTable, bigserial, bigint, date, integer, text, unique, index } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalogItems';

export const marketPrices = pgTable(
  'market_prices',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date').notNull(),
    condition: text('condition'),
    marketPriceCents: integer('market_price_cents'),
    lowPriceCents: integer('low_price_cents'),
    highPriceCents: integer('high_price_cents'),
    source: text('source').notNull().default('tcgcsv'),
  },
  (t) => ({
    uniqSnapshot: unique('market_prices_uniq_snapshot').on(
      t.catalogItemId,
      t.snapshotDate,
      t.condition,
      t.source
    ),
    catalogDateIdx: index('market_prices_catalog_date_idx').on(t.catalogItemId, t.snapshotDate),
  })
);

export type MarketPrice = typeof marketPrices.$inferSelect;
export type NewMarketPrice = typeof marketPrices.$inferInsert;
```

- [ ] **Step 4: Create `lib/db/schema/purchases.ts`**

```ts
import { pgTable, bigserial, uuid, bigint, date, integer, text, boolean, numeric, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';

export const purchases = pgTable(
  'purchases',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id),
    purchaseDate: date('purchase_date').notNull(),
    quantity: integer('quantity').notNull(),
    costCents: integer('cost_cents').notNull(),
    condition: text('condition'),
    isGraded: boolean('is_graded').notNull().default(false),
    gradingCompany: text('grading_company'),
    grade: numeric('grade', { precision: 3, scale: 1 }),
    certNumber: text('cert_number'),
    source: text('source'),
    location: text('location'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCatalogIdx: index('purchases_user_catalog_idx').on(t.userId, t.catalogItemId),
    quantityCheck: check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    costCheck: check('purchases_cost_nonneg', sql`${t.costCents} >= 0`),
  })
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
```

- [ ] **Step 5: Create `lib/db/schema/sales.ts`**

```ts
import { pgTable, bigserial, uuid, bigint, date, integer, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchases } from './purchases';

export const sales = pgTable(
  'sales',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    purchaseId: bigint('purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    saleDate: date('sale_date').notNull(),
    quantity: integer('quantity').notNull(),
    salePriceCents: integer('sale_price_cents').notNull(),
    feesCents: integer('fees_cents').notNull().default(0),
    matchedCostCents: integer('matched_cost_cents').notNull(),
    platform: text('platform'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('sales_user_date_idx').on(t.userId, t.saleDate),
    quantityCheck: check('sales_quantity_positive', sql`${t.quantity} > 0`),
    feesCheck: check('sales_fees_nonneg', sql`${t.feesCents} >= 0`),
  })
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
```

- [ ] **Step 6: Create `lib/db/schema/userGradedValues.ts`**

```ts
import { pgTable, bigserial, uuid, bigint, text, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { catalogItems } from './catalogItems';

export const userGradedValues = pgTable(
  'user_graded_values',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id),
    gradingCompany: text('grading_company').notNull(),
    grade: numeric('grade', { precision: 3, scale: 1 }).notNull(),
    valueCents: integer('value_cents').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
    notes: text('notes'),
  },
  (t) => ({
    lookupIdx: index('user_graded_values_lookup_idx').on(
      t.userId,
      t.catalogItemId,
      t.gradingCompany,
      t.grade,
      t.recordedAt
    ),
  })
);

export type UserGradedValue = typeof userGradedValues.$inferSelect;
export type NewUserGradedValue = typeof userGradedValues.$inferInsert;
```

- [ ] **Step 7: Create `lib/db/schema/refreshRuns.ts`**

```ts
import { pgTable, bigserial, timestamp, text, integer, jsonb } from 'drizzle-orm/pg-core';

export const refreshRuns = pgTable('refresh_runs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  status: text('status').notNull(),
  totalItems: integer('total_items'),
  succeeded: integer('succeeded'),
  failed: integer('failed'),
  errorsJson: jsonb('errors_json'),
});

export type RefreshRun = typeof refreshRuns.$inferSelect;
export type NewRefreshRun = typeof refreshRuns.$inferInsert;
```

- [ ] **Step 8: Create `lib/db/schema/index.ts`**

```ts
export * from './profiles';
export * from './catalogItems';
export * from './marketPrices';
export * from './purchases';
export * from './sales';
export * from './userGradedValues';
export * from './refreshRuns';
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/db/schema
git commit -m "feat(db): add drizzle schema for all v1 tables"
```

---

## Task 6: Drizzle config and DB client

**Files:**
- Create: `drizzle.config.ts`, `lib/db/client.ts`

- [ ] **Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_DIRECT!,
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: Create `lib/db/client.ts`**

```ts
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Pooled connection. App-runtime queries respect RLS via the Supabase server client,
// so this drizzle client is used only for service-role contexts (cron, admin scripts).
const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 3: Add `db:generate`, `db:push`, `db:studio` scripts**

Open `package.json` and add to the `scripts` section:

```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio",
"db:migrate-rls": "tsx scripts/migrate-rls.ts"
```

- [ ] **Step 4: Verify config loads**

```bash
npx drizzle-kit check
```

Expected: no schema errors. Connection failure is acceptable here (we'll connect in the next task) — what matters is that the schema files parse.

- [ ] **Step 5: Commit**

```bash
git add drizzle.config.ts lib/db/client.ts package.json
git commit -m "feat(db): add drizzle config and pooled client"
```

---

## Task 7: Generate migration and apply schema to Supabase

**Files:**
- Create: `drizzle/0000_*.sql` (generated)

- [ ] **Step 1: Generate the migration**

```bash
npm run db:generate
```

Expected: a file `drizzle/0000_*.sql` containing CREATE TABLE statements for all 7 tables. Open it and skim — it should match your schema files. The `auth.users` reference will appear as `uuid` without an FK because Drizzle doesn't know about Supabase's `auth` schema; we'll add the FK in Task 8 via raw SQL.

- [ ] **Step 2: Apply the generated migration**

Drizzle's `push` writes directly to the live database. Confirm `DATABASE_URL_DIRECT` in `.env.local` points at your Supabase project, then:

```bash
npm run db:push
```

When prompted, confirm. Expected output: tables created.

- [ ] **Step 3: Verify in Supabase dashboard**

Go to `Table Editor` in the Supabase dashboard. You should see all 7 tables (`profiles`, `catalog_items`, `market_prices`, `purchases`, `sales`, `user_graded_values`, `refresh_runs`).

- [ ] **Step 4: Commit**

```bash
git add drizzle
git commit -m "feat(db): apply initial schema to supabase"
```

---

## Task 8: RLS policies + profile trigger migration

**Files:**
- Create: `supabase/migrations/20260425000000_rls_and_profile_trigger.sql`, `scripts/migrate-rls.ts`

- [ ] **Step 1: Create the SQL migration**

```sql
-- supabase/migrations/20260425000000_rls_and_profile_trigger.sql

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
-- Public catalog: read-only for authenticated users
-- ============================================================
CREATE POLICY "catalog_items public read"
  ON catalog_items FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "market_prices public read"
  ON market_prices FOR SELECT TO authenticated, anon
  USING (true);
-- INSERT/UPDATE/DELETE on these tables only via service role (no policy = denied)

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
```

- [ ] **Step 2: Create the migration runner script**

```ts
// scripts/migrate-rls.ts
import 'dotenv/config';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const path = join(dir, file);
    const body = readFileSync(path, 'utf8');
    console.log(`> applying ${file}`);
    await sql.unsafe(body);
  }
  console.log('done');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Install dotenv for the script**

```bash
npm install -D dotenv
```

- [ ] **Step 4: Apply the RLS migration**

```bash
npm run db:migrate-rls
```

Expected output: `> applying 20260425000000_rls_and_profile_trigger.sql` then `done`. Re-running it will fail because of duplicate constraints — that's fine, the migration is one-shot for this plan.

- [ ] **Step 5: Verify policies exist**

In the Supabase dashboard, go to `Authentication → Policies`. Confirm:
- `profiles` has `own profile` policy
- `purchases`, `sales`, `user_graded_values` each have an `own ...` policy
- `catalog_items`, `market_prices` each have a `public read` policy

Then go to `Database → Functions` and confirm `handle_new_user` exists.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations scripts/migrate-rls.ts package.json package-lock.json
git commit -m "feat(db): add RLS policies, FK constraints to auth.users, and profile trigger"
```

---

## Task 9: Supabase client helpers

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`

- [ ] **Step 1: Create `lib/supabase/browser.ts`**

```ts
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 2: Create `lib/supabase/server.ts`**

```ts
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components can't set cookies; middleware handles refresh.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 3: Create `lib/supabase/middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase
git commit -m "feat(auth): add supabase ssr client helpers"
```

---

## Task 10: Auth middleware (gates the (authenticated) route group)

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/middleware.test.ts
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

import { middleware } from '@/middleware';
import { updateSession } from '@/lib/supabase/middleware';

const mockedUpdate = vi.mocked(updateSession);

function makeRequest(path: string) {
  return new NextRequest(new URL(`http://localhost:3000${path}`));
}

describe('middleware', () => {
  it('redirects unauthenticated users to /login when accessing protected routes', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response() as never,
      user: null,
    });
    const res = await middleware(makeRequest('/'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes through unauthenticated users on /login', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response('ok') as never,
      user: null,
    });
    const res = await middleware(makeRequest('/login'));
    expect(res.status).not.toBe(307);
  });

  it('redirects authenticated users away from /login to /', async () => {
    mockedUpdate.mockResolvedValueOnce({
      response: new Response() as never,
      user: { id: 'abc' } as never,
    });
    const res = await middleware(makeRequest('/login'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/$/);
  });
});
```

- [ ] **Step 2: Set up Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 3: Run the test, confirm it fails**

```bash
npm test
```

Expected: FAIL, `Cannot find module '@/middleware'`.

- [ ] **Step 4: Implement `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
npm test
```

Expected: all 3 middleware tests PASS.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts vitest.config.ts tests/setup.ts tests/unit/middleware.test.ts package.json
git commit -m "feat(auth): add auth middleware with route gating + tests"
```

---

## Task 11: Login page and OAuth callback

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/login/login-button.tsx`

- [ ] **Step 1: Create the login button (client component)**

```tsx
// app/login/login-button.tsx
'use client';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/browser';

export function LoginButton() {
  const handleClick = async () => {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  };

  return (
    <Button onClick={handleClick} size="lg" className="w-full max-w-xs">
      Continue with Google
    </Button>
  );
}
```

- [ ] **Step 2: Create the login page (server component)**

```tsx
// app/login/page.tsx
import { LoginButton } from './login-button';

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Pokestonks</h1>
          <p className="text-muted-foreground text-sm">
            Track your sealed Pokémon TCG product, see your real P&amp;L.
          </p>
        </div>
        <LoginButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the OAuth callback route**

```ts
// app/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${error.message}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
```

- [ ] **Step 4: Verify build succeeds**

```bash
npx next build
```

Expected: build succeeds. Warnings about missing env vars are OK during build.

- [ ] **Step 5: Manually verify sign-in flow end-to-end**

Run `npm run dev`. In a browser:
1. Visit http://localhost:3000 → expect redirect to /login
2. Click `Continue with Google` → expect Google's OAuth screen
3. Approve → expect redirect back to http://localhost:3000/ with the empty-page placeholder still in place from create-next-app

Then in Supabase dashboard, `Table Editor → profiles`. Confirm a row exists for your account, with `display_name` populated from your Google name or email.

- [ ] **Step 6: Commit**

```bash
git add app/login app/auth
git commit -m "feat(auth): add login page, OAuth callback, profile auto-create"
```

---

## Task 12: TanStack Query provider

**Files:**
- Create: `lib/query/provider.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create the provider**

```tsx
// lib/query/provider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Wire it into the root layout**

Replace `app/layout.tsx` with:

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query/provider';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Pokestonks',
  description: 'Personal Pokémon TCG portfolio tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npx next build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add lib/query app/layout.tsx
git commit -m "feat(query): add tanstack query provider and toaster"
```

---

## Task 13: Sign-out action and button

**Files:**
- Create: `components/auth/SignOutButton.tsx`, `app/auth/signout/route.ts`

- [ ] **Step 1: Create the signout route**

```ts
// app/auth/signout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), 303);
}
```

- [ ] **Step 2: Add `NEXT_PUBLIC_SITE_URL` to env template**

Edit `.env.local.example` and add:

```
# Public site URL (used in absolute redirects)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Add the same to your local `.env.local`.

- [ ] **Step 3: Create the SignOutButton component**

```tsx
// components/auth/SignOutButton.tsx
'use client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/auth/signout components/auth .env.local.example
git commit -m "feat(auth): add sign-out route and button"
```

---

## Task 14: Authenticated route group layout with nav chrome

**Files:**
- Create: `app/(authenticated)/layout.tsx`, `components/nav/TopNav.tsx`, `components/nav/BottomTabBar.tsx`
- Move: `app/page.tsx` → `app/(authenticated)/page.tsx`

- [ ] **Step 1: Create `components/nav/TopNav.tsx`**

```tsx
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

export function TopNav() {
  return (
    <header className="hidden md:flex sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          Pokestonks
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-muted">Dashboard</Link>
          <Link href="/holdings" className="px-3 py-1.5 rounded-md hover:bg-muted">Holdings</Link>
          <Link href="/sales" className="px-3 py-1.5 rounded-md hover:bg-muted">Sales</Link>
          <Link href="/settings" className="px-3 py-1.5 rounded-md hover:bg-muted">Settings</Link>
        </nav>
        <div className="flex items-center gap-2">
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `components/nav/BottomTabBar.tsx`**

```tsx
import Link from 'next/link';

const tabs = [
  { href: '/', label: 'Dashboard' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/purchases/new', label: 'Add' },
  { href: '/sales', label: 'Sales' },
  { href: '/settings', label: 'Settings' },
];

export function BottomTabBar() {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t bg-background grid grid-cols-5">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="flex flex-col items-center justify-center py-2.5 text-[11px] font-medium hover:bg-muted"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Create the (authenticated) layout**

```tsx
// app/(authenticated)/layout.tsx
import { TopNav } from '@/components/nav/TopNav';
import { BottomTabBar } from '@/components/nav/BottomTabBar';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopNav />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
```

- [ ] **Step 4: Move `app/page.tsx` into the authenticated group**

```bash
mkdir -p "app/(authenticated)"
git mv app/page.tsx "app/(authenticated)/page.tsx"
```

(On Windows bash, this works. If `git mv` complains about path quoting, use `mv app/page.tsx 'app/(authenticated)/page.tsx'` then `git add -A`.)

- [ ] **Step 5: Replace `app/(authenticated)/page.tsx` with the empty dashboard placeholder**

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>You haven&apos;t added anything yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add your first sealed product or card to start tracking your portfolio.
          </p>
          <Button asChild>
            <Link href="/onboarding">Add your first product</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Create stub pages for holdings, sales, settings, onboarding**

```tsx
// app/(authenticated)/holdings/page.tsx
export default function HoldingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
      <p className="text-sm text-muted-foreground mt-2">Coming in Plan 3.</p>
    </div>
  );
}
```

```tsx
// app/(authenticated)/sales/page.tsx
export default function SalesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
      <p className="text-sm text-muted-foreground mt-2">Coming in Plan 5.</p>
    </div>
  );
}
```

```tsx
// app/(authenticated)/settings/page.tsx
import { SignOutButton } from '@/components/auth/SignOutButton';

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SignOutButton />
    </div>
  );
}
```

```tsx
// app/(authenticated)/onboarding/page.tsx
export default function OnboardingPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to Pokestonks</h1>
      <p className="text-muted-foreground">
        Search for sealed product or cards to add them to your portfolio. Your purchases
        will be tracked automatically against daily market prices.
      </p>
      <p className="text-sm text-muted-foreground">
        Search functionality lands in Plan 2.
      </p>
    </div>
  );
}
```

- [ ] **Step 7: Run dev server, manually verify**

```bash
npm run dev
```

Visit http://localhost:3000:
- If signed out, redirected to /login.
- Sign in with Google.
- Lands on dashboard with `Signed in as <your email>`.
- Top nav visible on desktop with Dashboard / Holdings / Sales / Settings + Sign out.
- Resize the window narrow: bottom tab bar appears, top nav disappears.
- Click each nav link, all routes render their stub.
- Click Sign out: redirected to /login.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): add authenticated layout with nav chrome and route stubs"
```

---

## Task 15: Playwright smoke test for sign-in

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/auth.spec.ts`

This is a smoke-level test that the unauthenticated redirect works and the login page renders. We don't try to mock Google OAuth in CI; that's handled by manual testing.

- [ ] **Step 1: Create Playwright config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: Write the smoke test**

```ts
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('login page shows continue with google button', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible();
});
```

- [ ] **Step 3: Run the smoke test**

```bash
npm run test:e2e
```

Expected: 2 tests pass.

- [ ] **Step 4: Add E2E exclusion to vitest config**

Edit `vitest.config.ts` and add to the `test` block:

```ts
exclude: ['node_modules', 'tests/e2e/**', '.next'],
```

This stops `npm test` from trying to run the Playwright tests as Vitest tests.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e vitest.config.ts
git commit -m "test(e2e): add playwright smoke test for auth redirects"
```

---

## Task 16: README + first deploy to Vercel

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write a minimal README**

```markdown
# Pokestonks

Personal Pokémon TCG portfolio tracker. See `docs/superpowers/specs/2026-04-25-pokestonks-design.md` for the full spec.

## Local development

1. Copy `.env.local.example` to `.env.local` and fill in Supabase + Google OAuth values.
2. `npm install`
3. `npm run db:push` to apply Drizzle schema to Supabase.
4. `npm run db:migrate-rls` to apply RLS policies.
5. `npm run dev` and open http://localhost:3000.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm test` — Vitest unit tests
- `npm run test:e2e` — Playwright smoke tests
- `npm run db:generate` — generate Drizzle migration from schema files
- `npm run db:push` — apply schema to Supabase
- `npm run db:migrate-rls` — apply RLS migrations
- `npm run db:studio` — Drizzle Studio (DB browser)

## Deployment

Vercel Hobby tier. Push to GitHub, import the repo into Vercel, paste the env vars from `.env.local.example` into Vercel's project settings.
```

- [ ] **Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add README with local dev + deploy steps"
```

- [ ] **Step 3: Create GitHub repo and push**

Manually:
1. Go to github.com → new repo `pokestonks` (private).
2. Don't add README/license/gitignore (we already have them).
3. Push:

```bash
git remote add origin git@github.com:dixonm7/pokestonks.git
git branch -M main
git push -u origin main
```

(SSH or HTTPS, your choice. If using HTTPS, the URL will be `https://github.com/dixonm7/pokestonks.git`.)

- [ ] **Step 4: Import repo into Vercel**

Manually at https://vercel.com/new:
1. Pick the `pokestonks` repo.
2. Framework preset: Next.js (auto-detected).
3. Environment variables: paste every line from `.env.local` into the Vercel UI under Production + Preview.
4. Update `NEXT_PUBLIC_SITE_URL` in Vercel to the Vercel-assigned URL (e.g., `https://pokestonks.vercel.app`).
5. Deploy.

- [ ] **Step 5: Update Google OAuth authorized redirect URIs**

In Google Cloud Console, add the Vercel production URL's auth callback to the OAuth client's authorized redirect URIs:
`https://pokestonks.vercel.app/auth/callback` and any preview URLs you want to support.

Add the Vercel domain to Supabase's `Authentication → URL configuration → Site URL` and `Redirect URLs` lists.

- [ ] **Step 6: Verify production sign-in works**

Visit your Vercel URL. Sign in with Google. Confirm you land on the dashboard with your email.

- [ ] **Step 7: Final commit (if any local changes from setup)**

```bash
git add -A
git commit -m "chore: production deployment ready" --allow-empty
git push
```

---

## Done — Plan 1 Acceptance

After this plan completes, the following are true:

- [ ] `npm run dev` starts the app on http://localhost:3000.
- [ ] Hitting `/` while signed out redirects to `/login`.
- [ ] `Continue with Google` signs in and redirects back to `/`.
- [ ] After sign-in, a `profiles` row exists for the user with `display_name` populated.
- [ ] Top nav visible on desktop, bottom tab bar on mobile.
- [ ] All 5 nav routes (`/`, `/holdings`, `/sales`, `/settings`, `/purchases/new`) render at least a stub page.
- [ ] Sign out works and lands on `/login`.
- [ ] All RLS policies are active in Supabase (visible in dashboard).
- [ ] `npm test` passes (middleware unit tests).
- [ ] `npm run test:e2e` passes (Playwright smoke).
- [ ] App is deployed to Vercel and sign-in works in production.

When all the above are true, we move on to **Plan 2 — Catalog + Search + Images**.

---

## Self-Review Notes

**Spec coverage:** Plan 1 covers Sections 2 (Architecture & Stack), 3 (full Data Model), 4 (RLS), 5.1 (Sign in flow), 6.3 (Navigation chrome), and the project structure from Section 11. Sections 5.2-5.6 (catalog search, purchases, sales, graded values, dashboard data), 7 (P&L math), and 8 (background jobs) are explicitly deferred to Plans 2-6.

**Placeholder scan:** Tasks 1-16 contain complete code for every step. No "TBD", "TODO", or "implement later" in any executable step. The stub pages for Holdings/Sales explicitly state "Coming in Plan N" so they aren't mistaken for missing work.

**Type consistency:** `createClient` is the helper name used in both `lib/supabase/browser.ts` and `lib/supabase/server.ts` (server is async, browser is sync — both intentional). `updateSession` is used identically in middleware. Schema types (`Profile`, `Purchase`, etc.) are exported consistently from `lib/db/schema/*` and re-exported through `lib/db/schema/index.ts`.

**Manual steps clearly labeled:** The Manual Prerequisites section flags Supabase project creation, Google OAuth client creation, and Pokémon TCG API key registration. Tasks 7, 8, 11 (sign-in verification), and 16 (Vercel deploy) call out verification steps that require human eyes.
