# Pokestonks Plan 3 — Purchases + Pack Ripping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working purchases flow (CRUD + holdings + dashboard tile) plus the pack-ripping feature: log purchases via a full form, quick-add tile button, or holdings-detail "+" stepper; aggregate into a Collectr-style holdings grid; rip a sealed lot into N kept cards with cost-basis snapshotting and residual realized loss.

**Architecture:** Two new migrations (purchases.deleted_at, rips table + source_rip_id FK). Eight new API routes plus two extensions to existing routes. Shared Zod validation between client form and server. Service helpers for holdings aggregation and rip residual math (pure functions, fully TDD'd). TanStack Query hooks for client data. New components under `components/purchases/` and `components/rips/`. Two new pages (`/holdings/[id]`, `/purchases/[id]/edit`) and three pages refactored from stubs (`/holdings`, `/purchases/new`, `/`). Direct-to-main shipping per project posture.

**Tech Stack:** Next.js 16 App Router + TypeScript, Drizzle ORM (service-role only) + Supabase Postgres, Supabase Auth (RLS-enforced), Supabase server client for user-data routes, TanStack Query 5, shadcn/ui 4.x (base-ui) + Tailwind, Zod 4, Vitest 4 (node env default; happy-dom per-file for components).

**Spec reference:** `docs/superpowers/specs/2026-04-26-pokestonks-purchases-design.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
lib/
├── db/
│   └── schema/
│       ├── purchases.ts                 # MODIFIED: add deletedAt, sourceRipId
│       ├── rips.ts                      # CREATED
│       └── index.ts                     # MODIFIED: re-export rips
├── validation/
│   ├── purchase.ts                      # CREATED
│   ├── purchase.test.ts                 # CREATED
│   ├── rip.ts                           # CREATED
│   └── rip.test.ts                      # CREATED
├── services/
│   ├── holdings.ts                      # CREATED (aggregateHoldings, aggregateLot, formatRealizedLoss)
│   ├── holdings.test.ts                 # CREATED
│   ├── rips.ts                          # CREATED (computeRealizedLoss, resolveCostBasis)
│   └── rips.test.ts                     # CREATED
├── query/hooks/
│   ├── usePurchases.ts                  # CREATED (usePurchases, usePurchaseSources, mutations)
│   ├── useHoldings.ts                   # CREATED
│   ├── useRips.ts                       # CREATED
│   └── useDashboardTotals.ts            # CREATED
└── utils/
    └── (existing unchanged)

app/api/
├── purchases/
│   ├── route.ts                         # MODIFIED: GET list + replaced POST with form-aware create
│   ├── [id]/route.ts                    # CREATED: PATCH + DELETE
│   ├── sources/route.ts                 # CREATED: GET top 5 sources
│   ├── route.test.ts                    # CREATED
│   └── [id]/route.test.ts               # CREATED
├── rips/
│   ├── route.ts                         # CREATED: POST
│   ├── [id]/route.ts                    # CREATED: GET + DELETE (undo)
│   └── route.test.ts                    # CREATED
├── holdings/
│   ├── route.ts                         # CREATED: GET aggregated
│   └── [catalogItemId]/route.ts         # CREATED: GET single-item + lot list + rips
└── dashboard/
    └── totals/route.ts                  # CREATED

app/(authenticated)/
├── page.tsx                             # MODIFIED: dashboard with DashboardTotalsCard
├── purchases/
│   ├── new/page.tsx                     # MODIFIED: real form (replaces stub)
│   └── [id]/edit/page.tsx               # CREATED: deep-link edit fallback
└── holdings/
    ├── page.tsx                         # MODIFIED: grid (replaces stub)
    └── [catalogItemId]/page.tsx         # CREATED: lot detail (sealed/card variants)

components/
├── purchases/
│   ├── PurchaseForm.tsx                 # CREATED
│   ├── PurchaseForm.test.tsx            # CREATED (happy-dom)
│   ├── SourceChipPicker.tsx             # CREATED
│   ├── SourceChipPicker.test.tsx        # CREATED (happy-dom)
│   ├── QuantityStepper.tsx              # CREATED
│   ├── QuantityStepper.test.tsx         # CREATED (happy-dom)
│   ├── LotRow.tsx                       # CREATED
│   └── EditPurchaseDialog.tsx           # CREATED
├── rips/
│   ├── RipPackDialog.tsx                # CREATED
│   ├── RipPackDialog.test.tsx           # CREATED (happy-dom)
│   ├── RipDetailDialog.tsx              # CREATED
│   └── RipRow.tsx                       # CREATED
├── dashboard/
│   └── DashboardTotalsCard.tsx          # CREATED
├── catalog/
│   ├── QuickAddButton.tsx               # MODIFIED: drop fallbackCents prop, send only catalogItemId+quantity
│   └── SearchResultRow.tsx              # MODIFIED: stop passing fallbackCents to QuickAddButton
└── ui/
    ├── dialog.tsx                       # CREATED via shadcn add
    └── select.tsx                       # CREATED via shadcn add

drizzle/
├── 0004_*.sql                           # GENERATED: purchases.deleted_at + open-lots index
└── 0005_*.sql                           # GENERATED: rips table + purchases.source_rip_id FK

supabase/migrations/
└── 20260426000000_rips_rls.sql          # CREATED: "own rips" policy + auth.users FK

vitest.config.mts                        # MODIFIED: environmentMatchGlobs for *.test.tsx → happy-dom
package.json                             # MODIFIED: add happy-dom devDep
```

**Boundaries enforced:**

- `lib/validation/*` — pure Zod schemas, no DB or HTTP. Reusable from both client form and server route.
- `lib/services/*` — pure functions, no DB or HTTP. `computeRealizedLoss(packCost, keptCosts[])` and `aggregateHoldings(rows, rips)` are deterministic and unit-testable.
- `app/api/*` routes — orchestrate auth → validate → call Supabase/Drizzle → return JSON. No business math; delegate to services.
- `lib/query/hooks/*` — TanStack Query hooks calling `/api/*`. No raw `fetch` in components.
- `components/purchases/*` and `components/rips/*` — presentational + form state. Mutations come from hooks, never inline `fetch`.
- Pages compose components and call API routes server-side via `createClient()` for initial data. Client islands subscribe via hooks.

---

## Task 1: Install happy-dom and wire vitest environmentMatchGlobs

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.mts`

**Why:** Plan 3 introduces the project's first component tests. Per `feedback_stack_gotchas.md`, jsdom 27 + vitest 4 has an ESM/CJS interop bug in this codebase, so component tests use happy-dom. Existing node-env tests stay unchanged.

- [ ] **Step 1: Install happy-dom**

```bash
npm install --save-dev happy-dom
```

Expected: `happy-dom` appears in `package.json` `devDependencies`.

- [ ] **Step 2: Update `vitest.config.mts` to switch envs by file pattern**

Replace the contents of `vitest.config.mts` with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      // Component tests run in happy-dom; everything else stays in node.
      ['**/*.test.tsx', 'happy-dom'],
      ['components/**/*.test.ts', 'happy-dom'],
    ],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['node_modules', 'tests/e2e/**', '.next'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
});
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm test
```

Expected: middleware.test.ts passes (still node env).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vitest.config.mts
git commit -m "chore(test): add happy-dom for component tests, opt in via env globs"
```

---

## Task 2: Migration 0004 — `add_purchases_deleted_at`

**Files:**
- Modify: `lib/db/schema/purchases.ts`
- Generate: `drizzle/0004_*.sql`

**Spec:** Section 4.1.

- [ ] **Step 1: Add `deletedAt` to the Drizzle schema**

Open `lib/db/schema/purchases.ts`. Add the new field next to `createdAt` and add a partial index on `(user_id, catalog_item_id) WHERE deleted_at IS NULL`. Keep all existing fields, types, indexes, and check constraints intact.

```ts
import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  date,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCatalogIdx: index('purchases_user_catalog_idx').on(t.userId, t.catalogItemId),
    userCatalogOpenIdx: index('purchases_user_catalog_open_idx')
      .on(t.userId, t.catalogItemId)
      .where(sql`${t.deletedAt} IS NULL`),
    quantityCheck: check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    costCheck: check('purchases_cost_nonneg', sql`${t.costCents} >= 0`),
  })
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```

Expected: a new file `drizzle/0004_*.sql` is created. Open it and confirm it contains exactly:

```sql
ALTER TABLE "purchases" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "purchases_user_catalog_open_idx" ON "purchases" USING btree ("user_id","catalog_item_id") WHERE "purchases"."deleted_at" IS NULL;
```

If the diff shows other ALTERs or unexpected drops, abort and reconcile.

- [ ] **Step 3: Apply the migration**

```bash
npm run db:migrate
```

Expected: prints "applied migration 0004_*". No errors.

- [ ] **Step 4: Smoke-test in Drizzle Studio (optional)**

```bash
npm run db:studio
```

Open the `purchases` table and confirm the `deleted_at` column exists, nullable. Close Studio.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/purchases.ts drizzle/0004_*.sql drizzle/meta/_journal.json drizzle/meta/0004_*.json
git commit -m "feat(db): add purchases.deleted_at + open-lots partial index"
```

---

## Task 3: Migration 0005 — `add_rips_and_source_rip_id`

**Files:**
- Create: `lib/db/schema/rips.ts`
- Modify: `lib/db/schema/purchases.ts` (add `sourceRipId` field)
- Modify: `lib/db/schema/index.ts` (re-export rips)
- Generate: `drizzle/0005_*.sql`

**Spec:** Section 4.2.

- [ ] **Step 1: Create the rips schema**

Create `lib/db/schema/rips.ts`:

```ts
import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  date,
  integer,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchases } from './purchases';

export const rips = pgTable(
  'rips',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    ripDate: date('rip_date').notNull(),
    packCostCents: integer('pack_cost_cents').notNull(),
    realizedLossCents: integer('realized_loss_cents').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('rips_user_date_idx').on(t.userId, t.ripDate),
    sourcePurchaseIdx: index('rips_source_purchase_idx').on(t.sourcePurchaseId),
    packCostCheck: check('rips_pack_cost_nonneg', sql`${t.packCostCents} >= 0`),
  })
);

export type Rip = typeof rips.$inferSelect;
export type NewRip = typeof rips.$inferInsert;
```

- [ ] **Step 2: Add `sourceRipId` to the purchases schema**

Open `lib/db/schema/purchases.ts`. At the top, import `rips`:

```ts
import { rips } from './rips';
```

Add the `sourceRipId` field next to `deletedAt`, and add a partial index for it:

```ts
sourceRipId: bigint('source_rip_id', { mode: 'number' }).references(() => rips.id),
```

Add the index inside the second arg's object:

```ts
sourceRipIdx: index('purchases_source_rip_idx')
  .on(t.sourceRipId)
  .where(sql`${t.sourceRipId} IS NOT NULL`),
```

The full file should now look like:

```ts
import {
  pgTable,
  bigserial,
  uuid,
  bigint,
  date,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';
import { rips } from './rips';

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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    sourceRipId: bigint('source_rip_id', { mode: 'number' }).references(() => rips.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userCatalogIdx: index('purchases_user_catalog_idx').on(t.userId, t.catalogItemId),
    userCatalogOpenIdx: index('purchases_user_catalog_open_idx')
      .on(t.userId, t.catalogItemId)
      .where(sql`${t.deletedAt} IS NULL`),
    sourceRipIdx: index('purchases_source_rip_idx')
      .on(t.sourceRipId)
      .where(sql`${t.sourceRipId} IS NOT NULL`),
    quantityCheck: check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    costCheck: check('purchases_cost_nonneg', sql`${t.costCents} >= 0`),
  })
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
```

Note the circular import (`purchases` ↔ `rips`). Drizzle and TypeScript handle this fine because both `references()` calls are lazy (passed as functions).

- [ ] **Step 3: Re-export rips from schema index**

Open `lib/db/schema/index.ts` and add the new export. The full file should be:

```ts
export * from './profiles';
export * from './catalogItems';
export * from './marketPrices';
export * from './purchases';
export * from './sales';
export * from './userGradedValues';
export * from './refreshRuns';
export * from './rips';
```

- [ ] **Step 4: Generate the migration**

```bash
npm run db:generate
```

Expected: `drizzle/0005_*.sql` is created. Open it and verify it contains:
- `CREATE TABLE "rips"` with all columns and the `rips_pack_cost_nonneg` check constraint
- `ALTER TABLE "purchases" ADD COLUMN "source_rip_id" bigint`
- A foreign key from `purchases.source_rip_id` → `rips.id`
- A foreign key from `rips.source_purchase_id` → `purchases.id`
- Indexes `rips_user_date_idx`, `rips_source_purchase_idx`, `purchases_source_rip_idx`

If something is missing or extra, abort and reconcile.

- [ ] **Step 5: Apply the migration**

```bash
npm run db:migrate
```

Expected: prints "applied migration 0005_*". No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema/rips.ts lib/db/schema/purchases.ts lib/db/schema/index.ts drizzle/0005_*.sql drizzle/meta/_journal.json drizzle/meta/0005_*.json
git commit -m "feat(db): add rips table + purchases.source_rip_id FK"
```

---

## Task 4: RLS migration — `"own rips"` policy + auth.users FK

**Files:**
- Create: `supabase/migrations/20260426000000_rips_rls.sql`

**Why:** Drizzle migrations don't apply RLS policies (Plan 1 followed the same split — see `supabase/migrations/20260425000000_rls_and_profile_trigger.sql`). The rips table also needs a `user_id` FK to `auth.users` because Drizzle can't see the auth schema.

**Spec:** Section 4.3.

- [ ] **Step 1: Create the SQL migration**

Create `supabase/migrations/20260426000000_rips_rls.sql`:

```sql
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
```

- [ ] **Step 2: Apply via the existing migrate-rls script**

```bash
npm run db:migrate-rls
```

Expected: the script applies new SQL files in `supabase/migrations/`. Look at `scripts/migrate-rls.ts` to confirm it picks up new files automatically; it iterates over the directory.

If the script doesn't auto-pick up new files, run the SQL manually via Supabase SQL editor.

- [ ] **Step 3: Smoke-test the policy**

In Supabase SQL editor (Dashboard), run:

```sql
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'rips'::regclass;
```

Expected: one row with `polname = 'own rips'` and `polcmd = '*'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260426000000_rips_rls.sql
git commit -m "feat(db): add RLS 'own rips' policy + auth.users FK on rips"
```

---

## Task 5: Validation — `lib/validation/purchase.ts` (TDD)

**Files:**
- Create: `lib/validation/purchase.ts`
- Create: `lib/validation/purchase.test.ts`

**Spec:** Section 8 (purchaseInputSchema).

- [ ] **Step 1: Write the failing test**

Create `lib/validation/purchase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { purchaseInputSchema, purchasePatchSchema } from './purchase';

describe('purchaseInputSchema', () => {
  const minimal = { catalogItemId: 1 };

  it('accepts a minimal payload', () => {
    const r = purchaseInputSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it('defaults quantity to 1 and isGraded to false', () => {
    const r = purchaseInputSchema.parse(minimal);
    expect(r.quantity).toBe(1);
    expect(r.isGraded).toBe(false);
  });

  it('rejects negative cost', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, costCents: -1 });
    expect(r.success).toBe(false);
  });

  it('accepts null cost (server resolves)', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, costCents: null });
    expect(r.success).toBe(true);
  });

  it('rejects zero quantity', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, quantity: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects future purchaseDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects malformed date', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: '2026/04/26' });
    expect(r.success).toBe(false);
  });

  it('accepts ISO date today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = purchaseInputSchema.safeParse({ ...minimal, purchaseDate: today });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('rejects condition outside enum', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, condition: 'WORN' });
    expect(r.success).toBe(false);
  });

  it('rejects isGraded=true without gradingCompany', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, isGraded: true, grade: 10 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('gradingCompany');
    }
  });

  it('rejects isGraded=true without grade', () => {
    const r = purchaseInputSchema.safeParse({ ...minimal, isGraded: true, gradingCompany: 'PSA' });
    expect(r.success).toBe(false);
  });

  it('accepts isGraded=true with both gradingCompany and grade', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 10,
    });
    expect(r.success).toBe(true);
  });

  it('rejects grade outside 0..10', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 11,
    });
    expect(r.success).toBe(false);
  });

  it('rejects grade not in 0.5 increments', () => {
    const r = purchaseInputSchema.safeParse({
      ...minimal,
      isGraded: true,
      gradingCompany: 'PSA',
      grade: 9.7,
    });
    expect(r.success).toBe(false);
  });
});

describe('purchasePatchSchema', () => {
  it('accepts an empty object', () => {
    const r = purchasePatchSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts partial fields', () => {
    const r = purchasePatchSchema.safeParse({ notes: 'hello' });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/validation/purchase.test.ts
```

Expected: FAIL with "Cannot find module './purchase'".

- [ ] **Step 3: Implement the schema**

Create `lib/validation/purchase.ts`:

```ts
import { z } from 'zod';

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'TAG'] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    // Compare YYYY-MM-DD lexicographically against today's YYYY-MM-DD;
    // avoids the timezone trap where "2026-04-26" parses to UTC midnight
    // and looks future-dated in any zone west of UTC.
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const purchaseInputSchema = z
  .object({
    catalogItemId: z.number().int().positive(),
    quantity: z.number().int().min(1).default(1),
    costCents: z.number().int().nonnegative().nullable().optional(),
    purchaseDate: isoDate.optional(),
    source: z.string().max(120).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    isGraded: z.boolean().default(false),
    gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
    grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
    certNumber: z.string().max(64).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isGraded) {
      if (!v.gradingCompany) {
        ctx.addIssue({
          path: ['gradingCompany'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
      if (v.grade == null) {
        ctx.addIssue({
          path: ['grade'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
    }
  });

export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

// PATCH: every field optional.
export const purchasePatchSchema = z
  .object({
    catalogItemId: z.number().int().positive().optional(),
    quantity: z.number().int().min(1).optional(),
    costCents: z.number().int().nonnegative().nullable().optional(),
    purchaseDate: isoDate.optional(),
    source: z.string().max(120).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    isGraded: z.boolean().optional(),
    gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
    grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
    certNumber: z.string().max(64).nullable().optional(),
  });

export type PurchasePatch = z.infer<typeof purchasePatchSchema>;

export const HARD_FIELDS_FOR_RIP_CHILDREN = [
  'catalogItemId',
  'quantity',
  'costCents',
  'purchaseDate',
] as const satisfies readonly (keyof PurchasePatch)[];
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/validation/purchase.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/purchase.ts lib/validation/purchase.test.ts
git commit -m "feat(validation): add purchase Zod schemas (input + patch)"
```

---

## Task 6: Validation — `lib/validation/rip.ts` (TDD)

**Files:**
- Create: `lib/validation/rip.ts`
- Create: `lib/validation/rip.test.ts`

**Spec:** Section 8 (ripInputSchema).

- [ ] **Step 1: Write the failing test**

Create `lib/validation/rip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ripInputSchema } from './rip';

describe('ripInputSchema', () => {
  const base = { sourcePurchaseId: 1, keptCards: [] };

  it('accepts N=0 (empty keptCards)', () => {
    const r = ripInputSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('accepts N=1', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: 500 }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts N=11 (god pack)', () => {
    const keptCards = Array.from({ length: 11 }, (_, i) => ({
      catalogItemId: i + 2,
      costCents: 100,
    }));
    const r = ripInputSchema.safeParse({ ...base, keptCards });
    expect(r.success).toBe(true);
  });

  it('accepts kept costs that exceed pack cost (negative residual)', () => {
    // Schema does NOT enforce sum constraint; that's the whole point.
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: 99999 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects future ripDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = ripInputSchema.safeParse({ ...base, ripDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects negative kept-card cost', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [{ catalogItemId: 2, costCents: -1 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects kept card with isGraded but no gradingCompany', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [
        { catalogItemId: 2, costCents: 500, isGraded: true, grade: 10 },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('accepts kept card with full grading info', () => {
    const r = ripInputSchema.safeParse({
      ...base,
      keptCards: [
        {
          catalogItemId: 2,
          costCents: 500,
          isGraded: true,
          gradingCompany: 'PSA',
          grade: 10,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = ripInputSchema.safeParse({ ...base, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/validation/rip.test.ts
```

Expected: FAIL with "Cannot find module './rip'".

- [ ] **Step 3: Implement the schema**

Create `lib/validation/rip.ts`:

```ts
import { z } from 'zod';
import { CONDITIONS, GRADING_COMPANIES } from './purchase';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

const keptCardSchema = z
  .object({
    catalogItemId: z.number().int().positive(),
    costCents: z.number().int().nonnegative(),
    condition: z.enum(CONDITIONS).nullable().optional(),
    isGraded: z.boolean().default(false),
    gradingCompany: z.enum(GRADING_COMPANIES).nullable().optional(),
    grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
    certNumber: z.string().max(64).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.isGraded) {
      if (!v.gradingCompany) {
        ctx.addIssue({
          path: ['gradingCompany'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
      if (v.grade == null) {
        ctx.addIssue({
          path: ['grade'],
          code: 'custom',
          message: 'Required for graded cards',
        });
      }
    }
  });

export type RipKeptCard = z.infer<typeof keptCardSchema>;

export const ripInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  ripDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
  keptCards: z.array(keptCardSchema),
});

export type RipInput = z.infer<typeof ripInputSchema>;
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/validation/rip.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/rip.ts lib/validation/rip.test.ts
git commit -m "feat(validation): add rip Zod schema (N=0 to god-pack)"
```

---

## Task 7: Service — `lib/services/rips.ts` (`computeRealizedLoss`, TDD)

**Files:**
- Create: `lib/services/rips.ts`
- Create: `lib/services/rips.test.ts`

**Spec:** Section 5.7 step 6, Section 10.1.

- [ ] **Step 1: Write the failing test**

Create `lib/services/rips.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRealizedLoss, resolveCostBasis } from './rips';

describe('computeRealizedLoss', () => {
  it('returns full pack cost when no kept cards (N=0 bulk write-off)', () => {
    expect(computeRealizedLoss(500, [])).toBe(500);
  });

  it('returns 0 when one card absorbs full pack cost', () => {
    expect(computeRealizedLoss(500, [500])).toBe(0);
  });

  it('returns positive residual when bulk is written off', () => {
    expect(computeRealizedLoss(500, [200])).toBe(300);
  });

  it('returns negative residual when keeps exceed pack cost (arbitrage)', () => {
    expect(computeRealizedLoss(500, [600])).toBe(-100);
  });

  it('handles N=2 even split with no residual', () => {
    expect(computeRealizedLoss(500, [250, 250])).toBe(0);
  });

  it('handles N=11 god pack with no residual', () => {
    const eleven = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 0];
    expect(computeRealizedLoss(500, eleven)).toBe(0);
  });

  it('handles pack cost = 0', () => {
    expect(computeRealizedLoss(0, [])).toBe(0);
    expect(computeRealizedLoss(0, [100])).toBe(-100);
  });
});

describe('resolveCostBasis', () => {
  it('returns msrpCents when set', () => {
    expect(resolveCostBasis({ msrpCents: 1999, lastMarketCents: 5000 })).toBe(1999);
  });

  it('falls back to lastMarketCents when MSRP missing', () => {
    expect(resolveCostBasis({ msrpCents: null, lastMarketCents: 5000 })).toBe(5000);
  });

  it('returns 0 when both null', () => {
    expect(resolveCostBasis({ msrpCents: null, lastMarketCents: null })).toBe(0);
  });

  it('treats undefined as null', () => {
    expect(resolveCostBasis({})).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/services/rips.test.ts
```

Expected: FAIL with "Cannot find module './rips'".

- [ ] **Step 3: Implement the service**

Create `lib/services/rips.ts`:

```ts
/**
 * Pure functions for rip math + cost-basis resolution.
 * No DB or HTTP — safe to call from anywhere.
 */

/**
 * Compute the signed realized loss snapshot for a rip.
 *
 *   realized_loss = pack_cost - sum(kept_cost)
 *
 * Sign convention:
 *   positive: bulk write-off (user kept less value than pack cost)
 *   zero:     clean transfer (kept costs exactly equal pack cost)
 *   negative: cost-basis arbitrage (user assigned more cost than pack cost)
 *
 * Snapshot at rip time, immutable.
 */
export function computeRealizedLoss(packCostCents: number, keptCostCents: readonly number[]): number {
  const sumKept = keptCostCents.reduce((acc, c) => acc + c, 0);
  return packCostCents - sumKept;
}

/**
 * Resolve a default cost basis when the caller didn't supply one.
 * Order matches Section 5.1: msrp_cents -> last_market_cents -> 0.
 *
 *   Sealed with MSRP known: returns MSRP (vending = MSRP).
 *   Cards (no MSRP, only market): returns last_market_cents.
 *   Anything missing both: returns 0 (user can edit later).
 */
export function resolveCostBasis(item: {
  msrpCents?: number | null;
  lastMarketCents?: number | null;
}): number {
  if (item.msrpCents != null) return item.msrpCents;
  if (item.lastMarketCents != null) return item.lastMarketCents;
  return 0;
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/services/rips.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/rips.ts lib/services/rips.test.ts
git commit -m "feat(services): add computeRealizedLoss + resolveCostBasis pure functions"
```

---

## Task 8: Service — `lib/services/holdings.ts` (`aggregateHoldings`, TDD)

**Files:**
- Create: `lib/services/holdings.ts`
- Create: `lib/services/holdings.test.ts`

**Spec:** Section 5.5, Section 10.1.

These are pure aggregation helpers. The DB query in the API route fetches raw rows; this service handles the math so it's testable in isolation.

- [ ] **Step 1: Write the failing test**

Create `lib/services/holdings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from './holdings';

const sealed = { kind: 'sealed' as const, name: 'ETB', set_name: 'SV151', product_type: 'ETB', last_market_cents: 6000, image_url: null, image_storage_path: null };
const card = { kind: 'card' as const, name: 'Pikachu ex', set_name: 'AH', product_type: null, last_market_cents: 117087, image_url: null, image_storage_path: null };

function makePurchase(overrides: Partial<RawPurchaseRow>): RawPurchaseRow {
  return {
    id: 1,
    catalog_item_id: 1,
    catalog_item: sealed,
    quantity: 1,
    cost_cents: 5000,
    deleted_at: null,
    created_at: '2026-04-25T00:00:00Z',
    ...overrides,
  };
}

describe('aggregateHoldings', () => {
  it('returns empty list when no purchases', () => {
    expect(aggregateHoldings([], [])).toEqual([]);
  });

  it('aggregates a single purchase', () => {
    const result = aggregateHoldings([makePurchase({ id: 1, quantity: 2, cost_cents: 5000 })], []);
    expect(result).toEqual([
      expect.objectContaining({
        catalogItemId: 1,
        qtyHeld: 2,
        totalInvestedCents: 10000,
        kind: 'sealed',
      }),
    ]);
  });

  it('subtracts ripped units from sealed qty', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 3, cost_cents: 5000 })];
    const rips: RawRipRow[] = [
      { id: 100, source_purchase_id: 10 },
      { id: 101, source_purchase_id: 10 },
    ];
    const result = aggregateHoldings(purchases, rips);
    expect(result[0].qtyHeld).toBe(1);
    expect(result[0].totalInvestedCents).toBe(5000);
  });

  it('excludes fully-ripped sealed lots from output', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 1, cost_cents: 5000 })];
    const rips: RawRipRow[] = [{ id: 100, source_purchase_id: 10 }];
    expect(aggregateHoldings(purchases, rips)).toEqual([]);
  });

  it('excludes soft-deleted purchases', () => {
    const purchases = [makePurchase({ id: 10, deleted_at: '2026-04-26T00:00:00Z' })];
    expect(aggregateHoldings(purchases, [])).toEqual([]);
  });

  it('groups multiple lots of the same catalog item', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 5, catalog_item: card, quantity: 1, cost_cents: 100000 }),
      makePurchase({ id: 2, catalog_item_id: 5, catalog_item: card, quantity: 2, cost_cents: 110000 }),
    ];
    const result = aggregateHoldings(purchases, []);
    expect(result).toHaveLength(1);
    expect(result[0].qtyHeld).toBe(3);
    expect(result[0].totalInvestedCents).toBe(100000 + 2 * 110000);
  });

  it('sorts by most recently created lot descending', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 1, created_at: '2026-04-20T00:00:00Z' }),
      makePurchase({ id: 2, catalog_item_id: 2, catalog_item: card, created_at: '2026-04-26T00:00:00Z' }),
    ];
    const result = aggregateHoldings(purchases, []);
    expect(result[0].catalogItemId).toBe(2);
    expect(result[1].catalogItemId).toBe(1);
  });

  it('rip rows for a non-existent purchase are ignored gracefully', () => {
    const purchases = [makePurchase({ id: 10, quantity: 1 })];
    const rips: RawRipRow[] = [{ id: 999, source_purchase_id: 99999 }];
    const result = aggregateHoldings(purchases, rips);
    expect(result[0].qtyHeld).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/services/holdings.test.ts
```

Expected: FAIL with "Cannot find module './holdings'".

- [ ] **Step 3: Implement the service**

Create `lib/services/holdings.ts`:

```ts
/**
 * Pure aggregation helpers for holdings views.
 * Input shape mirrors the raw rows the API route would fetch from Supabase
 * (snake_case JSON), so these helpers are testable without a DB.
 */

export type RawCatalogItem = {
  kind: 'sealed' | 'card';
  name: string;
  set_name: string | null;
  product_type: string | null;
  last_market_cents: number | null;
  image_url: string | null;
  image_storage_path: string | null;
};

export type RawPurchaseRow = {
  id: number;
  catalog_item_id: number;
  catalog_item: RawCatalogItem;
  quantity: number;
  cost_cents: number;
  deleted_at: string | null;
  created_at: string;
};

export type RawRipRow = {
  id: number;
  source_purchase_id: number;
};

export type Holding = {
  catalogItemId: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  qtyHeld: number;
  totalInvestedCents: number;
};

/**
 * Group purchases by catalog_item_id, subtract ripped units (sealed only),
 * compute qty_held and total_invested per item.
 *
 * Skips: soft-deleted purchases, items with qty_held <= 0 after rip
 * subtraction.
 *
 * Sort: most recently created underlying lot descending (matches the spec
 * SQL ORDER BY MAX(p.created_at) DESC).
 */
export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[]
): Holding[] {
  // Count rips per source purchase so we can subtract them from sealed qty.
  const rippedUnitsByPurchase = new Map<number, number>();
  for (const r of rips) {
    rippedUnitsByPurchase.set(
      r.source_purchase_id,
      (rippedUnitsByPurchase.get(r.source_purchase_id) ?? 0) + 1
    );
  }

  type Acc = {
    holding: Holding;
    latestCreatedAt: string;
  };
  const byCatalogItem = new Map<number, Acc>();

  for (const p of purchases) {
    if (p.deleted_at != null) continue;
    const ripped = rippedUnitsByPurchase.get(p.id) ?? 0;
    const remaining = p.quantity - ripped;
    if (remaining <= 0) continue;

    const existing = byCatalogItem.get(p.catalog_item_id);
    if (existing) {
      existing.holding.qtyHeld += remaining;
      existing.holding.totalInvestedCents += p.cost_cents * remaining;
      if (p.created_at > existing.latestCreatedAt) {
        existing.latestCreatedAt = p.created_at;
      }
    } else {
      byCatalogItem.set(p.catalog_item_id, {
        holding: {
          catalogItemId: p.catalog_item_id,
          kind: p.catalog_item.kind,
          name: p.catalog_item.name,
          setName: p.catalog_item.set_name,
          productType: p.catalog_item.product_type,
          imageUrl: p.catalog_item.image_url,
          imageStoragePath: p.catalog_item.image_storage_path,
          lastMarketCents: p.catalog_item.last_market_cents,
          qtyHeld: remaining,
          totalInvestedCents: p.cost_cents * remaining,
        },
        latestCreatedAt: p.created_at,
      });
    }
  }

  return Array.from(byCatalogItem.values())
    .sort((a, b) => (a.latestCreatedAt < b.latestCreatedAt ? 1 : -1))
    .map((a) => a.holding);
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/services/holdings.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/holdings.ts lib/services/holdings.test.ts
git commit -m "feat(services): add aggregateHoldings (rip-aware, soft-delete-aware)"
```

---

## Task 9: Add shadcn `Dialog` and `Select` components

**Files:**
- Create: `components/ui/dialog.tsx`
- Create: `components/ui/select.tsx`

**Why:** The edit dialog, rip dialog, rip detail dialog all need shadcn `Dialog`. The form needs `Select` for condition + grading company + grade dropdowns. Plan 1 / Plan 2 didn't add these; they're the first dialog components in the codebase.

- [ ] **Step 1: Add Dialog**

```bash
npx shadcn@latest add dialog
```

Expected: prompts to add `components/ui/dialog.tsx`. Accept. The file should export `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.

- [ ] **Step 2: Add Select**

```bash
npx shadcn@latest add select
```

Expected: `components/ui/select.tsx` is created. Exports `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`.

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/dialog.tsx components/ui/select.tsx package.json package-lock.json
git commit -m "feat(ui): add shadcn Dialog and Select components"
```

---

## Task 10: API — `GET /api/purchases/sources` (top 5 by recency)

**Files:**
- Create: `app/api/purchases/sources/route.ts`

**Spec:** Section 5.4.

- [ ] **Step 1: Implement the route**

Create `app/api/purchases/sources/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Supabase JS client doesn't express GROUP BY directly; fetch the latest
  // 500 rows and dedupe in JS. Per-user dataset stays small enough.
  const { data, error } = await supabase
    .from('purchases')
    .select('source, created_at')
    .not('source', 'is', null)
    .neq('source', '')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const sources: string[] = [];
  for (const row of data ?? []) {
    const s = row.source as string | null;
    if (!s || seen.has(s)) continue;
    seen.add(s);
    sources.push(s);
    if (sources.length >= 5) break;
  }

  return NextResponse.json({ sources });
}
```

- [ ] **Step 2: Manual smoke**

`npm run dev`, sign in, insert one purchase via Supabase Studio with `source = 'Walmart vending'`. Visit `http://localhost:3000/api/purchases/sources`. Expected: `{"sources":["Walmart vending"]}`.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/sources/route.ts
git commit -m "feat(api): GET /api/purchases/sources returns top 5 distinct sources"
```

---

## Task 11: API — `POST /api/purchases` rewrite + `GET /api/purchases` list

**Files:**
- Modify: `app/api/purchases/route.ts`

**Spec:** Section 5.1.

The existing route is the placeholder POST from Plan 2. Rewrite to use the Zod schema, drop the hardcoded `source: 'quick-add'`, and add a GET that lists current user's purchases.

- [ ] **Step 1: Replace `app/api/purchases/route.ts`**

Replace the entire file with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { purchaseInputSchema } from '@/lib/validation/purchase';
import { resolveCostBasis } from '@/lib/services/rips';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const catalogItemIdParam = request.nextUrl.searchParams.get('catalogItemId');
  let query = supabase
    .from('purchases')
    .select('*')
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
    .order('id', { ascending: false });
  if (catalogItemIdParam) {
    const numericId = Number(catalogItemIdParam);
    if (!Number.isFinite(numericId)) {
      return NextResponse.json({ error: 'invalid catalogItemId' }, { status: 400 });
    }
    query = query.eq('catalog_item_id', numericId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ purchases: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = purchaseInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // catalog_items is RLS-public-read; Drizzle here is safe because the table
  // isn't per-user.
  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, v.catalogItemId),
  });
  if (!item) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const isCard = item.kind === 'card';
  const costCents =
    v.costCents ??
    resolveCostBasis({
      msrpCents: item.msrpCents ?? null,
      lastMarketCents: item.lastMarketCents ?? null,
    });

  const today = new Date().toISOString().slice(0, 10);

  const insertRow = {
    user_id: user.id,
    catalog_item_id: v.catalogItemId,
    purchase_date: v.purchaseDate ?? today,
    quantity: v.quantity,
    cost_cents: costCents,
    source: v.source ?? null,
    location: v.location ?? null,
    notes: v.notes ?? null,
    condition: isCard ? v.condition ?? 'NM' : null,
    is_graded: isCard ? v.isGraded : false,
    grading_company: isCard && v.isGraded ? v.gradingCompany ?? null : null,
    grade: isCard && v.isGraded && v.grade != null ? String(v.grade) : null,
    cert_number: isCard && v.isGraded ? v.certNumber ?? null : null,
  };

  const { data, error } = await supabase
    .from('purchases')
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
```

- [ ] **Step 2: Manual smoke**

`npm run dev`. Sign in. POST via console:

```js
await fetch('/api/purchases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ catalogItemId: 1, quantity: 1 }),
}).then(r => r.json());
```

Expected: a row with `cost_cents` matching MSRP (or last_market_cents if MSRP is null). GET via:

```js
await fetch('/api/purchases').then(r => r.json());
```

Expected: `{ purchases: [...] }`.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/route.ts
git commit -m "feat(api): rewrite POST /api/purchases with Zod + MSRP-first cost resolution; add GET list"
```

---

## Task 12: API — `PATCH /api/purchases/[id]` and `DELETE /api/purchases/[id]`

**Files:**
- Create: `app/api/purchases/[id]/route.ts`

**Spec:** Sections 5.2, 5.3.

PATCH enforces rip-child immutability (hard fields locked when `source_rip_id IS NOT NULL`). DELETE is soft and returns 409 when sales OR rips reference the purchase.

- [ ] **Step 1: Implement the route**

Create `app/api/purchases/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  purchasePatchSchema,
  HARD_FIELDS_FOR_RIP_CHILDREN,
} from '@/lib/validation/purchase';

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = purchasePatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id, source_rip_id, deleted_at')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }

  if (existing.source_rip_id != null) {
    const violatedFields = HARD_FIELDS_FOR_RIP_CHILDREN.filter(
      (f) => v[f] !== undefined
    );
    if (violatedFields.length > 0) {
      return NextResponse.json(
        {
          error:
            'cannot edit cost/quantity/date on rip-child purchases; undo the rip and recreate',
          fields: violatedFields,
        },
        { status: 422 }
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (v.catalogItemId !== undefined) update.catalog_item_id = v.catalogItemId;
  if (v.quantity !== undefined) update.quantity = v.quantity;
  if (v.costCents !== undefined) update.cost_cents = v.costCents;
  if (v.purchaseDate !== undefined) update.purchase_date = v.purchaseDate;
  if (v.source !== undefined) update.source = v.source;
  if (v.location !== undefined) update.location = v.location;
  if (v.notes !== undefined) update.notes = v.notes;
  if (v.condition !== undefined) update.condition = v.condition;
  if (v.isGraded !== undefined) update.is_graded = v.isGraded;
  if (v.gradingCompany !== undefined) update.grading_company = v.gradingCompany;
  if (v.grade !== undefined) update.grade = v.grade != null ? String(v.grade) : null;
  if (v.certNumber !== undefined) update.cert_number = v.certNumber;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, id: numericId });
  }

  const { data, error } = await supabase
    .from('purchases')
    .update(update)
    .eq('id', numericId)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'purchase not found' }, { status: 404 });
  }

  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id')
    .eq('purchase_id', numericId);
  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }
  if (sales && sales.length > 0) {
    return NextResponse.json(
      { error: 'purchase has linked sales', linkedSaleIds: sales.map((s) => s.id) },
      { status: 409 }
    );
  }

  const { data: rips, error: ripsErr } = await supabase
    .from('rips')
    .select('id')
    .eq('source_purchase_id', numericId);
  if (ripsErr) {
    return NextResponse.json({ error: ripsErr.message }, { status: 500 });
  }
  if (rips && rips.length > 0) {
    return NextResponse.json(
      { error: 'purchase has been ripped', ripIds: rips.map((r) => r.id) },
      { status: 409 }
    );
  }

  const { error: updateErr } = await supabase
    .from('purchases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', numericId)
    .is('deleted_at', null);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Manual smoke**

PATCH soft fields:
```js
await fetch('/api/purchases/<id>', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ notes: 'updated' }),
}).then(r => r.json());
```

DELETE:
```js
await fetch('/api/purchases/<id>', { method: 'DELETE' }).then(r => r.status);
```

Expected: 204 first time, 404 second time.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/[id]/route.ts
git commit -m "feat(api): PATCH + DELETE /api/purchases/[id] with rip-child lock and soft-delete"
```

---

## Task 13: API — `POST /api/rips` (transactional rip create)

**Files:**
- Create: `app/api/rips/route.ts`

**Spec:** Sections 5.7, 11.3.

Uses Drizzle's `db.transaction()` with manual user-id verification (per spec 11.3, option b).

- [ ] **Step 1: Implement the route**

Create `app/api/rips/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { ripInputSchema } from '@/lib/validation/rip';
import { computeRealizedLoss } from '@/lib/services/rips';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = ripInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Drizzle bypasses RLS — verify ownership manually before any write.
  const sourcePurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, v.sourcePurchaseId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!sourcePurchase || sourcePurchase.deletedAt != null) {
    return NextResponse.json({ error: 'source purchase not found' }, { status: 404 });
  }

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'source catalog item not found' }, { status: 404 });
  }
  if (sourceItem.kind !== 'sealed') {
    return NextResponse.json(
      { error: 'rip source must be a sealed lot' },
      { status: 422 }
    );
  }

  const [{ ripped }] = await db
    .select({ ripped: count() })
    .from(schema.rips)
    .where(eq(schema.rips.sourcePurchaseId, sourcePurchase.id));
  const qtyRemaining = sourcePurchase.quantity - Number(ripped);
  if (qtyRemaining < 1) {
    return NextResponse.json(
      { error: 'pack already fully ripped' },
      { status: 422 }
    );
  }

  if (v.keptCards.length > 0) {
    const ids = v.keptCards.map((k) => k.catalogItemId);
    const keptItems = await db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, ids),
    });
    const byId = new Map(keptItems.map((i) => [i.id, i]));
    for (const k of v.keptCards) {
      const item = byId.get(k.catalogItemId);
      if (!item) {
        return NextResponse.json(
          { error: `kept card catalog item not found: ${k.catalogItemId}` },
          { status: 422 }
        );
      }
      if (item.kind !== 'card') {
        return NextResponse.json(
          { error: 'kept card must be kind=card' },
          { status: 422 }
        );
      }
    }
  }

  const packCostCents = sourcePurchase.costCents;
  const realizedLossCents = computeRealizedLoss(
    packCostCents,
    v.keptCards.map((k) => k.costCents)
  );

  const today = new Date().toISOString().slice(0, 10);
  const ripDate = v.ripDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      const [rip] = await tx
        .insert(schema.rips)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          ripDate,
          packCostCents,
          realizedLossCents,
          notes: v.notes ?? null,
        })
        .returning();

      const keptPurchases = [];
      for (const k of v.keptCards) {
        const [child] = await tx
          .insert(schema.purchases)
          .values({
            userId: user.id,
            catalogItemId: k.catalogItemId,
            purchaseDate: ripDate,
            quantity: 1,
            costCents: k.costCents,
            condition: k.condition ?? 'NM',
            isGraded: k.isGraded ?? false,
            gradingCompany: k.isGraded ? k.gradingCompany ?? null : null,
            grade: k.isGraded && k.grade != null ? String(k.grade) : null,
            certNumber: k.isGraded ? k.certNumber ?? null : null,
            source: null,
            location: null,
            notes: k.notes ?? null,
            sourceRipId: rip.id,
          })
          .returning();
        keptPurchases.push(child);
      }

      return { rip, keptPurchases };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rip create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Manual smoke (N=1)**

Pre-req: at least one sealed pack purchase + one card catalog row.

```js
await fetch('/api/rips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourcePurchaseId: <SEALED_PURCHASE_ID>,
    keptCards: [{ catalogItemId: <CARD_CATALOG_ID>, costCents: 500 }],
  }),
}).then(r => r.json());
```

Expected: `{ rip, keptPurchases: [...] }` with `rip.realized_loss_cents = pack_cost_cents - 500`.

- [ ] **Step 3: Manual smoke (N=0 bulk write-off)**

```js
await fetch('/api/rips', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sourcePurchaseId: <ANOTHER_SEALED_PURCHASE_ID>,
    keptCards: [],
  }),
}).then(r => r.json());
```

Expected: `rip.realized_loss_cents` equals the full pack cost. No child rows.

- [ ] **Step 4: Commit**

```bash
git add app/api/rips/route.ts
git commit -m "feat(api): POST /api/rips with transactional create + qty-consumed check"
```

---

## Task 14: API — `GET /api/rips/[id]` and `DELETE /api/rips/[id]` (undo)

**Files:**
- Create: `app/api/rips/[id]/route.ts`

**Spec:** Sections 5.8, 5.9.

- [ ] **Step 1: Implement the route**

Create `app/api/rips/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rip = await db.query.rips.findFirst({
    where: and(eq(schema.rips.id, numericId), eq(schema.rips.userId, user.id)),
  });
  if (!rip) {
    return NextResponse.json({ error: 'rip not found' }, { status: 404 });
  }

  const sourcePurchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, rip.sourcePurchaseId),
  });
  const sourceCatalogItem = sourcePurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
      })
    : null;

  const keptPurchases = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.sourceRipId, rip.id),
      isNull(schema.purchases.deletedAt)
    ),
  });
  const keptCatalogIds = keptPurchases.map((p) => p.catalogItemId);
  const keptCatalogItems =
    keptCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: (ci, ops) => ops.inArray(ci.id, keptCatalogIds),
        })
      : [];
  const byCatalogId = new Map(keptCatalogItems.map((i) => [i.id, i]));

  return NextResponse.json({
    rip,
    sourcePurchase,
    sourceCatalogItem,
    keptPurchases: keptPurchases.map((p) => ({
      purchase: p,
      catalogItem: byCatalogId.get(p.catalogItemId) ?? null,
    })),
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rip = await db.query.rips.findFirst({
    where: and(eq(schema.rips.id, numericId), eq(schema.rips.userId, user.id)),
  });
  if (!rip) {
    return NextResponse.json({ error: 'rip not found' }, { status: 404 });
  }

  // Block if any child has linked sales. Use Supabase nested join with
  // RLS scoping to filter to the current user.
  const { data: linkedSales, error: salesErr } = await supabase
    .from('sales')
    .select('id, purchase_id, purchases!inner(source_rip_id)')
    .eq('purchases.source_rip_id', numericId);
  if (salesErr) {
    return NextResponse.json({ error: salesErr.message }, { status: 500 });
  }
  if (linkedSales && linkedSales.length > 0) {
    return NextResponse.json(
      {
        error: 'rip has linked sales on its kept cards',
        linkedSaleIds: linkedSales.map((s) => s.id),
      },
      { status: 409 }
    );
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.purchases)
        .set({ deletedAt: new Date() })
        .where(eq(schema.purchases.sourceRipId, numericId));
      await tx.delete(schema.rips).where(eq(schema.rips.id, numericId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo rip failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Manual smoke**

```js
await fetch('/api/rips/<id>').then(r => r.json());      // returns rip + source + kept
await fetch('/api/rips/<id>', { method: 'DELETE' }).then(r => r.status);  // 204
```

After undo, the source pack lot's qty is re-credited (verify via `/api/holdings`).

- [ ] **Step 3: Commit**

```bash
git add app/api/rips/[id]/route.ts
git commit -m "feat(api): GET + DELETE /api/rips/[id] (undo soft-deletes children, re-credits qty)"
```

---

## Task 15: API — `GET /api/holdings`

**Files:**
- Create: `app/api/holdings/route.ts`

**Spec:** Section 5.5.

Uses Supabase nested-select to join `catalog_items`, fetches all rips, then runs `aggregateHoldings` from the service.

- [ ] **Step 1: Implement the route**

Create `app/api/holdings/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents)'
    )
    .is('deleted_at', null);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[]
  );

  return NextResponse.json({ holdings });
}
```

- [ ] **Step 2: Manual smoke**

```js
await fetch('/api/holdings').then(r => r.json());
```

Expected: `{ holdings: [...] }`. Soft-deleted rows excluded; ripped sealed lots reduced/dropped.

- [ ] **Step 3: Commit**

```bash
git add app/api/holdings/route.ts
git commit -m "feat(api): GET /api/holdings (rip-aware aggregation via service layer)"
```

---

## Task 16: API — `GET /api/holdings/[catalogItemId]`

**Files:**
- Create: `app/api/holdings/[catalogItemId]/route.ts`

**Spec:** Section 5.5 (per-item detail).

Returns the catalog item, holding rollup, lot rows with rip provenance joined for cards, and rip events for sealed.

- [ ] **Step 1: Implement the route**

Create `app/api/holdings/[catalogItemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ catalogItemId: string }> }
) {
  const { catalogItemId } = await ctx.params;
  const numericId = Number(catalogItemId);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const lots = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.userId, user.id),
      eq(schema.purchases.catalogItemId, numericId),
      isNull(schema.purchases.deletedAt)
    ),
    orderBy: [asc(schema.purchases.purchaseDate), asc(schema.purchases.id)],
  });

  // Provenance for card lots: source rip + source pack name.
  const sourceRipIds = lots
    .map((l) => l.sourceRipId)
    .filter((v): v is number => v != null);
  const sourceRips =
    sourceRipIds.length > 0
      ? await db.query.rips.findMany({
          where: inArray(schema.rips.id, sourceRipIds),
        })
      : [];
  const ripById = new Map(sourceRips.map((r) => [r.id, r]));
  const sourcePackPurchaseIds = sourceRips.map((r) => r.sourcePurchaseId);
  const sourcePackPurchases =
    sourcePackPurchaseIds.length > 0
      ? await db.query.purchases.findMany({
          where: inArray(schema.purchases.id, sourcePackPurchaseIds),
        })
      : [];
  const sourcePackByPurchaseId = new Map(sourcePackPurchases.map((p) => [p.id, p]));
  const sourcePackCatalogIds = sourcePackPurchases.map((p) => p.catalogItemId);
  const sourcePackCatalogItems =
    sourcePackCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: inArray(schema.catalogItems.id, sourcePackCatalogIds),
        })
      : [];
  const sourcePackCatalogById = new Map(sourcePackCatalogItems.map((c) => [c.id, c]));

  // Rip events for sealed (with kept count).
  const lotIds = lots.map((l) => l.id);
  const ripsForSealed =
    item.kind === 'sealed' && lotIds.length > 0
      ? await db.query.rips.findMany({
          where: inArray(schema.rips.sourcePurchaseId, lotIds),
        })
      : [];
  const ripIdsForKeptCount = ripsForSealed.map((r) => r.id);
  const keptChildren =
    ripIdsForKeptCount.length > 0
      ? await db.query.purchases.findMany({
          where: and(
            inArray(schema.purchases.sourceRipId, ripIdsForKeptCount),
            isNull(schema.purchases.deletedAt)
          ),
        })
      : [];
  const keptCountByRipId = keptChildren.reduce<Map<number, number>>((acc, p) => {
    acc.set(p.sourceRipId!, (acc.get(p.sourceRipId!) ?? 0) + 1);
    return acc;
  }, new Map());

  // Rollup using the same aggregation as the list endpoint.
  const rawPurchases: RawPurchaseRow[] = lots.map((l) => ({
    id: l.id,
    catalog_item_id: l.catalogItemId,
    quantity: l.quantity,
    cost_cents: l.costCents,
    deleted_at: l.deletedAt ? l.deletedAt.toISOString() : null,
    created_at: l.createdAt.toISOString(),
    catalog_item: {
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      set_name: item.setName,
      product_type: item.productType,
      image_url: item.imageUrl,
      image_storage_path: item.imageStoragePath,
      last_market_cents: item.lastMarketCents,
    },
  }));
  const rawRips: RawRipRow[] = ripsForSealed.map((r) => ({
    id: r.id,
    source_purchase_id: r.sourcePurchaseId,
  }));
  const [holding] = aggregateHoldings(rawPurchases, rawRips);

  const lotsWithProvenance = lots.map((l) => {
    if (l.sourceRipId == null) return { lot: l, sourceRip: null, sourcePack: null };
    const rip = ripById.get(l.sourceRipId) ?? null;
    const pack = rip ? sourcePackByPurchaseId.get(rip.sourcePurchaseId) ?? null : null;
    const packCatalog = pack ? sourcePackCatalogById.get(pack.catalogItemId) ?? null : null;
    return {
      lot: l,
      sourceRip: rip
        ? { id: rip.id, ripDate: rip.ripDate, sourcePurchaseId: rip.sourcePurchaseId }
        : null,
      sourcePack: packCatalog
        ? { catalogItemId: packCatalog.id, name: packCatalog.name }
        : null,
    };
  });

  const ripsSummary =
    item.kind === 'sealed'
      ? ripsForSealed.map((r) => ({
          id: r.id,
          ripDate: r.ripDate,
          packCostCents: r.packCostCents,
          realizedLossCents: r.realizedLossCents,
          keptCardCount: keptCountByRipId.get(r.id) ?? 0,
          sourcePurchaseId: r.sourcePurchaseId,
          notes: r.notes,
        }))
      : [];

  return NextResponse.json({
    item: {
      id: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      msrpCents: item.msrpCents,
    },
    holding: holding ?? {
      catalogItemId: item.id,
      kind: item.kind,
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      qtyHeld: 0,
      totalInvestedCents: 0,
    },
    lots: lotsWithProvenance,
    rips: ripsSummary,
  });
}
```

- [ ] **Step 2: Manual smoke**

```js
await fetch('/api/holdings/<your_catalog_id>').then(r => r.json());
```

Expected: `{ item, holding, lots: [...], rips: [...] }`. Card pulled from rip has `sourceRip` + `sourcePack` populated. Sealed item shows rip events under `rips`.

- [ ] **Step 3: Commit**

```bash
git add app/api/holdings/[catalogItemId]/route.ts
git commit -m "feat(api): GET /api/holdings/[id] returns rollup + lots with rip provenance"
```

---

## Task 17: API — `GET /api/dashboard/totals`

**Files:**
- Create: `app/api/dashboard/totals/route.ts`

**Spec:** Section 5.6.

- [ ] **Step 1: Implement the route**

Create `app/api/dashboard/totals/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: purchases, error: pErr } = await supabase
    .from('purchases')
    .select('cost_cents, quantity')
    .is('deleted_at', null);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('realized_loss_cents');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const totalInvestedCents = (purchases ?? []).reduce(
    (acc, p) => acc + (p.cost_cents as number) * (p.quantity as number),
    0
  );
  const totalRipLossCents = (rips ?? []).reduce(
    (acc, r) => acc + (r.realized_loss_cents as number),
    0
  );
  const lotCount = purchases?.length ?? 0;

  return NextResponse.json({ totalInvestedCents, totalRipLossCents, lotCount });
}
```

- [ ] **Step 2: Manual smoke**

```js
await fetch('/api/dashboard/totals').then(r => r.json());
```

Expected: `{ totalInvestedCents, totalRipLossCents, lotCount }`. Fresh user: all zeros.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/totals/route.ts
git commit -m "feat(api): GET /api/dashboard/totals (invested + rip loss + lot count)"
```

---

## Task 18: Hooks — `lib/query/hooks/usePurchases.ts`

**Files:**
- Create: `lib/query/hooks/usePurchases.ts`

**Spec:** Section 7.

TanStack Query hooks for the purchases CRUD endpoints + sources picker. Centralizes invalidation so mutations refresh holdings + dashboard alongside the purchases list.

- [ ] **Step 1: Implement the hooks**

Create `lib/query/hooks/usePurchases.ts`:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PurchaseInput, PurchasePatch } from '@/lib/validation/purchase';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function usePurchases(catalogItemId?: number) {
  return useQuery({
    queryKey: ['purchases', catalogItemId ?? null],
    queryFn: async () => {
      const url = catalogItemId
        ? `/api/purchases?catalogItemId=${catalogItemId}`
        : '/api/purchases';
      const res = await fetch(url);
      return json<{ purchases: unknown[] }>(res);
    },
  });
}

export function usePurchaseSources() {
  return useQuery({
    queryKey: ['purchaseSources'],
    queryFn: async () => {
      const res = await fetch('/api/purchases/sources');
      return json<{ sources: string[] }>(res);
    },
  });
}

function invalidateAfterPurchaseMutation(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['purchases'] });
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['holding'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['purchaseSources'] });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PurchaseInput) => {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{ id: number }>(res);
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: PurchasePatch }) => {
      const res = await fetch(`/api/purchases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return json<{ id: number }>(res);
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/purchases/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      return json<{ error: string }>(res);
    },
    onSuccess: () => invalidateAfterPurchaseMutation(qc),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/query/hooks/usePurchases.ts
git commit -m "feat(hooks): add usePurchases + sources + create/update/delete mutations"
```

---

## Task 19: Hooks — `lib/query/hooks/useHoldings.ts`

**Files:**
- Create: `lib/query/hooks/useHoldings.ts`

- [ ] **Step 1: Implement the hooks**

Create `lib/query/hooks/useHoldings.ts`:

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import type { Holding } from '@/lib/services/holdings';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function useHoldings() {
  return useQuery({
    queryKey: ['holdings'],
    queryFn: async () => {
      const res = await fetch('/api/holdings');
      return json<{ holdings: Holding[] }>(res);
    },
  });
}

export type HoldingDetailDto = {
  item: {
    id: number;
    kind: 'sealed' | 'card';
    name: string;
    setName: string | null;
    productType: string | null;
    cardNumber: string | null;
    rarity: string | null;
    variant: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    msrpCents: number | null;
  };
  holding: Holding;
  lots: Array<{
    lot: {
      id: number;
      catalogItemId: number;
      purchaseDate: string;
      quantity: number;
      costCents: number;
      condition: string | null;
      isGraded: boolean;
      gradingCompany: string | null;
      grade: string | null;
      certNumber: string | null;
      source: string | null;
      location: string | null;
      notes: string | null;
      sourceRipId: number | null;
      createdAt: string;
    };
    sourceRip: { id: number; ripDate: string; sourcePurchaseId: number } | null;
    sourcePack: { catalogItemId: number; name: string } | null;
  }>;
  rips: Array<{
    id: number;
    ripDate: string;
    packCostCents: number;
    realizedLossCents: number;
    keptCardCount: number;
    sourcePurchaseId: number;
    notes: string | null;
  }>;
};

export function useHolding(catalogItemId: number) {
  return useQuery({
    queryKey: ['holding', catalogItemId],
    queryFn: async () => {
      const res = await fetch(`/api/holdings/${catalogItemId}`);
      return json<HoldingDetailDto>(res);
    },
    enabled: Number.isFinite(catalogItemId),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/query/hooks/useHoldings.ts
git commit -m "feat(hooks): add useHoldings + useHolding(catalogItemId)"
```

---

## Task 20: Hooks — `lib/query/hooks/useRips.ts`

**Files:**
- Create: `lib/query/hooks/useRips.ts`

- [ ] **Step 1: Implement the hooks**

Create `lib/query/hooks/useRips.ts`:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RipInput } from '@/lib/validation/rip';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function useRip(id: number | null) {
  return useQuery({
    queryKey: ['rip', id],
    queryFn: async () => {
      const res = await fetch(`/api/rips/${id}`);
      return json<unknown>(res);
    },
    enabled: id != null && Number.isFinite(id),
  });
}

function invalidateAfterRipMutation(
  qc: ReturnType<typeof useQueryClient>,
  affectedCatalogIds: number[]
) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['rips'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateRip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: RipInput & {
        // Caller passes the source pack's catalog id + each kept card's catalog
        // id so we can invalidate the right per-item holding caches.
        _sourceCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _, ...body } = payload;
      const res = await fetch('/api/rips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{ rip: { id: number }; keptPurchases: unknown[] }>(res);
    },
    onSuccess: (_data, variables) => {
      const affected = [
        variables._sourceCatalogItemId,
        ...variables.keptCards.map((k) => k.catalogItemId),
      ];
      invalidateAfterRipMutation(qc, affected);
    },
  });
}

export function useDeleteRip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      affectedCatalogItemIds,
    }: {
      id: number;
      affectedCatalogItemIds: number[];
    }) => {
      const res = await fetch(`/api/rips/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterRipMutation(qc, variables.affectedCatalogItemIds);
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/query/hooks/useRips.ts
git commit -m "feat(hooks): add useRip + useCreateRip + useDeleteRip with precise invalidation"
```

---

## Task 21: Hooks — `lib/query/hooks/useDashboardTotals.ts`

**Files:**
- Create: `lib/query/hooks/useDashboardTotals.ts`

- [ ] **Step 1: Implement the hook**

Create `lib/query/hooks/useDashboardTotals.ts`:

```ts
'use client';
import { useQuery } from '@tanstack/react-query';

export type DashboardTotals = {
  totalInvestedCents: number;
  totalRipLossCents: number;
  lotCount: number;
};

export function useDashboardTotals() {
  return useQuery({
    queryKey: ['dashboardTotals'],
    queryFn: async (): Promise<DashboardTotals> => {
      const res = await fetch('/api/dashboard/totals');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/query/hooks/useDashboardTotals.ts
git commit -m "feat(hooks): add useDashboardTotals"
```

---

## Task 22: Component — `<QuantityStepper>` (TDD with happy-dom)

**Files:**
- Create: `components/purchases/QuantityStepper.tsx`
- Create: `components/purchases/QuantityStepper.test.tsx`

**Spec:** Section 6.2.

- [ ] **Step 1: Write the failing test**

Create `components/purchases/QuantityStepper.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuantityStepper } from './QuantityStepper';

describe('<QuantityStepper>', () => {
  it('renders the current value', () => {
    render(<QuantityStepper value={3} onChange={() => {}} />);
    expect(screen.getByLabelText('Quantity')).toHaveTextContent('3');
  });

  it('increments via the + button', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /increase/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('decrements via the − button', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={5} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /decrease/i }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('disables − at min (default 1)', () => {
    render(<QuantityStepper value={1} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
  });

  it('respects custom min', () => {
    render(<QuantityStepper value={3} min={3} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled();
  });

  it('disables + at max', () => {
    render(<QuantityStepper value={5} max={5} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /increase/i })).toBeDisabled();
  });
});
```

Install `@testing-library/user-event` if missing:

```bash
npm install --save-dev @testing-library/user-event
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- components/purchases/QuantityStepper.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/purchases/QuantityStepper.tsx`:

```tsx
'use client';
import { Minus, Plus } from 'lucide-react';

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max != null ? Math.min(max, value + 1) : value + 1);
  const decDisabled = value <= min;
  const incDisabled = max != null && value >= max;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-background px-1.5 py-1">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={dec}
        disabled={decDisabled}
        className="grid size-7 place-items-center rounded-full hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="size-4" />
      </button>
      <span aria-label="Quantity" className="min-w-[1.5ch] text-center text-sm tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={inc}
        disabled={incDisabled}
        className="grid size-7 place-items-center rounded-full hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- components/purchases/QuantityStepper.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/purchases/QuantityStepper.tsx components/purchases/QuantityStepper.test.tsx package.json package-lock.json
git commit -m "feat(components): add QuantityStepper (Collectr-style +/- pill)"
```

---

## Task 23: Component — `<SourceChipPicker>` (TDD with happy-dom)

**Files:**
- Create: `components/purchases/SourceChipPicker.tsx`
- Create: `components/purchases/SourceChipPicker.test.tsx`

**Spec:** Section 6.2.

- [ ] **Step 1: Write the failing test**

Create `components/purchases/SourceChipPicker.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceChipPicker } from './SourceChipPicker';

describe('<SourceChipPicker>', () => {
  it('renders chip suggestions', () => {
    render(
      <SourceChipPicker
        value={null}
        onChange={() => {}}
        suggestions={['Walmart vending', 'Target', 'Costco']}
      />
    );
    expect(screen.getByRole('button', { name: 'Walmart vending' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Target' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Costco' })).toBeInTheDocument();
  });

  it('clicking a chip sets the value', async () => {
    const onChange = vi.fn();
    render(
      <SourceChipPicker
        value={null}
        onChange={onChange}
        suggestions={['Walmart vending']}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Walmart vending' }));
    expect(onChange).toHaveBeenCalledWith('Walmart vending');
  });

  it('marks the active chip', () => {
    render(
      <SourceChipPicker
        value="Target"
        onChange={() => {}}
        suggestions={['Walmart vending', 'Target']}
      />
    );
    const active = screen.getByRole('button', { name: 'Target' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
  });

  it('Other reveals a free-text input that updates value', async () => {
    const onChange = vi.fn();
    render(<SourceChipPicker value={null} onChange={onChange} suggestions={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /other/i }));
    const input = screen.getByPlaceholderText(/source/i);
    await userEvent.type(input, 'Sam Club');
    // onChange fires per keystroke (controlled input in parent).
    expect(onChange).toHaveBeenLastCalledWith('Sam Club');
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- components/purchases/SourceChipPicker.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `components/purchases/SourceChipPicker.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function SourceChipPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  suggestions: string[];
}) {
  const [otherActive, setOtherActive] = useState(
    () => value != null && !suggestions.includes(value)
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => {
          const active = value === s && !otherActive;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setOtherActive(false);
                onChange(s);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted'
              )}
            >
              {s}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={otherActive}
          onClick={() => {
            setOtherActive(true);
            // Don't clear existing value if user accidentally clicks Other.
          }}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            otherActive
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background hover:bg-muted'
          )}
        >
          + Other
        </button>
      </div>
      {otherActive && (
        <input
          type="text"
          placeholder="Source (e.g. Sam's Club)"
          value={value && !suggestions.includes(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          maxLength={120}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
```

The `cn` import path is `@/lib/utils` per the existing shadcn convention; it's already exported in this project (see `components/ui/button.tsx`).

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- components/purchases/SourceChipPicker.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/purchases/SourceChipPicker.tsx components/purchases/SourceChipPicker.test.tsx
git commit -m "feat(components): add SourceChipPicker (chips + Other free-text fallback)"
```

---

## Task 24: Component — `<PurchaseForm>`

**Files:**
- Create: `components/purchases/PurchaseForm.tsx`
- Create: `components/purchases/PurchaseForm.test.tsx`

**Spec:** Sections 5.1 (fields), 6.4 (layout), 8 (validation).

This is the big one. The form is shared between `/purchases/new`, `/purchases/[id]/edit`, and `<EditPurchaseDialog>` (Task 25). Card-only sections render conditionally. Rip-child rows lock the hard fields with an inline note.

- [ ] **Step 1: Implement the form**

Create `components/purchases/PurchaseForm.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { QuantityStepper } from './QuantityStepper';
import { SourceChipPicker } from './SourceChipPicker';
import { CONDITIONS, GRADING_COMPANIES } from '@/lib/validation/purchase';
import { usePurchaseSources } from '@/lib/query/hooks/usePurchases';

export type PurchaseFormCatalogItem = {
  id: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  productType: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  imageUrl: string | null;
  msrpCents: number | null;
  lastMarketCents: number | null;
};

export type PurchaseFormValues = {
  purchaseDate: string;
  quantity: number;
  costCents: number; // dollars on screen, cents on submit
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: (typeof CONDITIONS)[number] | null;
  isGraded: boolean;
  gradingCompany: (typeof GRADING_COMPANIES)[number] | null;
  grade: number | null;
  certNumber: string | null;
};

export type PurchaseFormProps = {
  mode: 'create' | 'edit';
  catalogItem: PurchaseFormCatalogItem;
  initialValues?: Partial<PurchaseFormValues> & { sourceRipId?: number | null };
  onSubmit: (values: PurchaseFormValues) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  submitting?: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

function defaultCostCents(item: PurchaseFormCatalogItem): number {
  if (item.msrpCents != null) return item.msrpCents;
  if (item.lastMarketCents != null) return item.lastMarketCents;
  return 0;
}

function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsStringToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  const dollars = parseFloat(cleaned);
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function PurchaseForm({
  mode,
  catalogItem,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitting,
}: PurchaseFormProps) {
  const isCard = catalogItem.kind === 'card';
  const isRipChild = (initialValues?.sourceRipId ?? null) != null;

  const sourcesQuery = usePurchaseSources();
  const sources = sourcesQuery.data?.sources ?? [];

  const [purchaseDate, setPurchaseDate] = useState(initialValues?.purchaseDate ?? today());
  const [quantity, setQuantity] = useState(initialValues?.quantity ?? 1);
  const [costInput, setCostInput] = useState(
    centsToDollarsString(initialValues?.costCents ?? defaultCostCents(catalogItem))
  );
  const [source, setSource] = useState<string | null>(initialValues?.source ?? null);
  const [location, setLocation] = useState<string | null>(initialValues?.location ?? null);
  const [notes, setNotes] = useState<string | null>(initialValues?.notes ?? null);
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number] | null>(
    isCard ? (initialValues?.condition ?? 'NM') : null
  );
  const [isGraded, setIsGraded] = useState(initialValues?.isGraded ?? false);
  const [gradingCompany, setGradingCompany] = useState<(typeof GRADING_COMPANIES)[number] | null>(
    initialValues?.gradingCompany ?? null
  );
  const [grade, setGrade] = useState<number | null>(initialValues?.grade ?? null);
  const [certNumber, setCertNumber] = useState<string | null>(initialValues?.certNumber ?? null);

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSubmit({
        purchaseDate,
        quantity,
        costCents: dollarsStringToCents(costInput),
        source,
        location,
        notes,
        condition,
        isGraded,
        gradingCompany: isGraded ? gradingCompany : null,
        grade: isGraded ? grade : null,
        certNumber: isGraded ? certNumber : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'submit failed');
    }
  };

  const lockedNote = isRipChild ? (
    <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      Locked because this card was pulled from a rip. Undo the rip to change cost basis.
    </p>
  ) : null;

  const labelClass = 'text-xs uppercase tracking-wide text-muted-foreground';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className={isCard ? 'aspect-[5/7] w-16 overflow-hidden rounded' : 'aspect-square w-16 overflow-hidden rounded'}>
          {catalogItem.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={catalogItem.imageUrl} alt={catalogItem.name} className="size-full object-contain" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="truncate text-sm font-semibold">{catalogItem.name}</div>
          {catalogItem.setName && <div className="truncate text-xs text-muted-foreground">{catalogItem.setName}</div>}
          <div className="text-xs text-muted-foreground">
            {isCard
              ? [catalogItem.rarity, catalogItem.cardNumber, catalogItem.variant].filter(Boolean).join(' · ')
              : (catalogItem.productType ?? 'Sealed')}
          </div>
        </div>
      </div>

      {isRipChild && lockedNote}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className={labelClass}>Date</span>
          <input
            type="date"
            value={purchaseDate}
            max={today()}
            onChange={(e) => setPurchaseDate(e.target.value)}
            disabled={isRipChild}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        <div className="space-y-1.5">
          <span className={labelClass}>Quantity</span>
          <div>
            <QuantityStepper
              value={quantity}
              min={1}
              onChange={setQuantity}
              max={isRipChild ? 1 : undefined}
            />
          </div>
        </div>
        <label className="space-y-1.5 md:col-span-2">
          <span className={labelClass}>Per-unit cost</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={costInput}
              onChange={(e) => setCostInput(e.target.value)}
              disabled={isRipChild}
              className="block w-full rounded-md border bg-background py-2 pl-7 pr-3 text-sm tabular-nums disabled:opacity-50"
            />
          </div>
        </label>
      </div>

      <div className="space-y-1.5">
        <span className={labelClass}>Source</span>
        <SourceChipPicker value={source} onChange={setSource} suggestions={sources} />
      </div>

      <label className="block space-y-1.5">
        <span className={labelClass}>Location (optional)</span>
        <input
          type="text"
          value={location ?? ''}
          onChange={(e) => setLocation(e.target.value === '' ? null : e.target.value)}
          maxLength={120}
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1.5">
        <span className={labelClass}>Notes (optional)</span>
        <textarea
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value === '' ? null : e.target.value)}
          maxLength={1000}
          rows={3}
          className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>

      {isCard && (
        <div className="space-y-4 border-t pt-6">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Card details</div>

          <label className="block space-y-1.5">
            <span className={labelClass}>Condition</span>
            <Select value={condition ?? 'NM'} onValueChange={(v) => setCondition(v as typeof CONDITIONS[number])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isGraded}
              onChange={(e) => setIsGraded(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm">This is graded</span>
          </label>

          {isGraded && (
            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className={labelClass}>Grading company</span>
                <Select
                  value={gradingCompany ?? ''}
                  onValueChange={(v) => setGradingCompany(v as typeof GRADING_COMPANIES[number])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADING_COMPANIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Grade</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="10"
                  value={grade ?? ''}
                  onChange={(e) => setGrade(e.target.value === '' ? null : Number(e.target.value))}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Cert number</span>
                <input
                  type="text"
                  value={certNumber ?? ''}
                  onChange={(e) => setCertNumber(e.target.value === '' ? null : e.target.value)}
                  maxLength={64}
                  className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitLabel ?? (mode === 'edit' ? 'Save' : 'Log purchase')}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write a happy-dom test for the kind-conditional render + rip-child lock**

Create `components/purchases/PurchaseForm.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PurchaseForm, type PurchaseFormCatalogItem } from './PurchaseForm';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const sealed: PurchaseFormCatalogItem = {
  id: 1,
  kind: 'sealed',
  name: 'SV151 ETB',
  setName: 'SV151',
  productType: 'ETB',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  msrpCents: 5000,
  lastMarketCents: 6000,
};

const card: PurchaseFormCatalogItem = {
  id: 2,
  kind: 'card',
  name: 'Pikachu ex',
  setName: 'AH',
  productType: null,
  cardNumber: '276/217',
  rarity: 'SIR',
  variant: 'special_illustration_rare',
  imageUrl: null,
  msrpCents: null,
  lastMarketCents: 117087,
};

describe('<PurchaseForm>', () => {
  it('hides Card details for sealed kind', () => {
    wrap(<PurchaseForm mode="create" catalogItem={sealed} onSubmit={vi.fn()} />);
    expect(screen.queryByText(/card details/i)).not.toBeInTheDocument();
  });

  it('shows Card details for card kind', () => {
    wrap(<PurchaseForm mode="create" catalogItem={card} onSubmit={vi.fn()} />);
    expect(screen.getByText(/card details/i)).toBeInTheDocument();
  });

  it('disables hard fields when initialValues.sourceRipId is set', () => {
    wrap(
      <PurchaseForm
        mode="edit"
        catalogItem={card}
        initialValues={{ sourceRipId: 99, costCents: 500, quantity: 1 }}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByText(/locked because this card was pulled from a rip/i)).toBeInTheDocument();
    // Date input is disabled.
    const dateInput = screen.getByDisplayValue(new Date().toISOString().slice(0, 10));
    expect(dateInput).toBeDisabled();
  });

  it('defaults cost to MSRP for sealed when no initialValues', () => {
    wrap(<PurchaseForm mode="create" catalogItem={sealed} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('50.00')).toBeInTheDocument();
  });

  it('defaults cost to last_market_cents for card when no MSRP', () => {
    wrap(<PurchaseForm mode="create" catalogItem={card} onSubmit={vi.fn()} />);
    expect(screen.getByDisplayValue('1170.87')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test — expect pass**

```bash
npm test -- components/purchases/PurchaseForm.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/purchases/PurchaseForm.tsx components/purchases/PurchaseForm.test.tsx
git commit -m "feat(components): add PurchaseForm (kind-aware, rip-child lock, MSRP-first default)"
```

---

## Task 25: Component — `<EditPurchaseDialog>`

**Files:**
- Create: `components/purchases/EditPurchaseDialog.tsx`

**Spec:** Section 6.2.

Wraps `<PurchaseForm mode='edit'>` in a shadcn Dialog. Submits via `useUpdatePurchase`.

- [ ] **Step 1: Implement the dialog**

Create `components/purchases/EditPurchaseDialog.tsx`:

```tsx
'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from './PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';

export type EditableLot = {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  sourceRipId: number | null;
};

export function EditPurchaseDialog({
  open,
  onOpenChange,
  catalogItem,
  lot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItem: PurchaseFormCatalogItem;
  lot: EditableLot;
}) {
  const updateMutation = useUpdatePurchase();

  const initialValues = {
    purchaseDate: lot.purchaseDate,
    quantity: lot.quantity,
    costCents: lot.costCents,
    source: lot.source,
    location: lot.location,
    notes: lot.notes,
    condition: lot.condition as PurchaseFormValues['condition'],
    isGraded: lot.isGraded,
    gradingCompany: lot.gradingCompany as PurchaseFormValues['gradingCompany'],
    grade: lot.grade != null ? Number(lot.grade) : null,
    certNumber: lot.certNumber,
    sourceRipId: lot.sourceRipId,
  };

  const handleSubmit = async (values: PurchaseFormValues) => {
    await updateMutation.mutateAsync({
      id: lot.id,
      patch: {
        purchaseDate: values.purchaseDate,
        quantity: values.quantity,
        costCents: values.costCents,
        source: values.source,
        location: values.location,
        notes: values.notes,
        condition: values.condition,
        isGraded: values.isGraded,
        gradingCompany: values.gradingCompany,
        grade: values.grade,
        certNumber: values.certNumber,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit purchase</DialogTitle>
          <DialogDescription>
            {lot.sourceRipId != null
              ? 'This card was pulled from a rip; cost basis is locked.'
              : 'Update purchase details.'}
          </DialogDescription>
        </DialogHeader>
        <PurchaseForm
          mode="edit"
          catalogItem={catalogItem}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitting={updateMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/purchases/EditPurchaseDialog.tsx
git commit -m "feat(components): add EditPurchaseDialog (Dialog + PurchaseForm in edit mode)"
```

---

## Task 26: Component — `<LotRow>`

**Files:**
- Create: `components/purchases/LotRow.tsx`

**Spec:** Section 6.2.

Single row of the lot list. Date, qty, cost, source. If `sourceRipId` is set, shows a "From: pack · ripped DATE" subtitle. "..." overflow → Edit / Delete (and "Rip pack" on sealed lots — but the rip action is wired in Task 30 / Task 35).

- [ ] **Step 1: Implement the component**

Create `components/purchases/LotRow.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useDeletePurchase } from '@/lib/query/hooks/usePurchases';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type LotRowProps = {
  lot: EditableLot;
  catalogItem: PurchaseFormCatalogItem;
  sourcePack?: { catalogItemId: number; name: string } | null;
  sourceRip?: { id: number; ripDate: string } | null;
  /** Optional rip action; only rendered for sealed lots when caller passes a handler. */
  onRip?: (lot: EditableLot) => void;
};

export function LotRow({ lot, catalogItem, sourcePack, sourceRip, onRip }: LotRowProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const del = useDeletePurchase();

  const handleDelete = async () => {
    if (!confirm('Soft-delete this lot? You can recover it from the database if needed.')) return;
    try {
      await del.mutateAsync(lot.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'delete failed';
      alert(message);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="tabular-nums">{lot.purchaseDate}</span>
            <span className="text-muted-foreground">·</span>
            <span>
              {lot.quantity} × {formatCents(lot.costCents)}
            </span>
            {lot.source && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="truncate text-muted-foreground">{lot.source}</span>
              </>
            )}
          </div>
          {sourceRip && sourcePack && (
            <div className="text-xs text-muted-foreground">
              From:{' '}
              <Link
                href={`/holdings/${sourcePack.catalogItemId}`}
                className="underline hover:text-foreground"
              >
                {sourcePack.name}
              </Link>{' '}
              · ripped {sourceRip.ripDate}
            </div>
          )}
          {lot.isGraded && (
            <div className="text-xs text-muted-foreground">
              Graded · {lot.gradingCompany} {lot.grade}
              {lot.certNumber && ` · ${lot.certNumber}`}
            </div>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Lot actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-40 rounded-md border bg-popover p-1 text-sm shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
              >
                Edit
              </button>
              {onRip && catalogItem.kind === 'sealed' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRip(lot);
                  }}
                  className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                >
                  Rip pack
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleDelete();
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <EditPurchaseDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        catalogItem={catalogItem}
        lot={lot}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/purchases/LotRow.tsx
git commit -m "feat(components): add LotRow with overflow menu (edit/delete/rip)"
```

---

## Task 27: Component — `<DashboardTotalsCard>`

**Files:**
- Create: `components/dashboard/DashboardTotalsCard.tsx`

**Spec:** Section 6.2.

- [ ] **Step 1: Implement the component**

Create `components/dashboard/DashboardTotalsCard.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Total invested</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.lotCount === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total invested</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCents(data.totalInvestedCents)}
        </div>
        <div className="text-xs text-muted-foreground">
          {data.lotCount} lot{data.lotCount === 1 ? '' : 's'} · realized rip P&amp;L:{' '}
          <span className={data.totalRipLossCents > 0 ? 'text-destructive' : 'text-foreground'}>
            {data.totalRipLossCents > 0 ? '-' : data.totalRipLossCents < 0 ? '+' : ''}
            {formatCents(Math.abs(data.totalRipLossCents))}
          </span>
        </div>
        <Link href="/holdings" className="text-sm underline">
          View holdings
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/DashboardTotalsCard.tsx
git commit -m "feat(components): add DashboardTotalsCard (invested + rip P&L summary)"
```

---

## Task 28: Component — `<RipPackDialog>` (TDD with happy-dom)

**Files:**
- Create: `components/rips/RipPackDialog.tsx`
- Create: `components/rips/RipPackDialog.test.tsx`

**Spec:** Section 6.2.

This is the trickiest component — it has live cost-basis math (default = pack_cost / N, recomputed on add/remove, but NOT recomputed when the user manually edits a cell). Test the math behavior thoroughly.

- [ ] **Step 1: Write the failing test**

Create `components/rips/RipPackDialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RipPackDialog } from './RipPackDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const pack = {
  purchaseId: 10,
  catalogItemId: 1,
  name: 'SV151 Booster Pack',
  imageUrl: null,
  packCostCents: 500,
};

describe('<RipPackDialog> — bulk-loss math', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows full pack cost as bulk loss when no kept cards', () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => []}
      />
    );
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$5.00');
  });

  it('flips bulk loss to $0 when one card absorbs full pack cost', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
        ]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'pikachu');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$0.00');
  });

  it('even-splits pack cost across two cards by default', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async (q) => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
          { catalogItemId: 100, name: 'Charizard ex', imageUrl: null },
        ]}
      />
    );
    const search = screen.getByPlaceholderText(/search/i);
    await userEvent.type(search, 'p');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    await userEvent.click(await screen.findByRole('button', { name: /charizard ex/i }));
    const inputs = screen.getAllByLabelText(/cost/i);
    expect(inputs[0]).toHaveValue('2.50');
    expect(inputs[1]).toHaveValue('2.50');
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$0.00');
  });

  it('does not auto-resplit when user manually edits a cell', async () => {
    wrap(
      <RipPackDialog
        open
        onOpenChange={() => {}}
        pack={pack}
        searchCard={async () => [
          { catalogItemId: 99, name: 'Pikachu ex', imageUrl: null },
          { catalogItemId: 100, name: 'Charizard ex', imageUrl: null },
        ]}
      />
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'p');
    await userEvent.click(await screen.findByRole('button', { name: /pikachu ex/i }));
    await userEvent.click(await screen.findByRole('button', { name: /charizard ex/i }));
    const inputs = screen.getAllByLabelText(/cost/i);
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], '4.00');
    // Card #2 should NOT auto-update.
    expect(inputs[1]).toHaveValue('2.50');
    // Bulk loss = 5.00 - 4.00 - 2.50 = -1.50 (gain)
    expect(screen.getByTestId('bulk-loss')).toHaveTextContent('$1.50');
    expect(screen.getByTestId('bulk-loss-label')).toHaveTextContent(/gain/i);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- components/rips/RipPackDialog.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

Create `components/rips/RipPackDialog.tsx`:

```tsx
'use client';
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateRip } from '@/lib/query/hooks/useRips';

export type RipPackSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
  packCostCents: number;
};

export type RipKeptDraft = {
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
  costCentsInput: string; // dollars-as-string
  manuallyEdited: boolean;
};

export type CardSearchHit = {
  catalogItemId: number;
  name: string;
  imageUrl: string | null;
};

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formatSignedCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function RipPackDialog({
  open,
  onOpenChange,
  pack,
  searchCard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: RipPackSourceLot;
  /**
   * Async search helper that returns card-kind catalog hits. The route or
   * caller decides; this keeps the dialog testable without coupling it to a
   * specific search endpoint.
   */
  searchCard: (q: string) => Promise<CardSearchHit[]>;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [kept, setKept] = useState<RipKeptDraft[]>([]);
  const [notes, setNotes] = useState('');
  const createMutation = useCreateRip();
  const [error, setError] = useState<string | null>(null);

  const totalKeptCents = useMemo(
    () => kept.reduce((acc, k) => acc + dollarsToCents(k.costCentsInput), 0),
    [kept]
  );
  const bulkLossCents = pack.packCostCents - totalKeptCents;
  const bulkLossLabel =
    bulkLossCents > 0 ? 'Bulk loss' : bulkLossCents < 0 ? 'Bulk gain' : 'Clean transfer';
  const bulkLossColor =
    bulkLossCents > 0 ? 'text-destructive' : bulkLossCents < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground';

  const onSearchInput = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      setHits(await searchCard(q));
    } finally {
      setSearching(false);
    }
  };

  const addKept = (hit: CardSearchHit) => {
    if (kept.some((k) => k.catalogItemId === hit.catalogItemId)) return;
    setKept((prev) => {
      const next = [
        ...prev,
        {
          catalogItemId: hit.catalogItemId,
          name: hit.name,
          imageUrl: hit.imageUrl,
          costCentsInput: '0',
          manuallyEdited: false,
        },
      ];
      return rebalanceDefaults(next, pack.packCostCents);
    });
  };

  const removeKept = (catalogItemId: number) => {
    setKept((prev) => {
      const remaining = prev.filter((k) => k.catalogItemId !== catalogItemId);
      return rebalanceDefaults(remaining, pack.packCostCents);
    });
  };

  const updateCostInput = (catalogItemId: number, value: string) => {
    setKept((prev) =>
      prev.map((k) =>
        k.catalogItemId === catalogItemId
          ? { ...k, costCentsInput: value, manuallyEdited: true }
          : k
      )
    );
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: pack.purchaseId,
        notes: notes || null,
        keptCards: kept.map((k) => ({
          catalogItemId: k.catalogItemId,
          costCents: dollarsToCents(k.costCentsInput),
        })),
        _sourceCatalogItemId: pack.catalogItemId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'rip create failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rip pack</DialogTitle>
          <DialogDescription>
            Pack cost: ${centsToDollars(pack.packCostCents)}. Add the cards you kept; any cost not transferred becomes realized rip loss.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="aspect-square w-12 overflow-hidden rounded bg-muted">
            {pack.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pack.imageUrl} alt={pack.name} className="size-full object-contain" />
            )}
          </div>
          <div className="flex-1 text-sm font-medium">{pack.name}</div>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={query}
            onChange={(e) => void onSearchInput(e.target.value)}
            placeholder="Search cards to add"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          {hits.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
              {hits.map((h) => (
                <button
                  type="button"
                  key={h.catalogItemId}
                  onClick={() => addKept(h)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <div className="aspect-[5/7] w-8 overflow-hidden rounded bg-muted">
                    {h.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.imageUrl} alt={h.name} className="size-full object-contain" />
                    )}
                  </div>
                  <span>{h.name}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
        </div>

        <div className="space-y-2">
          {kept.map((k) => (
            <div key={k.catalogItemId} className="flex items-center gap-3 rounded-md border p-2">
              <div className="aspect-[5/7] w-10 overflow-hidden rounded bg-muted">
                {k.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={k.imageUrl} alt={k.name} className="size-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate">{k.name}</div>
              </div>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Cost</span>
                <span className="text-muted-foreground">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Cost for ${k.name}`}
                  value={k.costCentsInput}
                  onChange={(e) => updateCostInput(k.catalogItemId, e.target.value)}
                  className="w-20 rounded-md border bg-background px-2 py-1 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${k.name}`}
                onClick={() => removeKept(k.catalogItemId)}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span data-testid="bulk-loss-label" className="text-xs uppercase tracking-wide text-muted-foreground">
            {bulkLossLabel}
          </span>
          <span data-testid="bulk-loss" className={`text-base font-semibold tabular-nums ${bulkLossColor}`}>
            {bulkLossCents > 0 ? '-' : bulkLossCents < 0 ? '+' : ''}
            {formatSignedCents(bulkLossCents)}
          </span>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Notes (optional)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Saving…' : 'Save rip'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recompute even-split defaults for any kept rows where the user hasn't
 * manually overridden the cost. Manually-edited rows keep their values.
 */
function rebalanceDefaults(kept: RipKeptDraft[], packCostCents: number): RipKeptDraft[] {
  const editedSum = kept
    .filter((k) => k.manuallyEdited)
    .reduce((acc, k) => acc + dollarsToCents(k.costCentsInput), 0);
  const autoCount = kept.filter((k) => !k.manuallyEdited).length;
  if (autoCount === 0) return kept;
  const remaining = Math.max(0, packCostCents - editedSum);
  const perAuto = Math.round(remaining / autoCount);
  return kept.map((k) =>
    k.manuallyEdited ? k : { ...k, costCentsInput: centsToDollars(perAuto) }
  );
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- components/rips/RipPackDialog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/rips/RipPackDialog.tsx components/rips/RipPackDialog.test.tsx
git commit -m "feat(components): add RipPackDialog with live bulk-loss math + manual-edit lock"
```

---

## Task 29: Component — `<RipDetailDialog>`

**Files:**
- Create: `components/rips/RipDetailDialog.tsx`

**Spec:** Section 6.2.

Read-only view of a rip with an "Undo rip" button.

- [ ] **Step 1: Implement the dialog**

Create `components/rips/RipDetailDialog.tsx`:

```tsx
'use client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRip, useDeleteRip } from '@/lib/query/hooks/useRips';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type RipDetailResponse = {
  rip: {
    id: number;
    ripDate: string;
    packCostCents: number;
    realizedLossCents: number;
    notes: string | null;
  };
  sourcePurchase: { id: number; catalogItemId: number } | null;
  sourceCatalogItem: { id: number; name: string; imageUrl: string | null } | null;
  keptPurchases: Array<{
    purchase: { id: number; catalogItemId: number; costCents: number };
    catalogItem: { id: number; name: string; imageUrl: string | null } | null;
  }>;
};

export function RipDetailDialog({
  open,
  onOpenChange,
  ripId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ripId: number | null;
}) {
  const { data, isLoading } = useRip(ripId);
  const undoMutation = useDeleteRip();
  const detail = data as RipDetailResponse | undefined;

  const handleUndo = async () => {
    if (!detail) return;
    if (!confirm('Undo this rip? Kept cards will be soft-deleted and the pack qty will be re-credited.')) {
      return;
    }
    const affected = [
      ...(detail.sourceCatalogItem ? [detail.sourceCatalogItem.id] : []),
      ...detail.keptPurchases
        .map((k) => k.catalogItem?.id)
        .filter((id): id is number => id != null),
    ];
    try {
      await undoMutation.mutateAsync({ id: detail.rip.id, affectedCatalogItemIds: affected });
      onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo rip failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Rip details</DialogTitle>
          <DialogDescription>Review the rip, then optionally undo it.</DialogDescription>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Pack</div>
              <div className="font-medium">{detail.sourceCatalogItem?.name ?? '(deleted)'}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Ripped {detail.rip.ripDate} · Pack cost {formatCents(detail.rip.packCostCents)}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Kept cards ({detail.keptPurchases.length})
              </div>
              {detail.keptPurchases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No cards kept (full bulk write-off).</p>
              ) : (
                detail.keptPurchases.map((k) => (
                  <div key={k.purchase.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                    <div className="min-w-0 flex-1 truncate">{k.catalogItem?.name ?? '(deleted)'}</div>
                    <div className="tabular-nums">{formatCents(k.purchase.costCents)}</div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 text-sm">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Realized rip{' '}
                {detail.rip.realizedLossCents > 0
                  ? 'loss'
                  : detail.rip.realizedLossCents < 0
                    ? 'gain'
                    : 'P&L'}
              </span>
              <span
                className={`tabular-nums font-semibold ${detail.rip.realizedLossCents > 0 ? 'text-destructive' : detail.rip.realizedLossCents < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
              >
                {detail.rip.realizedLossCents > 0
                  ? '-'
                  : detail.rip.realizedLossCents < 0
                    ? '+'
                    : ''}
                {formatCents(detail.rip.realizedLossCents)}
              </span>
            </div>

            {detail.rip.notes && (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                <div className="whitespace-pre-wrap">{detail.rip.notes}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleUndo}
            disabled={undoMutation.isPending || !detail}
          >
            {undoMutation.isPending ? 'Undoing…' : 'Undo rip'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/rips/RipDetailDialog.tsx
git commit -m "feat(components): add RipDetailDialog (read-only view + undo rip)"
```

---

## Task 30: Component — `<RipRow>`

**Files:**
- Create: `components/rips/RipRow.tsx`

**Spec:** Section 6.2 (RipRow), 6.4 (sealed lot detail).

A row in a sealed lot's detail view. Shows rip date, kept count, signed realized loss, "..." menu → View / Undo.

- [ ] **Step 1: Implement the component**

Create `components/rips/RipRow.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { MoreHorizontal, ScissorsLineDashed } from 'lucide-react';
import { RipDetailDialog } from './RipDetailDialog';
import { useDeleteRip } from '@/lib/query/hooks/useRips';

function formatSigned(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (cents > 0) return `-$${abs}`;
  if (cents < 0) return `+$${abs}`;
  return `$${abs}`;
}

export type RipRowProps = {
  rip: {
    id: number;
    ripDate: string;
    realizedLossCents: number;
    keptCardCount: number;
  };
  affectedCatalogItemIds: number[];
};

export function RipRow({ rip, affectedCatalogItemIds }: RipRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const undoMutation = useDeleteRip();

  const handleUndo = async () => {
    if (!confirm('Undo this rip?')) return;
    try {
      await undoMutation.mutateAsync({ id: rip.id, affectedCatalogItemIds });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo rip failed');
    }
  };

  const lossClass =
    rip.realizedLossCents > 0
      ? 'text-destructive'
      : rip.realizedLossCents < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-muted">
            <ScissorsLineDashed className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm">
              Ripped {rip.ripDate}{' '}
              <span className="text-muted-foreground">
                · {rip.keptCardCount} kept
              </span>
            </div>
          </div>
        </div>
        <div className={`text-sm font-semibold tabular-nums ${lossClass}`}>
          {formatSigned(rip.realizedLossCents)}
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Rip actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-36 rounded-md border bg-popover p-1 text-sm shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setDetailOpen(true);
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
              >
                View rip
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void handleUndo();
                }}
                className="block w-full rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
              >
                Undo rip
              </button>
            </div>
          )}
        </div>
      </div>
      <RipDetailDialog open={detailOpen} onOpenChange={setDetailOpen} ripId={rip.id} />
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/rips/RipRow.tsx
git commit -m "feat(components): add RipRow with view/undo actions"
```

---

## Task 31: Tweak — `<QuickAddButton>` drops `fallbackCents` prop

**Files:**
- Modify: `components/catalog/QuickAddButton.tsx`
- Modify: `components/catalog/SearchResultRow.tsx`

**Spec:** Section 5.1 (last paragraph), Section 6.2.

Per spec: "After this plan, `QuickAddButton` sends `{ catalogItemId, quantity: 1 }` only — no costCents, no source. The server runs the MSRP-first resolution chain." This fixes the latent bug where sealed quick-adds were recording `last_market_cents` as cost basis.

- [ ] **Step 1: Update `QuickAddButton.tsx`**

Replace the contents of `components/catalog/QuickAddButton.tsx` with:

```tsx
'use client';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

export function QuickAddButton({ catalogItemId }: { catalogItemId: number }) {
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogItemId, quantity: 1 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `add failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Added to portfolio');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <button
      type="button"
      aria-label="Add to portfolio"
      onClick={() => mutate()}
      disabled={isPending}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-foreground text-background transition hover:bg-foreground/90 disabled:opacity-50"
    >
      {isPending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
        </svg>
      ) : (
        <span className="text-lg leading-none">+</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Update `SearchResultRow.tsx` to drop `fallbackCents` prop**

Open `components/catalog/SearchResultRow.tsx` and change the QuickAddButton invocation. The line currently reads:

```tsx
<QuickAddButton catalogItemId={row.catalogItemId} fallbackCents={row.marketCents} />
```

Change it to:

```tsx
<QuickAddButton catalogItemId={row.catalogItemId} />
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual smoke**

`npm run dev`. Search for a sealed item with a known MSRP (e.g., a current ETB). Click the "+" button. Verify in Drizzle Studio that the new purchase row's `cost_cents` matches MSRP, not last_market_cents.

- [ ] **Step 5: Commit**

```bash
git add components/catalog/QuickAddButton.tsx components/catalog/SearchResultRow.tsx
git commit -m "fix(catalog): drop fallbackCents from QuickAdd; server resolves MSRP-first"
```

---

## Task 32: Page — `/purchases/new` (replace stub with real form)

**Files:**
- Modify: `app/(authenticated)/purchases/new/page.tsx`
- Create: `app/(authenticated)/purchases/new/NewPurchaseClient.tsx`

**Spec:** Section 6.1.

The route is a server component that loads the catalog item and renders a client island. Without `?catalogItemId`, it tells the user to start from `/catalog`.

- [ ] **Step 1: Create the client island**

Create `app/(authenticated)/purchases/new/NewPurchaseClient.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from '@/components/purchases/PurchaseForm';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';

export function NewPurchaseClient({ catalogItem }: { catalogItem: PurchaseFormCatalogItem }) {
  const router = useRouter();
  const createMutation = useCreatePurchase();

  const handleSubmit = async (values: PurchaseFormValues) => {
    await createMutation.mutateAsync({
      catalogItemId: catalogItem.id,
      purchaseDate: values.purchaseDate,
      quantity: values.quantity,
      costCents: values.costCents,
      source: values.source,
      location: values.location,
      notes: values.notes,
      condition: values.condition,
      isGraded: values.isGraded,
      gradingCompany: values.gradingCompany,
      grade: values.grade,
      certNumber: values.certNumber,
    });
    router.push(`/holdings/${catalogItem.id}`);
  };

  return (
    <PurchaseForm
      mode="create"
      catalogItem={catalogItem}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={createMutation.isPending}
    />
  );
}
```

- [ ] **Step 2: Replace the page server component**

Replace the contents of `app/(authenticated)/purchases/new/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { NewPurchaseClient } from './NewPurchaseClient';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';

export default async function NewPurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ catalogItemId?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.catalogItemId;

  if (!idParam) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-12 space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Log a purchase</h1>
        <p className="text-sm text-muted-foreground">
          Start from a catalog item — search for what you bought, then click Log purchase.
        </p>
        <Link href="/catalog" className="inline-block text-sm underline">
          Go to search
        </Link>
      </div>
    );
  }

  const numericId = Number(idParam);
  if (!Number.isFinite(numericId)) {
    redirect('/catalog');
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    redirect('/catalog');
  }

  const catalogItem: PurchaseFormCatalogItem = {
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    lastMarketCents: item.lastMarketCents,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Log a purchase</h1>
      <NewPurchaseClient catalogItem={catalogItem} />
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

`npm run dev`. Sign in. Visit `/catalog/<some_id>`, click "Log purchase". Form loads with the catalog item's image, name, and the MSRP (or last_market_cents) pre-filled in the cost field. Submit — redirects to `/holdings/<id>`.

- [ ] **Step 4: Commit**

```bash
git add app/(authenticated)/purchases/new/page.tsx app/(authenticated)/purchases/new/NewPurchaseClient.tsx
git commit -m "feat(ui): /purchases/new renders real form (replaces Plan 2 stub)"
```

---

## Task 33: Page — `/purchases/[id]/edit`

**Files:**
- Create: `app/(authenticated)/purchases/[id]/edit/page.tsx`
- Create: `app/(authenticated)/purchases/[id]/edit/EditPurchaseClient.tsx`

**Spec:** Section 6.1 (deep-link fallback for the modal edit UX).

- [ ] **Step 1: Create the client island**

Create `app/(authenticated)/purchases/[id]/edit/EditPurchaseClient.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import {
  PurchaseForm,
  type PurchaseFormCatalogItem,
  type PurchaseFormValues,
} from '@/components/purchases/PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';

export function EditPurchaseClient({
  purchaseId,
  catalogItem,
  initialValues,
}: {
  purchaseId: number;
  catalogItem: PurchaseFormCatalogItem;
  initialValues: Partial<PurchaseFormValues> & { sourceRipId?: number | null };
}) {
  const router = useRouter();
  const updateMutation = useUpdatePurchase();

  const handleSubmit = async (values: PurchaseFormValues) => {
    await updateMutation.mutateAsync({
      id: purchaseId,
      patch: {
        purchaseDate: values.purchaseDate,
        quantity: values.quantity,
        costCents: values.costCents,
        source: values.source,
        location: values.location,
        notes: values.notes,
        condition: values.condition,
        isGraded: values.isGraded,
        gradingCompany: values.gradingCompany,
        grade: values.grade,
        certNumber: values.certNumber,
      },
    });
    router.push(`/holdings/${catalogItem.id}`);
  };

  return (
    <PurchaseForm
      mode="edit"
      catalogItem={catalogItem}
      initialValues={initialValues}
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
      submitting={updateMutation.isPending}
    />
  );
}
```

- [ ] **Step 2: Create the page server component**

Create `app/(authenticated)/purchases/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { EditPurchaseClient } from './EditPurchaseClient';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const lot = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, numericId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!lot || lot.deletedAt != null) notFound();

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, lot.catalogItemId),
  });
  if (!item) notFound();

  const catalogItem: PurchaseFormCatalogItem = {
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    lastMarketCents: item.lastMarketCents,
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit purchase</h1>
      <EditPurchaseClient
        purchaseId={numericId}
        catalogItem={catalogItem}
        initialValues={{
          purchaseDate: lot.purchaseDate,
          quantity: lot.quantity,
          costCents: lot.costCents,
          source: lot.source,
          location: lot.location,
          notes: lot.notes,
          condition: (lot.condition as PurchaseFormCatalogItem['kind'] extends 'card' ? string : null) as null,
          isGraded: lot.isGraded,
          gradingCompany: lot.gradingCompany as null,
          grade: lot.grade != null ? Number(lot.grade) : null,
          certNumber: lot.certNumber,
          sourceRipId: lot.sourceRipId ?? null,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

After Task 36 ships, navigate to a lot's edit page via `/purchases/<id>/edit`. Form loads pre-filled. For a rip child, hard fields are locked.

- [ ] **Step 4: Commit**

```bash
git add app/(authenticated)/purchases/[id]/edit/page.tsx app/(authenticated)/purchases/[id]/edit/EditPurchaseClient.tsx
git commit -m "feat(ui): /purchases/[id]/edit deep-link fallback for the edit modal"
```

---

## Task 34: Page — `/holdings` (Collectr-style grid)

**Files:**
- Modify: `app/(authenticated)/holdings/page.tsx`
- Create: `app/(authenticated)/holdings/HoldingsGrid.tsx`

**Spec:** Section 6.1, 6.2 (matches Collectr file4.png portfolio grid).

- [ ] **Step 1: Create the client grid**

Create `app/(authenticated)/holdings/HoldingsGrid.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import { getImageUrl } from '@/lib/utils/images';
import type { Holding } from '@/lib/services/holdings';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HoldingsGrid({ initialHoldings }: { initialHoldings: Holding[] }) {
  const { data } = useHoldings();
  const holdings = data?.holdings ?? initialHoldings;

  if (holdings.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No holdings yet. Search for a product and click "+" or "Log purchase" to start.
        </p>
        <Link href="/catalog" className="mt-3 inline-block text-sm underline">
          Go to search
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {holdings.map((h) => (
        <Link
          key={h.catalogItemId}
          href={`/holdings/${h.catalogItemId}`}
          className="group flex flex-col rounded-lg border bg-card p-3 transition hover:border-foreground/20"
        >
          <div
            className={
              h.kind === 'sealed'
                ? 'aspect-square w-full overflow-hidden rounded-md bg-muted'
                : 'aspect-[5/7] w-full overflow-hidden rounded-md bg-muted'
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl({
                imageStoragePath: h.imageStoragePath,
                imageUrl: h.imageUrl,
              })}
              alt={h.name}
              loading="lazy"
              className="size-full object-contain"
            />
          </div>
          <div className="mt-3 flex-1 space-y-1">
            <div className="line-clamp-2 text-sm font-semibold leading-tight">{h.name}</div>
            <div className="text-xs text-muted-foreground">{h.setName ?? '—'}</div>
            <div className="text-xs text-muted-foreground">
              {h.kind === 'sealed' ? h.productType ?? 'Sealed' : 'Card'}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-medium tabular-nums">Qty: {h.qtyHeld}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatCents(h.totalInvestedCents)}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace the holdings page**

Replace `app/(authenticated)/holdings/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HoldingsGrid } from './HoldingsGrid';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';

export default async function HoldingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: purchases } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents)'
    )
    .is('deleted_at', null);

  const { data: rips } = await supabase.from('rips').select('id, source_purchase_id');

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[]
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Holdings</h1>
      <HoldingsGrid initialHoldings={holdings} />
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

`npm run dev`. Sign in. Have at least 2 different catalog items as purchases. Visit `/holdings`. Grid renders 2-col mobile, 4-col desktop. Clicking a tile navigates to `/holdings/<id>` (built in Task 35).

- [ ] **Step 4: Commit**

```bash
git add app/(authenticated)/holdings/page.tsx app/(authenticated)/holdings/HoldingsGrid.tsx
git commit -m "feat(ui): /holdings grid (Collectr-style portfolio)"
```

---

## Task 35: Page — `/holdings/[catalogItemId]` (lot list + inline + + rip dialog)

**Files:**
- Create: `app/(authenticated)/holdings/[catalogItemId]/page.tsx`
- Create: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

**Spec:** Sections 6.1, 6.2, 6.3, 6.4.

The detail page composes `<LotRow>`, the inline "+" stepper, `<RipRow>` for sealed lots, and `<RipPackDialog>` opened from a pack lot's "..." menu.

- [ ] **Step 1: Create the client component**

Create `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { LotRow } from '@/components/purchases/LotRow';
import { RipRow } from '@/components/rips/RipRow';
import { RipPackDialog, type RipPackSourceLot, type CardSearchHit } from '@/components/rips/RipPackDialog';
import { useHolding, type HoldingDetailDto } from '@/lib/query/hooks/useHoldings';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';
import type { PurchaseFormCatalogItem } from '@/components/purchases/PurchaseForm';
import type { EditableLot } from '@/components/purchases/EditPurchaseDialog';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function defaultCardSearch(q: string): Promise<CardSearchHit[]> {
  if (!q.trim()) return [];
  const url = `/api/search?q=${encodeURIComponent(q)}&kind=cards`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: Array<{ catalogItemId?: number; name: string; imageUrl?: string | null }> };
  return (body.results ?? [])
    .filter((r) => r.catalogItemId != null)
    .map((r) => ({
      catalogItemId: r.catalogItemId as number,
      name: r.name,
      imageUrl: r.imageUrl ?? null,
    }));
}

export function HoldingDetailClient({
  catalogItemId,
  initial,
}: {
  catalogItemId: number;
  initial: HoldingDetailDto;
}) {
  const { data } = useHolding(catalogItemId);
  const detail = data ?? initial;
  const createMutation = useCreatePurchase();

  const [ripOpen, setRipOpen] = useState(false);
  const [ripPack, setRipPack] = useState<RipPackSourceLot | null>(null);

  const isSealed = detail.item.kind === 'sealed';
  const isCard = detail.item.kind === 'card';

  const catalogItem: PurchaseFormCatalogItem = {
    id: detail.item.id,
    kind: detail.item.kind,
    name: detail.item.name,
    setName: detail.item.setName,
    productType: detail.item.productType,
    cardNumber: detail.item.cardNumber,
    rarity: detail.item.rarity,
    variant: detail.item.variant,
    imageUrl: detail.item.imageUrl,
    msrpCents: detail.item.msrpCents,
    lastMarketCents: detail.item.lastMarketCents,
  };

  const handleQuickAdd = async () => {
    try {
      await createMutation.mutateAsync({
        catalogItemId,
        quantity: 1,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'add failed');
    }
  };

  const openRip = (lot: EditableLot) => {
    setRipPack({
      purchaseId: lot.id,
      catalogItemId: detail.item.id,
      name: detail.item.name,
      imageUrl: detail.item.imageUrl,
      packCostCents: lot.costCents,
    });
    setRipOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-sm text-muted-foreground">
            Qty held: <span className="font-semibold text-foreground tabular-nums">{detail.holding.qtyHeld}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Invested:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {formatCents(detail.holding.totalInvestedCents)}
            </span>
          </p>
        </div>
        <button
          type="button"
          aria-label="Add another"
          onClick={handleQuickAdd}
          disabled={createMutation.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-foreground px-3 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
        >
          <Plus className="size-4" />
          Add another
        </button>
      </div>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Lots</h2>
        {detail.lots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lots.</p>
        ) : (
          <div>
            {detail.lots.map(({ lot, sourceRip, sourcePack }) => {
              const editableLot: EditableLot = {
                id: lot.id,
                catalogItemId: lot.catalogItemId,
                purchaseDate: lot.purchaseDate,
                quantity: lot.quantity,
                costCents: lot.costCents,
                source: lot.source,
                location: lot.location,
                notes: lot.notes,
                condition: lot.condition,
                isGraded: lot.isGraded,
                gradingCompany: lot.gradingCompany,
                grade: lot.grade,
                certNumber: lot.certNumber,
                sourceRipId: lot.sourceRipId,
              };
              return (
                <LotRow
                  key={lot.id}
                  lot={editableLot}
                  catalogItem={catalogItem}
                  sourceRip={sourceRip}
                  sourcePack={sourcePack}
                  onRip={isSealed ? openRip : undefined}
                />
              );
            })}
          </div>
        )}
      </section>

      {isSealed && detail.rips.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">Rip history</h2>
          <div>
            {detail.rips.map((r) => (
              <RipRow
                key={r.id}
                rip={{
                  id: r.id,
                  ripDate: r.ripDate,
                  realizedLossCents: r.realizedLossCents,
                  keptCardCount: r.keptCardCount,
                }}
                affectedCatalogItemIds={[detail.item.id]}
              />
            ))}
          </div>
        </section>
      )}

      {ripPack && (
        <RipPackDialog
          open={ripOpen}
          onOpenChange={setRipOpen}
          pack={ripPack}
          searchCard={defaultCardSearch}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the page server component**

Create `app/(authenticated)/holdings/[catalogItemId]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { HoldingDetailClient } from './HoldingDetailClient';
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow } from '@/lib/services/holdings';
import type { HoldingDetailDto } from '@/lib/query/hooks/useHoldings';

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ catalogItemId: string }>;
}) {
  const { catalogItemId } = await params;
  const numericId = Number(catalogItemId);
  if (!Number.isFinite(numericId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) notFound();

  const lots = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.userId, user.id),
      eq(schema.purchases.catalogItemId, numericId),
      isNull(schema.purchases.deletedAt)
    ),
    orderBy: [asc(schema.purchases.purchaseDate), asc(schema.purchases.id)],
  });

  // Provenance for card lots.
  const sourceRipIds = lots.map((l) => l.sourceRipId).filter((v): v is number => v != null);
  const sourceRips = sourceRipIds.length
    ? await db.query.rips.findMany({ where: inArray(schema.rips.id, sourceRipIds) })
    : [];
  const ripById = new Map(sourceRips.map((r) => [r.id, r]));
  const sourcePackPurchaseIds = sourceRips.map((r) => r.sourcePurchaseId);
  const sourcePackPurchases = sourcePackPurchaseIds.length
    ? await db.query.purchases.findMany({ where: inArray(schema.purchases.id, sourcePackPurchaseIds) })
    : [];
  const sourcePackByPurchaseId = new Map(sourcePackPurchases.map((p) => [p.id, p]));
  const sourcePackCatalogIds = sourcePackPurchases.map((p) => p.catalogItemId);
  const sourcePackCatalogs = sourcePackCatalogIds.length
    ? await db.query.catalogItems.findMany({ where: inArray(schema.catalogItems.id, sourcePackCatalogIds) })
    : [];
  const sourcePackCatalogById = new Map(sourcePackCatalogs.map((c) => [c.id, c]));

  // Rips for sealed.
  const lotIds = lots.map((l) => l.id);
  const ripsForSealed =
    item.kind === 'sealed' && lotIds.length
      ? await db.query.rips.findMany({ where: inArray(schema.rips.sourcePurchaseId, lotIds) })
      : [];
  const keptChildren = ripsForSealed.length
    ? await db.query.purchases.findMany({
        where: and(
          inArray(schema.purchases.sourceRipId, ripsForSealed.map((r) => r.id)),
          isNull(schema.purchases.deletedAt)
        ),
      })
    : [];
  const keptCountByRipId = keptChildren.reduce<Map<number, number>>((acc, p) => {
    acc.set(p.sourceRipId!, (acc.get(p.sourceRipId!) ?? 0) + 1);
    return acc;
  }, new Map());

  // Rollup.
  const rawPurchases: RawPurchaseRow[] = lots.map((l) => ({
    id: l.id,
    catalog_item_id: l.catalogItemId,
    quantity: l.quantity,
    cost_cents: l.costCents,
    deleted_at: l.deletedAt ? l.deletedAt.toISOString() : null,
    created_at: l.createdAt.toISOString(),
    catalog_item: {
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      set_name: item.setName,
      product_type: item.productType,
      image_url: item.imageUrl,
      image_storage_path: item.imageStoragePath,
      last_market_cents: item.lastMarketCents,
    },
  }));
  const rawRips: RawRipRow[] = ripsForSealed.map((r) => ({
    id: r.id,
    source_purchase_id: r.sourcePurchaseId,
  }));
  const [holding] = aggregateHoldings(rawPurchases, rawRips);

  const initial: HoldingDetailDto = {
    item: {
      id: item.id,
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      cardNumber: item.cardNumber,
      rarity: item.rarity,
      variant: item.variant,
      imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      msrpCents: item.msrpCents,
    },
    holding: holding ?? {
      catalogItemId: item.id,
      kind: item.kind as 'sealed' | 'card',
      name: item.name,
      setName: item.setName,
      productType: item.productType,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      lastMarketCents: item.lastMarketCents,
      qtyHeld: 0,
      totalInvestedCents: 0,
    },
    lots: lots.map((l) => {
      const sourceRip = l.sourceRipId != null ? ripById.get(l.sourceRipId) ?? null : null;
      const sourcePackPurchase = sourceRip
        ? sourcePackByPurchaseId.get(sourceRip.sourcePurchaseId) ?? null
        : null;
      const sourcePackCatalog = sourcePackPurchase
        ? sourcePackCatalogById.get(sourcePackPurchase.catalogItemId) ?? null
        : null;
      return {
        lot: {
          id: l.id,
          catalogItemId: l.catalogItemId,
          purchaseDate: l.purchaseDate,
          quantity: l.quantity,
          costCents: l.costCents,
          condition: l.condition,
          isGraded: l.isGraded,
          gradingCompany: l.gradingCompany,
          grade: l.grade,
          certNumber: l.certNumber,
          source: l.source,
          location: l.location,
          notes: l.notes,
          sourceRipId: l.sourceRipId,
          createdAt: l.createdAt.toISOString(),
        },
        sourceRip: sourceRip
          ? { id: sourceRip.id, ripDate: sourceRip.ripDate, sourcePurchaseId: sourceRip.sourcePurchaseId }
          : null,
        sourcePack: sourcePackCatalog
          ? { catalogItemId: sourcePackCatalog.id, name: sourcePackCatalog.name }
          : null,
      };
    }),
    rips:
      item.kind === 'sealed'
        ? ripsForSealed.map((r) => ({
            id: r.id,
            ripDate: r.ripDate,
            packCostCents: r.packCostCents,
            realizedLossCents: r.realizedLossCents,
            keptCardCount: keptCountByRipId.get(r.id) ?? 0,
            sourcePurchaseId: r.sourcePurchaseId,
            notes: r.notes,
          }))
        : [],
  };

  const isCard = item.kind === 'card';

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <div
          className={
            isCard
              ? 'aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted'
              : 'aspect-square w-full overflow-hidden rounded-lg bg-muted'
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={initial.item.imageUrl ?? ''} alt={item.name} className="size-full object-contain" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
          {item.setName && <p className="text-sm text-muted-foreground">{item.setName}</p>}
          <p className="text-sm text-muted-foreground">
            {isCard
              ? [item.rarity, item.cardNumber, item.variant].filter(Boolean).join(' · ')
              : item.productType ?? 'Sealed'}
          </p>
          {item.lastMarketCents != null && (
            <p className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
              Latest market price
            </p>
          )}
          {item.lastMarketCents != null && (
            <p className="text-2xl font-semibold tabular-nums">
              ${(item.lastMarketCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      </div>

      <HoldingDetailClient catalogItemId={numericId} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 3: Manual smoke**

`npm run dev`. Visit `/holdings/<id>` for a sealed item with quantity. The lot list renders with the "..." menu showing Edit / Rip pack / Delete. Click "Add another" — qty increases. Click "Rip pack" — dialog opens with bulk-loss math live. Add a kept card, edit costs, save. Verify the rip appears in the rip history section.

- [ ] **Step 4: Commit**

```bash
git add app/(authenticated)/holdings/[catalogItemId]/page.tsx app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx
git commit -m "feat(ui): /holdings/[id] lot list + inline + + rip pack dialog + rip history"
```

---

## Task 36: Page — `/` dashboard with `<DashboardTotalsCard>`

**Files:**
- Modify: `app/(authenticated)/page.tsx`

**Spec:** Section 6.1 (dashboard tile when lotCount > 0).

- [ ] **Step 1: Replace the page**

Replace `app/(authenticated)/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { DashboardTotalsCard } from '@/components/dashboard/DashboardTotalsCard';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { count } = await supabase
    .from('purchases')
    .select('id', { head: true, count: 'exact' })
    .is('deleted_at', null);
  const hasLots = (count ?? 0) > 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>

      {hasLots ? (
        <DashboardTotalsCard />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>You haven&apos;t added anything yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add your first sealed product or card to start tracking your portfolio.
            </p>
            <Link href="/catalog" className={buttonVariants({ variant: 'default', size: 'lg' })}>
              Add your first product
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke**

`npm run dev`. With 0 purchases: empty-state CTA shows. After adding one purchase: Dashboard Totals card replaces the CTA.

- [ ] **Step 3: Commit**

```bash
git add app/(authenticated)/page.tsx
git commit -m "feat(ui): swap dashboard empty state for DashboardTotalsCard when lots > 0"
```

---

## Task 37: Final integration smoke + plan-complete commit

**Files:** none (verification only)

**Spec:** all sections.

End-to-end smoke checklist. Run each, confirm, then make a final empty commit marking the plan complete.

- [ ] **Step 1: Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. Summary should show validation, services, and component tests all green.

- [ ] **Step 3: End-to-end smoke in dev**

`npm run dev`. Sign in. Walk this checklist:

1. **Catalog → quick-add path (sealed):** Search a sealed item with known MSRP. Click "+". Verify in `/holdings` that the new tile appears with `Qty: 1` and cost = MSRP (not market price). Confirm the bug-fix from Task 31 holds.
2. **Form-driven new purchase:** From a catalog detail page, click "Log purchase". Fill in date, custom cost, source, location, notes. Submit. Lands on `/holdings/<id>` with the lot visible.
3. **Edit a lot via modal:** On `/holdings/<id>`, click "..." on a lot row → Edit. Change notes, save. Modal closes, row updates.
4. **Soft-delete a lot:** On `/holdings/<id>`, click "..." → Delete. Confirm. Row disappears. Verify in Drizzle Studio that the row's `deleted_at` is set, not removed.
5. **Holdings grid:** Visit `/holdings`. Tiles render. Click a tile → drills into detail.
6. **Dashboard tile:** Visit `/`. With at least one lot, DashboardTotalsCard shows total invested + lot count + rip P&L.
7. **Rip happy path (N=1):** From a sealed lot's "..." → Rip pack. Add one card. Set its cost to the pack cost. Save. Bulk loss reads $0. New card lot appears in the kept card's `/holdings/<card_id>` page with the "From: pack · ripped DATE" subtitle. Pack lot's qty is reduced by 1.
8. **Rip happy path (N=0 bulk write-off):** Open another pack lot. Submit the rip dialog with no kept cards. Bulk loss equals pack cost. The pack lot's qty drops by 1. The dashboard's rip P&L tile reflects the new realized loss.
9. **Rip with overflow ($100 card from $5 pack):** Open a pack with cost $5. Add one card and set its cost to $100. Bulk loss reads `+$95.00` in green. Save. Dashboard rip P&L drops by $95 (negative = gain).
10. **Edit a rip-child purchase:** On the kept card's `/holdings/<card_id>`, click "..." → Edit on the rip-child lot. Hard fields (cost, qty, date) are disabled with the lock note. Soft fields (notes, condition) are editable.
11. **Delete a ripped pack purchase:** Try to soft-delete a pack purchase that's been ripped. Server returns 409 with the ripIds. UI surfaces the error.
12. **Undo rip:** From the sealed pack's `/holdings/<pack_id>`, scroll to Rip history. Click "..." on a rip → Undo rip. Confirm. The rip row disappears, the pack qty is re-credited, and the kept card's lot is gone from `/holdings/<card_id>` (soft-deleted).

If any check fails, fix the offending task and re-run.

- [ ] **Step 4: Final commit**

```bash
git commit --allow-empty -m "feat: ship Plan 3 (Purchases + Pack Ripping)"
```

- [ ] **Step 5: Update project memory**

Update `C:\Users\Michael\.claude\projects\C--Users-Michael-Documents-Claude-Pokemon-Portfolio\memory\project_state.md`:

Change the Plan structure section so:
- Plan 3 (Purchases) is marked as ✅ shipped 2026-04-26.
- Add a brief acceptance note like "Plan 3 acceptance: full purchase CRUD, /holdings + /holdings/[id], rip flow with N=0 to god-pack, rip-child immutability, soft-delete, dashboard total invested + rip P&L tile."

Update the "How to apply" footer: "Plan 3 done. Next step on resume is writing Plan 4 (P&L + Dashboard) — brainstorm first to scope unrealized P&L computation, top movers, time-window filters, then writing-plans, then subagent-driven-development."

Commit the memory update separately if memory is under git (it is not by default; `.claude/` is gitignored — just save the file).

---

## Plan Self-Review

After writing the full plan, this section captures the self-review pass per the writing-plans skill.

### Spec coverage

- Section 4.1 (purchases.deleted_at) → Task 2
- Section 4.2 (rips table + source_rip_id) → Task 3
- Section 4.3 (RLS for rips) → Task 4
- Section 5.1 (POST /api/purchases) → Task 11
- Section 5.2 (PATCH /api/purchases/[id]) → Task 12
- Section 5.3 (DELETE /api/purchases/[id]) → Task 12
- Section 5.4 (GET sources) → Task 10
- Section 5.5 (GET /api/holdings, GET /api/holdings/[id]) → Tasks 15, 16
- Section 5.6 (GET /api/dashboard/totals) → Task 17
- Section 5.7 (POST /api/rips) → Task 13
- Section 5.8 (GET /api/rips/[id]) → Task 14
- Section 5.9 (DELETE /api/rips/[id] undo) → Task 14
- Section 6.1 routes → Tasks 32-36
- Section 6.2 components → Tasks 22-31
- Section 6.3 inline + stepper → Task 35
- Section 6.4 sealed lot detail → Task 35
- Section 6.4 form layout → Task 24
- Section 7 hooks → Tasks 18-21
- Section 8 validation → Tasks 5, 6
- Section 9 error codes → exercised in Tasks 11, 12, 13, 14
- Section 10.1 unit tests → Tasks 5, 6, 7, 8, 22, 23
- Section 10.2 API tests → covered as manual smoke per task and Task 37 step 3 (real-DB integration tests deferred to Plan 6 polish, per the brainstorming acknowledgment that current test infra doesn't have a Supabase local test DB)
- Section 10.3 component tests → Tasks 22, 23, 24, 28
- Section 11.1 migrations → Tasks 2, 3, 4
- Section 11.3 transactional create choice → Task 13 (option b: Drizzle transaction with manual auth)

### Type consistency

- `Holding` type defined in Task 8 (`lib/services/holdings.ts`); imported in Task 19 (`useHoldings`) and used by `HoldingsGrid` (Task 34). ✓
- `PurchaseInput`, `PurchasePatch`, `HARD_FIELDS_FOR_RIP_CHILDREN`, `CONDITIONS`, `GRADING_COMPANIES` defined in Task 5; imported in Tasks 6, 11, 12, 24. ✓
- `PurchaseFormCatalogItem`, `PurchaseFormValues` defined in Task 24; imported in Tasks 25, 32, 33, 35. ✓
- `EditableLot` defined in Task 25; imported in Tasks 26, 35. ✓
- `RipPackSourceLot`, `CardSearchHit` defined in Task 28; imported in Task 35. ✓
- `HoldingDetailDto` defined in Task 19 and used in Task 35. ✓
- `computeRealizedLoss`, `resolveCostBasis` defined in Task 7; imported in Tasks 11, 13. ✓

### Placeholders

None. All steps include concrete code or commands.

### Scope check

The plan stays focused on purchases + ripping. The dashboard tile is a small slice (one component + one route + one server-side rollup), not a full Plan 4 implementation. Holdings list is Collectr-style but with `qty_held` + `total_invested` only — no P&L (deferred to Plan 4 per spec Section 2). No backwards-compatibility shims since Plan 1 schema is fresh.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-04-26-pokestonks-purchases.md`.

## Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan with this many independent tasks; the per-task isolation reduces blast radius if a single task goes sideways.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review. Lower context overhead between tasks but slower because each task waits for review.

Which approach?
TODO Plan 6 polish: scripts/migrate-rls.ts has no idempotency tracking, re-runs fail. Add a _rls_migrations meta table.
