# Pokestonks Plan 3.5 — Box Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two-layer ripping. Open a sealed multi-pack container (Booster Box, ETB, Tin, etc.) into a single pack purchase row with `quantity = pack_count` and per-pack cost basis split from the source. Plan 3's existing rip flow then handles ripping individual packs into kept cards.

**Architecture:** Mirror Plan 3's rip patterns. New `box_decompositions` table parallel to `rips`. New `source_decomposition_id` column on `purchases` parallel to `source_rip_id`. New `<OpenBoxDialog>` parallel to `<RipPackDialog>` (much simpler — no card search, no per-child editing). The qty-consumption logic (`quantity - count(rips) - count(decompositions)`) extends to subtract both event types.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (service-role + manual auth), Supabase Postgres + Auth + Storage, TanStack Query 5, shadcn/ui 4.x base-ui, Zod 4, Vitest 4 with per-file `// @vitest-environment happy-dom` directive.

**Spec reference:** `docs/superpowers/specs/2026-04-27-pokestonks-box-decomposition-design.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
lib/
├── db/
│   └── schema/
│       ├── catalogItems.ts              # MODIFIED: add packCount field
│       ├── purchases.ts                 # MODIFIED: add sourceDecompositionId field
│       ├── boxDecompositions.ts         # CREATED
│       └── index.ts                     # MODIFIED: re-export boxDecompositions
├── validation/
│   ├── purchase.ts                      # MODIFIED: rename HARD_FIELDS_FOR_RIP_CHILDREN → HARD_FIELDS_FOR_DERIVED_CHILDREN
│   ├── decomposition.ts                 # CREATED
│   └── decomposition.test.ts            # CREATED
├── services/
│   ├── tcgcsv.ts                        # MODIFIED: add PACK_COUNT_BY_PRODUCT_TYPE map + populate packCount on upsert
│   ├── holdings.ts                      # MODIFIED: aggregateHoldings third arg (decompositions); subtract from sealed qty
│   ├── holdings.test.ts                 # MODIFIED: tests for the new arg
│   ├── decompositions.ts                # CREATED (computePerPackCost)
│   └── decompositions.test.ts           # CREATED
├── query/hooks/
│   └── useDecompositions.ts             # CREATED

app/api/
├── purchases/
│   └── [id]/route.ts                    # MODIFIED: PATCH checks sourceDecompositionId; DELETE adds 409 for decompositions
├── decompositions/
│   ├── route.ts                         # CREATED: POST
│   └── [id]/route.ts                    # CREATED: GET + DELETE (undo)
└── holdings/
    ├── route.ts                         # MODIFIED: fetch decompositions, pass to aggregateHoldings
    └── [catalogItemId]/route.ts         # MODIFIED: include decompositions array + sourceDecomposition/sourceContainer provenance

app/(authenticated)/holdings/[catalogItemId]/
├── page.tsx                             # MODIFIED: fetch decompositions, build new HoldingDetailDto fields
└── HoldingDetailClient.tsx              # MODIFIED: openBox state + dialog + decomposition history section

components/
├── purchases/
│   └── LotRow.tsx                       # MODIFIED: onOpenBox prop, "Open box" menu item, sourceDecomposition provenance subtitle
└── decompositions/
    ├── OpenBoxDialog.tsx                # CREATED
    ├── OpenBoxDialog.test.tsx           # CREATED (happy-dom)
    ├── OpenBoxDetailDialog.tsx          # CREATED
    └── DecompositionRow.tsx             # CREATED

drizzle/
├── 0006_*.sql                           # GENERATED + manually edited to add seed UPDATEs
└── 0007_*.sql                           # GENERATED

supabase/migrations/
└── 20260427000000_box_decompositions_rls.sql  # CREATED
```

**Boundaries enforced:**
- `lib/validation/decomposition.ts` — pure Zod schema, no DB or HTTP. Reusable from API + dialog.
- `lib/services/decompositions.ts` — pure functions (`computePerPackCost`). Tested in isolation.
- `lib/services/holdings.ts` — extended pure aggregation. Decomposition consumption is a reading concern, not a writing concern.
- `app/api/decompositions/*` — orchestrate auth → validate → Drizzle transaction. No business math; delegate to services.
- `lib/query/hooks/useDecompositions.ts` — TanStack hooks. No raw `fetch` in components.
- `components/decompositions/*` — presentational + form state. Mutations come from hooks.

---

## Task 1: Migration 0006 — `add_catalog_items_pack_count`

**Files:**
- Modify: `lib/db/schema/catalogItems.ts`
- Generate: `drizzle/0006_*.sql` (then hand-edit to add seed UPDATE statements)

**Spec:** Section 4.1.

- [ ] **Step 1: Add `packCount` to the Drizzle schema**

Open `lib/db/schema/catalogItems.ts`. Add `packCount` next to the existing fields. Keep all other fields, indexes, and constraints intact. The full file should look like:

```ts
import { pgTable, bigserial, text, integer, date, timestamp, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
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
    lastMarketCents: integer('last_market_cents'),
    lastMarketAt: timestamp('last_market_at', { withTimezone: true }),
    packCount: integer('pack_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindSetCodeIdx: index('catalog_items_kind_set_code_idx').on(t.kind, t.setCode),
    nameSearchIdx: index('catalog_items_name_search_idx').using('gin', sql`to_tsvector('english', ${t.name})`),
    cardNumberIdx: index('catalog_items_card_number_idx').on(t.cardNumber).where(sql`${t.kind} = 'card'`),
    cardUniqueIdx: uniqueIndex('catalog_items_card_unique_idx')
      .on(t.setCode, t.cardNumber, t.variant)
      .where(sql`${t.kind} = 'card'`),
  })
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
```

- [ ] **Step 2: Generate the Drizzle migration**

```bash
npm run db:generate
```

Expected: `drizzle/0006_*.sql` is created, containing exactly:

```sql
ALTER TABLE "catalog_items" ADD COLUMN "pack_count" integer;
```

If the diff shows other changes, abort and reconcile.

- [ ] **Step 3: Hand-edit the migration to add the seed UPDATE statements**

Open the generated `drizzle/0006_*.sql` and append the UPDATE statements after the existing `ALTER TABLE`. Use Drizzle's `--> statement-breakpoint` separators between statements:

```sql
ALTER TABLE "catalog_items" ADD COLUMN "pack_count" integer;--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 36 WHERE "product_type" = 'Booster Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'Booster Bundle';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 9  WHERE "product_type" = 'Elite Trainer Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Build & Battle';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'Premium Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 6  WHERE "product_type" = 'ex Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Tin';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Pin Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Collection Box';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 4  WHERE "product_type" = 'Collection';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 3  WHERE "product_type" = 'Blister';--> statement-breakpoint
UPDATE "catalog_items" SET "pack_count" = 1  WHERE "product_type" = 'Booster Pack';
```

- [ ] **Step 4: Apply the migration**

```bash
npm run db:migrate
```

Expected: prints "applied migration 0006_*" or "migrations applied successfully!". No errors.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit + push**

```bash
git add lib/db/schema/catalogItems.ts drizzle/0006_*.sql drizzle/meta/_journal.json drizzle/meta/0006_*.json
git commit -m "feat(db): add catalog_items.pack_count + seed from product_type map"
git push origin main
```

---

## Task 2: Populate `packCount` on TCGCSV catalog import

**Files:**
- Modify: `lib/services/tcgcsv.ts`

**Spec:** Section 4.1 last paragraph ("future TCGCSV imports populate this column the same way").

The migration seeded existing rows. New rows inserted on next catalog import need `packCount` populated too.

- [ ] **Step 1: Add the product_type → packCount map next to `SEALED_PATTERNS`**

Open `lib/services/tcgcsv.ts`. Find the existing `SEALED_PATTERNS` array (~line 78-93). Above it (or directly below it), add:

```ts
export const PACK_COUNT_BY_PRODUCT_TYPE: Record<string, number | null> = {
  'Booster Box': 36,
  'Booster Bundle': 6,
  'Elite Trainer Box': 9,
  'Build & Battle': 4,
  'Premium Collection': 6,
  'ex Box': 6,
  'Tin': 3,
  'Pin Collection': 3,
  'Collection Box': 4,
  'Collection': 4,
  'Blister': 3,
  'Booster Pack': 1,
};
```

- [ ] **Step 2: Find the upsert path that writes new catalog rows**

Find the place(s) in `tcgcsv.ts` where new `catalog_items` rows are inserted/upserted. Read the surrounding code so you know what to add. There's an upsert for sealed products that uses the `productType` classification result.

- [ ] **Step 3: Set `packCount` on the upsert**

In the upsert call(s) where a sealed catalog row is being created or updated, add `packCount: PACK_COUNT_BY_PRODUCT_TYPE[productType] ?? null` to the values object. Keep the change minimal — only touch the upsert object.

If `tcgcsv.ts` has more than one upsert path for sealed items, set `packCount` in each.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. Existing search tests should not regress.

- [ ] **Step 6: Commit + push**

```bash
git add lib/services/tcgcsv.ts
git commit -m "feat(catalog): populate pack_count on sealed product imports"
git push origin main
```

---

## Task 3: Migration 0007 schema — `boxDecompositions` table + `purchases.sourceDecompositionId`

**Files:**
- Create: `lib/db/schema/boxDecompositions.ts`
- Modify: `lib/db/schema/purchases.ts`
- Modify: `lib/db/schema/index.ts`

**Spec:** Section 4.2.

This task only updates the Drizzle schema. The migration file is generated in Task 4.

- [ ] **Step 1: Create the boxDecompositions schema**

Create `lib/db/schema/boxDecompositions.ts`:

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

export const boxDecompositions = pgTable(
  'box_decompositions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
      .notNull()
      .references(() => purchases.id),
    decomposeDate: date('decompose_date').notNull(),
    sourceCostCents: integer('source_cost_cents').notNull(),
    packCount: integer('pack_count').notNull(),
    perPackCostCents: integer('per_pack_cost_cents').notNull(),
    roundingResidualCents: integer('rounding_residual_cents').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateIdx: index('box_decompositions_user_date_idx').on(t.userId, t.decomposeDate),
    sourcePurchaseIdx: index('box_decompositions_source_purchase_idx').on(t.sourcePurchaseId),
    sourceCostCheck: check('box_decompositions_source_cost_nonneg', sql`${t.sourceCostCents} >= 0`),
    packCountCheck: check('box_decompositions_pack_count_positive', sql`${t.packCount} > 0`),
    perPackCheck: check('box_decompositions_per_pack_nonneg', sql`${t.perPackCostCents} >= 0`),
  })
);

export type BoxDecomposition = typeof boxDecompositions.$inferSelect;
export type NewBoxDecomposition = typeof boxDecompositions.$inferInsert;
```

- [ ] **Step 2: Add `sourceDecompositionId` to the purchases schema**

Open `lib/db/schema/purchases.ts`. Add `sourceDecompositionId` next to `sourceRipId`. Add a partial index for it. Keep everything else intact.

The new `sourceDecompositionId` line, placed right after `sourceRipId`:

```ts
sourceDecompositionId: bigint('source_decomposition_id', { mode: 'number' }),
```

(No `.references()` call — same workaround as `sourceRipId` from Plan 3 fix `f121161`. The DB-level FK is added by the migration in Task 4.)

The new index, placed right after `sourceRipIdx`:

```ts
sourceDecompositionIdx: index('purchases_source_decomp_idx')
  .on(t.sourceDecompositionId)
  .where(sql`${t.sourceDecompositionId} IS NOT NULL`),
```

- [ ] **Step 3: Re-export from schema index**

Open `lib/db/schema/index.ts`. Add the re-export at the bottom:

```ts
export * from './profiles';
export * from './catalogItems';
export * from './marketPrices';
export * from './purchases';
export * from './sales';
export * from './userGradedValues';
export * from './refreshRuns';
export * from './rips';
export * from './boxDecompositions';
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. The boxDecompositions module imports `purchases` (lazy via `references(() => purchases.id)`) and purchases.ts no longer imports boxDecompositions, so no circular type cycle.

- [ ] **Step 5: Commit + push**

```bash
git add lib/db/schema/boxDecompositions.ts lib/db/schema/purchases.ts lib/db/schema/index.ts
git commit -m "feat(db): add boxDecompositions schema + purchases.sourceDecompositionId"
git push origin main
```

---

## Task 4: Generate + apply migration 0007

**Files:**
- Generate: `drizzle/0007_*.sql`

- [ ] **Step 1: Generate the migration**

```bash
npm run db:generate
```

Expected: `drizzle/0007_*.sql` is created. Open it and verify:
- `CREATE TABLE "box_decompositions" ...` with all columns and three CHECK constraints (`source_cost_nonneg`, `pack_count_positive`, `per_pack_nonneg`)
- `ALTER TABLE "purchases" ADD COLUMN "source_decomposition_id" bigint`
- FK constraint from `box_decompositions.source_purchase_id` to `purchases.id`
- Indexes `box_decompositions_user_date_idx`, `box_decompositions_source_purchase_idx`, `purchases_source_decomp_idx` (the last with WHERE clause)

If anything is missing or extra, abort and reconcile.

Note: the FK from `purchases.source_decomposition_id` to `box_decompositions.id` is NOT in this Drizzle migration because we omitted `.references()` on the schema. We add it in Task 5 via the Supabase RLS migration to keep the type cycle workaround.

- [ ] **Step 2: Apply the migration**

```bash
npm run db:migrate
```

Expected: prints "applied migration 0007_*" or "migrations applied successfully!". No errors.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit + push**

```bash
git add drizzle/0007_*.sql drizzle/meta/_journal.json drizzle/meta/0007_*.json
git commit -m "feat(db): create box_decompositions table + purchases.source_decomposition_id"
git push origin main
```

---

## Task 5: Supabase RLS migration — `box_decompositions` policy + auth.users FK + back-FK

**Files:**
- Create: `supabase/migrations/20260427000000_box_decompositions_rls.sql`

**Spec:** Section 4.3.

We add three things in this manual SQL migration:
1. `auth.users` FK on `box_decompositions.user_id` (Drizzle can't see the auth schema)
2. RLS enable + `"own decompositions"` policy
3. The back-FK from `purchases.source_decomposition_id` to `box_decompositions.id` (omitted from Drizzle to dodge the type cycle)

- [ ] **Step 1: Create the SQL migration**

Create `supabase/migrations/20260427000000_box_decompositions_rls.sql`:

```sql
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
```

- [ ] **Step 2: Apply directly via the postgres client**

`scripts/migrate-rls.ts` lacks idempotency tracking and would fail re-applying earlier migrations. Use the same workaround Plan 3 Task 4 used: read `DATABASE_URL_DIRECT` from `.env.local` and run the SQL via the postgres-js client.

The simplest way: write a one-shot tsx script. Create `scripts/apply-decomp-rls.ts`:

```ts
import 'dotenv/config';
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_DIRECT or DATABASE_URL must be set');
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  const file = 'supabase/migrations/20260427000000_box_decompositions_rls.sql';
  const content = readFileSync(file, 'utf-8');
  await sql.unsafe(content);
  console.log(`applied ${file}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Then run it:

```bash
npx tsx scripts/apply-decomp-rls.ts
```

Expected: prints `applied supabase/migrations/20260427000000_box_decompositions_rls.sql`. No errors.

If the FK constraint already exists (because you re-ran), Postgres errors with "constraint already exists". That's fine — investigate but don't worry about it for the first run. The script is one-shot.

- [ ] **Step 3: Smoke-test the policy**

Run via the same `psql` connection or via Supabase Studio:

```sql
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'box_decompositions'::regclass;
```

Expected: one row with `polname = 'own decompositions'` and `polcmd = '*'`.

If you can't easily query, trust the script's success.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 6: Delete the one-shot script**

```bash
rm scripts/apply-decomp-rls.ts
```

We don't want this file in the repo long-term.

- [ ] **Step 7: Commit + push**

```bash
git add supabase/migrations/20260427000000_box_decompositions_rls.sql
git commit -m "feat(db): add RLS 'own decompositions' policy + auth.users FK + back-FK"
git push origin main
```

---

## Task 6: Validation — `lib/validation/decomposition.ts` (TDD)

**Files:**
- Create: `lib/validation/decomposition.ts`
- Create: `lib/validation/decomposition.test.ts`

**Spec:** Section 7.

- [ ] **Step 1: Write the failing test**

Create `lib/validation/decomposition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decompositionInputSchema } from './decomposition';

describe('decompositionInputSchema', () => {
  const minimal = { sourcePurchaseId: 1 };

  it('accepts a minimal payload', () => {
    const r = decompositionInputSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it('rejects missing sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects negative sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({ sourcePurchaseId: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer sourcePurchaseId', () => {
    const r = decompositionInputSchema.safeParse({ sourcePurchaseId: 1.5 });
    expect(r.success).toBe(false);
  });

  it('accepts ISO date today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: today });
    expect(r.success).toBe(true);
  });

  it('rejects future decomposeDate', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: future });
    expect(r.success).toBe(false);
  });

  it('rejects malformed decomposeDate', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, decomposeDate: '2026/04/27' });
    expect(r.success).toBe(false);
  });

  it('accepts notes up to 1000 chars', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1000) });
    expect(r.success).toBe(true);
  });

  it('rejects oversized notes', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: 'x'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('accepts null notes', () => {
    const r = decompositionInputSchema.safeParse({ ...minimal, notes: null });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/validation/decomposition.test.ts
```

Expected: FAIL with "Cannot find module './decomposition'".

- [ ] **Step 3: Implement the schema**

Create `lib/validation/decomposition.ts`:

```ts
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const decompositionInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  decomposeDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type DecompositionInput = z.infer<typeof decompositionInputSchema>;
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/validation/decomposition.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit + push**

```bash
git add lib/validation/decomposition.ts lib/validation/decomposition.test.ts
git commit -m "feat(validation): add decomposition Zod schema"
git push origin main
```

---

## Task 7: Service — `lib/services/decompositions.ts` (`computePerPackCost`, TDD)

**Files:**
- Create: `lib/services/decompositions.ts`
- Create: `lib/services/decompositions.test.ts`

**Spec:** Section 5.4.

- [ ] **Step 1: Write the failing test**

Create `lib/services/decompositions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePerPackCost } from './decompositions';

describe('computePerPackCost', () => {
  it('splits $50 across 9 packs with rounding residual', () => {
    // 5000 / 9 = 555.56 → rounds to 556. 556 × 9 = 5004. residual = 5000 - 5004 = -4.
    expect(computePerPackCost(5000, 9)).toEqual({
      perPackCostCents: 556,
      roundingResidualCents: -4,
    });
  });

  it('handles zero source cost', () => {
    expect(computePerPackCost(0, 9)).toEqual({
      perPackCostCents: 0,
      roundingResidualCents: 0,
    });
  });

  it('single pack returns full cost with zero residual', () => {
    expect(computePerPackCost(500, 1)).toEqual({
      perPackCostCents: 500,
      roundingResidualCents: 0,
    });
  });

  it('clean even split has zero residual', () => {
    // 555 / 5 = 111 exactly.
    expect(computePerPackCost(555, 5)).toEqual({
      perPackCostCents: 111,
      roundingResidualCents: 0,
    });
  });

  it('rounds down with positive residual when exact midpoint', () => {
    // 100 / 3 = 33.33 → rounds to 33. 33 × 3 = 99. residual = 100 - 99 = 1.
    expect(computePerPackCost(100, 3)).toEqual({
      perPackCostCents: 33,
      roundingResidualCents: 1,
    });
  });

  it('Booster Box example: $108 across 36 packs', () => {
    // 10800 / 36 = 300 exactly.
    expect(computePerPackCost(10800, 36)).toEqual({
      perPackCostCents: 300,
      roundingResidualCents: 0,
    });
  });

  it('Tin example: $20 across 3 packs', () => {
    // 2000 / 3 = 666.67 → 667. 667 × 3 = 2001. residual = 2000 - 2001 = -1.
    expect(computePerPackCost(2000, 3)).toEqual({
      perPackCostCents: 667,
      roundingResidualCents: -1,
    });
  });

  it('throws on packCount = 0', () => {
    expect(() => computePerPackCost(500, 0)).toThrow('packCount must be > 0');
  });

  it('throws on negative packCount', () => {
    expect(() => computePerPackCost(500, -1)).toThrow('packCount must be > 0');
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- lib/services/decompositions.test.ts
```

Expected: FAIL with "Cannot find module './decompositions'".

- [ ] **Step 3: Implement the service**

Create `lib/services/decompositions.ts`:

```ts
/**
 * Pure functions for box decomposition math.
 * No DB or HTTP — safe to call from anywhere.
 */

/**
 * Split a source box's cost evenly across pack_count packs.
 *
 *   per_pack_cost   = round(source_cost / pack_count)
 *   rounding_residual = source_cost - per_pack_cost * pack_count
 *
 * Sign of residual: negative when rounding pushed the per-pack cost up
 * (we now overstate total by |residual| cents); positive when rounding
 * pushed it down (we understate total). Typically -9..+9 cents.
 *
 * Snapshotted on the box_decompositions row at decompose time.
 */
export function computePerPackCost(
  sourceCostCents: number,
  packCount: number
): { perPackCostCents: number; roundingResidualCents: number } {
  if (packCount <= 0) throw new Error('packCount must be > 0');
  const perPack = Math.round(sourceCostCents / packCount);
  const residual = sourceCostCents - perPack * packCount;
  return { perPackCostCents: perPack, roundingResidualCents: residual };
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm test -- lib/services/decompositions.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit + push**

```bash
git add lib/services/decompositions.ts lib/services/decompositions.test.ts
git commit -m "feat(services): add computePerPackCost pure function"
git push origin main
```

---

## Task 8: Extend `aggregateHoldings` to subtract decomposition consumption

**Files:**
- Modify: `lib/services/holdings.ts`
- Modify: `lib/services/holdings.test.ts`

**Spec:** Section 5.5 (extension to GET /api/holdings).

`aggregateHoldings` currently takes `(purchases, rips)` and subtracts rip count from sealed qty. We extend it to also subtract decomposition count.

- [ ] **Step 1: Add the new test cases**

Open `lib/services/holdings.test.ts`. Add tests for the new third argument near the existing rip tests. Find the existing test block:

```ts
describe('aggregateHoldings', () => {
  // ... existing tests
});
```

Add these new tests inside that block (after the existing tests):

```ts
it('subtracts decomposition counts from sealed qty', () => {
  const purchases = [makePurchase({ id: 20, catalog_item_id: 1, quantity: 3, cost_cents: 5000 })];
  const decompositions = [
    { id: 200, source_purchase_id: 20 },
    { id: 201, source_purchase_id: 20 },
  ];
  const result = aggregateHoldings(purchases, [], decompositions);
  expect(result[0].qtyHeld).toBe(1);
  expect(result[0].totalInvestedCents).toBe(5000);
});

it('subtracts both rips AND decompositions from same source', () => {
  const purchases = [makePurchase({ id: 30, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
  const rips = [{ id: 300, source_purchase_id: 30 }];
  const decompositions = [{ id: 400, source_purchase_id: 30 }, { id: 401, source_purchase_id: 30 }];
  const result = aggregateHoldings(purchases, rips, decompositions);
  expect(result[0].qtyHeld).toBe(2);
  expect(result[0].totalInvestedCents).toBe(10000);
});

it('orphan decomposition rows are ignored gracefully', () => {
  const purchases = [makePurchase({ id: 40, quantity: 1 })];
  const decompositions = [{ id: 999, source_purchase_id: 99999 }];
  const result = aggregateHoldings(purchases, [], decompositions);
  expect(result[0].qtyHeld).toBe(1);
});
```

Also update the existing test calls that use the 2-arg signature: change `aggregateHoldings(purchases, rips)` to `aggregateHoldings(purchases, rips, [])` everywhere they appear in the file. Use Find & Replace if your editor supports it.

- [ ] **Step 2: Export the `RawDecompositionRow` type and update the function signature**

Open `lib/services/holdings.ts`. Add the new type next to the existing `RawRipRow` type:

```ts
export type RawDecompositionRow = {
  id: number;
  source_purchase_id: number;
};
```

Update the function signature:

```ts
export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[],
  decompositions: readonly RawDecompositionRow[]
): Holding[] {
```

- [ ] **Step 3: Update the implementation to also count decompositions**

Inside `aggregateHoldings`, find the existing `rippedUnitsByPurchase` map. Add a parallel map for decompositions, or fold them into a single "consumed units" map. Cleanest is one map:

```ts
const consumedUnitsByPurchase = new Map<number, number>();
for (const r of rips) {
  consumedUnitsByPurchase.set(
    r.source_purchase_id,
    (consumedUnitsByPurchase.get(r.source_purchase_id) ?? 0) + 1
  );
}
for (const d of decompositions) {
  consumedUnitsByPurchase.set(
    d.source_purchase_id,
    (consumedUnitsByPurchase.get(d.source_purchase_id) ?? 0) + 1
  );
}
```

Rename the local variable from `rippedUnitsByPurchase` to `consumedUnitsByPurchase`. Find the usage further down:

```ts
const ripped = rippedUnitsByPurchase.get(p.id) ?? 0;
const remaining = p.quantity - ripped;
```

Change to:

```ts
const consumed = consumedUnitsByPurchase.get(p.id) ?? 0;
const remaining = p.quantity - consumed;
```

- [ ] **Step 4: Run the test**

```bash
npm test -- lib/services/holdings.test.ts
```

Expected: all tests pass (existing 8 + 3 new = 11).

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. Note this WILL flag callers of `aggregateHoldings` that still pass only 2 args (the two API routes that use this function). Step 6 fixes those.

- [ ] **Step 6: Update the two API route callers**

Open `app/api/holdings/route.ts`. Find the call to `aggregateHoldings`. Change from:

```ts
const holdings = aggregateHoldings(
  (purchases ?? []) as unknown as RawPurchaseRow[],
  (rips ?? []) as RawRipRow[]
);
```

To:

```ts
const { data: decompositions, error: dErr } = await supabase
  .from('box_decompositions')
  .select('id, source_purchase_id');
if (dErr) {
  return NextResponse.json({ error: dErr.message }, { status: 500 });
}

const holdings = aggregateHoldings(
  (purchases ?? []) as unknown as RawPurchaseRow[],
  (rips ?? []) as RawRipRow[],
  (decompositions ?? []) as RawDecompositionRow[]
);
```

Add `RawDecompositionRow` to the import line at the top:

```ts
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow } from '@/lib/services/holdings';
```

Open `app/(authenticated)/holdings/page.tsx` (the server page). It also calls `aggregateHoldings`. Apply the same change: fetch decompositions, pass as third arg, add the type import.

- [ ] **Step 7: Run tests + type-check**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean. All tests pass.

- [ ] **Step 8: Commit + push**

```bash
git add lib/services/holdings.ts lib/services/holdings.test.ts app/api/holdings/route.ts 'app/(authenticated)/holdings/page.tsx'
git commit -m "feat(services): aggregateHoldings subtracts decomposition consumption"
git push origin main
```

---

## Task 9: API — `POST /api/decompositions` (transactional create)

**Files:**
- Create: `app/api/decompositions/route.ts`

**Spec:** Section 5.1.

Mirror of Plan 3's `app/api/rips/route.ts` (commit `eea3a23`). Drizzle transaction with manual auth. Looks up the source purchase + catalog item + the corresponding Booster Pack catalog row, computes the cost split, inserts atomically.

- [ ] **Step 1: Implement the route**

Create `app/api/decompositions/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { decompositionInputSchema } from '@/lib/validation/decomposition';
import { computePerPackCost } from '@/lib/services/decompositions';

export async function POST(request: NextRequest) {
  // 1. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Validate.
  const json = await request.json().catch(() => null);
  const parsed = decompositionInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // 3. Lookup source purchase. Drizzle bypasses RLS — verify user_id manually.
  const sourcePurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.id, v.sourcePurchaseId),
      eq(schema.purchases.userId, user.id)
    ),
  });
  if (!sourcePurchase || sourcePurchase.deletedAt != null) {
    return NextResponse.json({ error: 'source purchase not found' }, { status: 404 });
  }

  // 4. Lookup source catalog item. Verify kind=sealed and pack_count > 1.
  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'source catalog item not found' }, { status: 404 });
  }
  if (sourceItem.kind !== 'sealed') {
    return NextResponse.json(
      { error: 'decompose source must be a sealed lot' },
      { status: 422 }
    );
  }
  if (sourceItem.packCount == null || sourceItem.packCount <= 1) {
    return NextResponse.json(
      { error: 'this product type is not decomposable' },
      { status: 422 }
    );
  }

  // 5. qty_remaining = quantity - count(rips) - count(decompositions).
  const [{ ripped }] = await db
    .select({ ripped: count() })
    .from(schema.rips)
    .where(eq(schema.rips.sourcePurchaseId, sourcePurchase.id));
  const [{ decomposed }] = await db
    .select({ decomposed: count() })
    .from(schema.boxDecompositions)
    .where(eq(schema.boxDecompositions.sourcePurchaseId, sourcePurchase.id));
  const qtyRemaining = sourcePurchase.quantity - Number(ripped) - Number(decomposed);
  if (qtyRemaining < 1) {
    return NextResponse.json(
      { error: 'box already fully consumed' },
      { status: 422 }
    );
  }

  // 6. Look up the corresponding Booster Pack catalog row.
  const packCatalog = await db.query.catalogItems.findFirst({
    where: (ci, ops) =>
      ops.and(
        ops.eq(ci.kind, 'sealed'),
        ops.eq(ci.productType, 'Booster Pack'),
        sourceItem.setCode != null
          ? ops.eq(ci.setCode, sourceItem.setCode)
          : ops.and(ops.isNull(ci.setCode), ops.eq(ci.setName, sourceItem.setName ?? ''))
      ),
  });
  if (!packCatalog) {
    return NextResponse.json(
      {
        error: 'booster pack catalog row not found for this set',
        setCode: sourceItem.setCode,
        setName: sourceItem.setName,
      },
      { status: 422 }
    );
  }

  // 7. Snapshot source cost + compute per-pack cost.
  const sourceCostCents = sourcePurchase.costCents;
  const packCount = sourceItem.packCount;
  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    sourceCostCents,
    packCount
  );

  // 8. Transaction: insert decomposition + child pack purchase atomically.
  const today = new Date().toISOString().slice(0, 10);
  const decomposeDate = v.decomposeDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      const [decomposition] = await tx
        .insert(schema.boxDecompositions)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          decomposeDate,
          sourceCostCents,
          packCount,
          perPackCostCents,
          roundingResidualCents,
          notes: v.notes ?? null,
        })
        .returning();

      const [packPurchase] = await tx
        .insert(schema.purchases)
        .values({
          userId: user.id,
          catalogItemId: packCatalog.id,
          purchaseDate: decomposeDate,
          quantity: packCount,
          costCents: perPackCostCents,
          condition: null,
          isGraded: false,
          gradingCompany: null,
          grade: null,
          certNumber: null,
          source: null,
          location: null,
          notes: null,
          sourceDecompositionId: decomposition.id,
        })
        .returning();

      return { decomposition, packPurchase };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'decomposition create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all existing tests pass. No new tests added in this task — covered by manual smoke + the broader smoke checklist in Task 21.

- [ ] **Step 4: Manual smoke (optional but recommended)**

`npm run dev`. Sign in. With at least one sealed multi-pack purchase in your account (e.g., an ETB you own), POST via console:

```js
await fetch('/api/decompositions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourcePurchaseId: <YOUR_ETB_PURCHASE_ID> }),
}).then(r => r.json());
```

Expected: `{ decomposition: {...}, packPurchase: {...} }`. Verify in Drizzle Studio: `box_decompositions` row exists, `purchases` row with `quantity = 9` (or whatever the catalog says) and `source_decomposition_id` set.

If the corresponding Booster Pack catalog row doesn't exist for the set, you'll get a 422 with `'booster pack catalog row not found for this set'` — that's expected. Search for the booster pack via `/catalog` to import it, then retry.

- [ ] **Step 5: Commit + push**

```bash
git add app/api/decompositions/route.ts
git commit -m "feat(api): POST /api/decompositions with transactional create"
git push origin main
```

---

## Task 10: API — `GET /api/decompositions/[id]` and `DELETE /api/decompositions/[id]` (undo)

**Files:**
- Create: `app/api/decompositions/[id]/route.ts`

**Spec:** Sections 5.2, 5.3.

Mirror of Plan 3's `app/api/rips/[id]/route.ts` (commit `4f3b29f`).

- [ ] **Step 1: Implement the route**

Create `app/api/decompositions/[id]/route.ts`:

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

  const decomposition = await db.query.boxDecompositions.findFirst({
    where: and(
      eq(schema.boxDecompositions.id, numericId),
      eq(schema.boxDecompositions.userId, user.id)
    ),
  });
  if (!decomposition) {
    return NextResponse.json({ error: 'decomposition not found' }, { status: 404 });
  }

  const sourcePurchase = await db.query.purchases.findFirst({
    where: eq(schema.purchases.id, decomposition.sourcePurchaseId),
  });
  const sourceCatalogItem = sourcePurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, sourcePurchase.catalogItemId),
      })
    : null;

  const packPurchase = await db.query.purchases.findFirst({
    where: and(
      eq(schema.purchases.sourceDecompositionId, decomposition.id),
      isNull(schema.purchases.deletedAt)
    ),
  });
  const packCatalogItem = packPurchase
    ? await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, packPurchase.catalogItemId),
      })
    : null;

  return NextResponse.json({
    decomposition,
    sourcePurchase,
    sourceCatalogItem,
    packPurchase,
    packCatalogItem,
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

  const decomposition = await db.query.boxDecompositions.findFirst({
    where: and(
      eq(schema.boxDecompositions.id, numericId),
      eq(schema.boxDecompositions.userId, user.id)
    ),
  });
  if (!decomposition) {
    return NextResponse.json({ error: 'decomposition not found' }, { status: 404 });
  }

  // Find the child pack purchase id (used for the linked-rips and linked-sales checks below).
  const packChild = await db.query.purchases.findFirst({
    where: eq(schema.purchases.sourceDecompositionId, numericId),
  });

  if (packChild) {
    // Block if any rips reference the pack child (the user has already started ripping packs).
    const { data: linkedRips, error: ripsErr } = await supabase
      .from('rips')
      .select('id')
      .eq('source_purchase_id', packChild.id);
    if (ripsErr) {
      return NextResponse.json({ error: ripsErr.message }, { status: 500 });
    }
    if (linkedRips && linkedRips.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked rips on its packs',
          linkedRipIds: linkedRips.map((r) => r.id),
        },
        { status: 409 }
      );
    }

    // Defensive Plan 5 check: block if any sales reference the pack child.
    const { data: linkedSales, error: salesErr } = await supabase
      .from('sales')
      .select('id')
      .eq('purchase_id', packChild.id);
    if (salesErr) {
      return NextResponse.json({ error: salesErr.message }, { status: 500 });
    }
    if (linkedSales && linkedSales.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked sales on its packs',
          linkedSaleIds: linkedSales.map((s) => s.id),
        },
        { status: 409 }
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.purchases)
        .set({ deletedAt: new Date() })
        .where(eq(schema.purchases.sourceDecompositionId, numericId));
      await tx.delete(schema.boxDecompositions).where(eq(schema.boxDecompositions.id, numericId));
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo decomposition failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit + push**

```bash
git add app/api/decompositions/[id]/route.ts
git commit -m "feat(api): GET + DELETE /api/decompositions/[id] (undo soft-deletes pack child)"
git push origin main
```

---

## Task 11: Rename `HARD_FIELDS_FOR_RIP_CHILDREN` and extend PATCH `/api/purchases/[id]`

**Files:**
- Modify: `lib/validation/purchase.ts`
- Modify: `app/api/purchases/[id]/route.ts`
- Modify: `components/purchases/LotRow.tsx` (if it imports the old name — check)

**Spec:** Section 5.5 (PATCH extension), Section 7 (rename).

The constant gets renamed for clarity since it now applies to both rip-children and decomposition-children.

- [ ] **Step 1: Rename in `lib/validation/purchase.ts`**

Open `lib/validation/purchase.ts`. Find the line:

```ts
export const HARD_FIELDS_FOR_RIP_CHILDREN = [
```

Change to:

```ts
export const HARD_FIELDS_FOR_DERIVED_CHILDREN = [
```

The array contents stay the same (`'catalogItemId'`, `'quantity'`, `'costCents'`, `'purchaseDate'`).

- [ ] **Step 2: Update PATCH route to use renamed constant + check both source ids**

Open `app/api/purchases/[id]/route.ts`. Find the import:

```ts
import {
  purchasePatchSchema,
  HARD_FIELDS_FOR_RIP_CHILDREN,
} from '@/lib/validation/purchase';
```

Change to:

```ts
import {
  purchasePatchSchema,
  HARD_FIELDS_FOR_DERIVED_CHILDREN,
} from '@/lib/validation/purchase';
```

Find the lookup query that selects `source_rip_id`:

```ts
const { data: existing, error: lookupErr } = await supabase
  .from('purchases')
  .select('id, source_rip_id, deleted_at')
  .eq('id', numericId)
  .is('deleted_at', null)
  .maybeSingle();
```

Change the select to also fetch `source_decomposition_id`:

```ts
const { data: existing, error: lookupErr } = await supabase
  .from('purchases')
  .select('id, source_rip_id, source_decomposition_id, deleted_at')
  .eq('id', numericId)
  .is('deleted_at', null)
  .maybeSingle();
```

Find the rip-child check block:

```ts
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
```

Replace with a unified check that fires when EITHER source id is set:

```ts
const isDerivedChild =
  existing.source_rip_id != null || existing.source_decomposition_id != null;
if (isDerivedChild) {
  const violatedFields = HARD_FIELDS_FOR_DERIVED_CHILDREN.filter(
    (f) => v[f] !== undefined
  );
  if (violatedFields.length > 0) {
    return NextResponse.json(
      {
        error:
          'cannot edit cost/quantity/date on derived purchases (rip or decomposition children); undo the parent event and recreate',
        fields: violatedFields,
      },
      { status: 422 }
    );
  }
}
```

- [ ] **Step 3: Find and update any other importers of the old name**

Run a grep to find any remaining importers:

```bash
grep -rn "HARD_FIELDS_FOR_RIP_CHILDREN" --include="*.ts" --include="*.tsx" .
```

Expected: zero matches (after Step 1 and Step 2). If any matches remain (e.g., in a component test or a hook), update them to use the new name.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass. The `purchase.test.ts` references the constant only by import, so the rename should not break any test (the test file imports the renamed symbol).

If a test is still importing the old name, update it to the new name.

- [ ] **Step 6: Commit + push**

```bash
git add lib/validation/purchase.ts app/api/purchases/[id]/route.ts
git commit -m "refactor: rename HARD_FIELDS_FOR_RIP_CHILDREN to HARD_FIELDS_FOR_DERIVED_CHILDREN; PATCH purchases checks both source ids"
git push origin main
```

(If you had to update other files, include them in the `git add`.)

---

## Task 12: Extend DELETE `/api/purchases/[id]` with decomposition 409 check

**Files:**
- Modify: `app/api/purchases/[id]/route.ts`

**Spec:** Section 5.5 (DELETE extension).

Add a third 409 check after the existing rip check.

- [ ] **Step 1: Add the decomposition check**

Open `app/api/purchases/[id]/route.ts`. Find the existing rip check in the DELETE handler:

```ts
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
```

Add a parallel block for decompositions, immediately after:

```ts
const { data: decomps, error: decompsErr } = await supabase
  .from('box_decompositions')
  .select('id')
  .eq('source_purchase_id', numericId);
if (decompsErr) {
  return NextResponse.json({ error: decompsErr.message }, { status: 500 });
}
if (decomps && decomps.length > 0) {
  return NextResponse.json(
    {
      error: 'purchase has been decomposed',
      decompositionIds: decomps.map((d) => d.id),
    },
    { status: 409 }
  );
}
```

Order: linked sales (existing) → linked rips (existing) → linked decompositions (new) → soft-delete update.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit + push**

```bash
git add app/api/purchases/[id]/route.ts
git commit -m "feat(api): DELETE /api/purchases/[id] returns 409 when decomposed"
git push origin main
```

---

## Task 13: Extend `useDeletePurchase` hook to surface `decompositionIds` on 409

**Files:**
- Modify: `lib/query/hooks/usePurchases.ts`
- Modify: `components/purchases/LotRow.tsx`

**Spec:** Section 8 (DeletePurchaseError extends to decompositionIds).

The `DeletePurchaseError` class added in Plan 3 fix `ff488e9` already supports `ripIds` and `linkedSaleIds`. We add `decompositionIds`.

- [ ] **Step 1: Add `decompositionIds` to `DeletePurchaseError`**

Open `lib/query/hooks/usePurchases.ts`. Find the `DeletePurchaseError` class:

```ts
export class DeletePurchaseError extends Error {
  ripIds?: number[];
  linkedSaleIds?: number[];
  constructor(message: string, opts: { ripIds?: number[]; linkedSaleIds?: number[] } = {}) {
    super(message);
    this.name = 'DeletePurchaseError';
    this.ripIds = opts.ripIds;
    this.linkedSaleIds = opts.linkedSaleIds;
  }
}
```

Replace with:

```ts
export class DeletePurchaseError extends Error {
  ripIds?: number[];
  linkedSaleIds?: number[];
  decompositionIds?: number[];
  constructor(
    message: string,
    opts: { ripIds?: number[]; linkedSaleIds?: number[]; decompositionIds?: number[] } = {}
  ) {
    super(message);
    this.name = 'DeletePurchaseError';
    this.ripIds = opts.ripIds;
    this.linkedSaleIds = opts.linkedSaleIds;
    this.decompositionIds = opts.decompositionIds;
  }
}
```

Find `useDeletePurchase`'s mutationFn body:

```ts
const body = (await res.json().catch(() => ({}))) as {
  error?: string;
  ripIds?: number[];
  linkedSaleIds?: number[];
};
throw new DeletePurchaseError(body.error ?? `delete failed: ${res.status}`, {
  ripIds: body.ripIds,
  linkedSaleIds: body.linkedSaleIds,
});
```

Add `decompositionIds`:

```ts
const body = (await res.json().catch(() => ({}))) as {
  error?: string;
  ripIds?: number[];
  linkedSaleIds?: number[];
  decompositionIds?: number[];
};
throw new DeletePurchaseError(body.error ?? `delete failed: ${res.status}`, {
  ripIds: body.ripIds,
  linkedSaleIds: body.linkedSaleIds,
  decompositionIds: body.decompositionIds,
});
```

- [ ] **Step 2: Surface `decompositionIds` in LotRow's delete handler**

Open `components/purchases/LotRow.tsx`. Find the `handleDelete` function:

```ts
const handleDelete = async () => {
  if (!confirm('Soft-delete this lot? You can recover it from the database if needed.')) return;
  try {
    await del.mutateAsync(lot.id);
  } catch (err) {
    if (err instanceof DeletePurchaseError) {
      if (err.ripIds && err.ripIds.length > 0) {
        alert(
          `${err.message}. Undo rip #${err.ripIds.join(', #')} on the source pack first.`
        );
        return;
      }
      if (err.linkedSaleIds && err.linkedSaleIds.length > 0) {
        alert(
          `${err.message}. Reverse sale #${err.linkedSaleIds.join(', #')} first (Plan 5).`
        );
        return;
      }
    }
    const message = err instanceof Error ? err.message : 'delete failed';
    alert(message);
  }
};
```

Add a third branch BEFORE the fallback:

```ts
const handleDelete = async () => {
  if (!confirm('Soft-delete this lot? You can recover it from the database if needed.')) return;
  try {
    await del.mutateAsync(lot.id);
  } catch (err) {
    if (err instanceof DeletePurchaseError) {
      if (err.ripIds && err.ripIds.length > 0) {
        alert(
          `${err.message}. Undo rip #${err.ripIds.join(', #')} on the source pack first.`
        );
        return;
      }
      if (err.decompositionIds && err.decompositionIds.length > 0) {
        alert(
          `${err.message}. Undo the decomposition (#${err.decompositionIds.join(', #')}) first.`
        );
        return;
      }
      if (err.linkedSaleIds && err.linkedSaleIds.length > 0) {
        alert(
          `${err.message}. Reverse sale #${err.linkedSaleIds.join(', #')} first (Plan 5).`
        );
        return;
      }
    }
    const message = err instanceof Error ? err.message : 'delete failed';
    alert(message);
  }
};
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit + push**

```bash
git add lib/query/hooks/usePurchases.ts components/purchases/LotRow.tsx
git commit -m "feat(hooks): DeletePurchaseError surfaces decompositionIds"
git push origin main
```

---

## Task 14: Hooks — `lib/query/hooks/useDecompositions.ts`

**Files:**
- Create: `lib/query/hooks/useDecompositions.ts`

**Spec:** Section 6.3.

Mirror of `lib/query/hooks/useRips.ts`.

- [ ] **Step 1: Implement the hooks**

Create `lib/query/hooks/useDecompositions.ts`:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecompositionInput } from '@/lib/validation/decomposition';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export type DecompositionDetailDto = {
  decomposition: {
    id: number;
    userId: string;
    sourcePurchaseId: number;
    decomposeDate: string;
    sourceCostCents: number;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    notes: string | null;
    createdAt: string;
  };
  sourcePurchase: {
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
    purchaseDate: string;
  } | null;
  sourceCatalogItem: {
    id: number;
    name: string;
    imageUrl: string | null;
    setName: string | null;
    productType: string | null;
  } | null;
  packPurchase: {
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
  } | null;
  packCatalogItem: {
    id: number;
    name: string;
    imageUrl: string | null;
  } | null;
};

export function useDecomposition(id: number | null) {
  return useQuery({
    queryKey: ['decomposition', id],
    queryFn: async () => {
      const res = await fetch(`/api/decompositions/${id}`);
      return json<DecompositionDetailDto>(res);
    },
    enabled: id != null && Number.isFinite(id),
  });
}

function invalidateAfterDecompositionMutation(
  qc: ReturnType<typeof useQueryClient>,
  affectedCatalogIds: number[]
) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['decompositions'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: DecompositionInput & {
        // Caller passes the source container's catalog id + the resulting pack
        // catalog id so we invalidate the right per-item holding caches.
        _sourceCatalogItemId: number;
        _packCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _src, _packCatalogItemId: _pack, ...body } = payload;
      const res = await fetch('/api/decompositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{
        decomposition: { id: number };
        packPurchase: { id: number; catalogItemId: number };
      }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterDecompositionMutation(qc, [
        variables._sourceCatalogItemId,
        variables._packCatalogItemId,
      ]);
    },
  });
}

export function useDeleteDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      affectedCatalogItemIds,
    }: {
      id: number;
      affectedCatalogItemIds: number[];
    }) => {
      const res = await fetch(`/api/decompositions/${id}`, { method: 'DELETE' });
      if (res.status === 204) return { id };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterDecompositionMutation(qc, variables.affectedCatalogItemIds);
    },
  });
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit + push**

```bash
git add lib/query/hooks/useDecompositions.ts
git commit -m "feat(hooks): add useDecomposition + useCreateDecomposition + useDeleteDecomposition"
git push origin main
```

---

## Task 15: Component — `<OpenBoxDialog>` (TDD with happy-dom)

**Files:**
- Create: `components/decompositions/OpenBoxDialog.tsx`
- Create: `components/decompositions/OpenBoxDialog.test.tsx`

**Spec:** Section 6.1.

Much simpler than `<RipPackDialog>` — no card search, no per-child editing. Confirm-style dialog showing the preview ("9 × Booster Pack at $5.56") plus a notes textarea.

- [ ] **Step 1: Write the failing test**

Create `components/decompositions/OpenBoxDialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDialog } from './OpenBoxDialog';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const etb = {
  purchaseId: 10,
  catalogItemId: 1,
  name: 'Ascended Heroes Elite Trainer Box',
  productType: 'Elite Trainer Box',
  imageUrl: null,
  packCount: 9,
  sourceCostCents: 5000,
  setCode: 'AH',
  setName: 'Ascended Heroes',
};

describe('<OpenBoxDialog>', () => {
  it('renders the source name + product type + pack count', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Ascended Heroes Elite Trainer Box/)).toBeInTheDocument();
    expect(screen.getByText(/Elite Trainer Box · 9 packs/)).toBeInTheDocument();
  });

  it('shows source cost basis', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    expect(screen.getByText(/Cost basis: \$50\.00/)).toBeInTheDocument();
  });

  it('previews per-pack cost with rounding residual', () => {
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={etb} />);
    // 5000 / 9 = 555.56 → rounded to 556. 556 × 9 = 5004. residual = -4.
    expect(screen.getByTestId('decomp-preview')).toHaveTextContent('9 × Ascended Heroes Booster Pack');
    expect(screen.getByTestId('decomp-per-pack')).toHaveTextContent('$5.56');
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('-$0.04');
  });

  it('clean even-split shows zero residual', () => {
    const cleanEtb = { ...etb, packCount: 5, sourceCostCents: 555 };
    // 555 / 5 = 111 exactly → residual 0.
    wrap(<OpenBoxDialog open onOpenChange={() => {}} source={cleanEtb} />);
    expect(screen.getByTestId('decomp-residual')).toHaveTextContent('$0.00');
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    wrap(<OpenBoxDialog open onOpenChange={onOpenChange} source={etb} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
npm test -- components/decompositions/OpenBoxDialog.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

Create `components/decompositions/OpenBoxDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCreateDecomposition } from '@/lib/query/hooks/useDecompositions';
import { computePerPackCost } from '@/lib/services/decompositions';

export type OpenBoxSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  productType: string;
  imageUrl: string | null;
  packCount: number;
  sourceCostCents: number;
  setCode: string | null;
  setName: string | null;
};

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedCents(cents: number): string {
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : '';
  return `${sign}${formatCents(cents)}`;
}

export function OpenBoxDialog({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: OpenBoxSourceLot;
}) {
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [packCatalogItemId, setPackCatalogItemId] = useState<number | null>(null);
  const createMutation = useCreateDecomposition();

  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    source.sourceCostCents,
    source.packCount
  );
  const packDisplayName = source.setName
    ? `${source.setName} Booster Pack`
    : 'Booster Pack';

  const handleSubmit = async () => {
    setError(null);
    try {
      // We don't yet know the pack catalog id (the server picks it). For invalidation
      // we pass a sentinel id that we'll learn on success and re-invalidate then.
      // The mutation hook accepts _packCatalogItemId; we pass the catalog id from the
      // server response by reading it off the result.
      const result = await createMutation.mutateAsync({
        sourcePurchaseId: source.purchaseId,
        notes: notes || null,
        _sourceCatalogItemId: source.catalogItemId,
        _packCatalogItemId: 0, // unknown until response; refined below
      });
      setPackCatalogItemId(result.packPurchase.catalogItemId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decomposition failed');
    }
  };

  const isMissingPackCatalog =
    error?.toLowerCase().includes('booster pack catalog row not found') ?? false;
  const searchHref = source.setName
    ? `/catalog?q=${encodeURIComponent(source.setName + ' Booster Pack')}`
    : '/catalog';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open box</DialogTitle>
          <DialogDescription>
            Create a new pack lot and split this box's cost basis evenly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="aspect-square w-12 overflow-hidden rounded bg-muted">
            {source.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={source.imageUrl} alt={source.name} className="size-full object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <div className="font-medium">{source.name}</div>
            <div className="text-xs text-muted-foreground">
              {source.productType} · {source.packCount} packs
            </div>
            <div className="text-xs text-muted-foreground">
              Cost basis: {formatCents(source.sourceCostCents)}
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm" data-testid="decomp-preview">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            This will create a new lot:
          </div>
          <div className="mt-1 font-medium">
            {source.packCount} × {packDisplayName}
          </div>
          <div className="mt-1 text-xs">
            at <span data-testid="decomp-per-pack">{formatCents(perPackCostCents)}</span> each
            {' · rounding residual: '}
            <span data-testid="decomp-residual">{formatSignedCents(roundingResidualCents)}</span>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
            {isMissingPackCatalog && (
              <p>
                <a href={searchHref} className="underline hover:no-underline">
                  Search for the booster pack
                </a>{' '}
                to import it, then come back.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Opening…' : 'Open box'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

The "unknown pack catalog id at mutation time" is a small wart — we pass `_packCatalogItemId: 0` to satisfy the hook's invalidation signature and rely on the response invalidating `['holdings']` (which is broad enough to catch the new pack lot). The state we set after success isn't used in this dialog itself, but is recorded for potential future use.

- [ ] **Step 4: Run the test**

```bash
npm test -- components/decompositions/OpenBoxDialog.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit + push**

```bash
git add components/decompositions/OpenBoxDialog.tsx components/decompositions/OpenBoxDialog.test.tsx
git commit -m "feat(components): add OpenBoxDialog (preview + submit, no per-child editing)"
git push origin main
```

---

## Task 16: Component — `<OpenBoxDetailDialog>`

**Files:**
- Create: `components/decompositions/OpenBoxDetailDialog.tsx`

**Spec:** Section 6.1.

Mirror of `<RipDetailDialog>` (commit `5b3daf9`). Read-only view + Undo button.

- [ ] **Step 1: Implement the dialog**

Create `components/decompositions/OpenBoxDetailDialog.tsx`:

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
import {
  useDecomposition,
  useDeleteDecomposition,
} from '@/lib/query/hooks/useDecompositions';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedCents(cents: number): string {
  const sign = cents < 0 ? '-' : cents > 0 ? '+' : '';
  return `${sign}${formatCents(cents)}`;
}

export function OpenBoxDetailDialog({
  open,
  onOpenChange,
  decompositionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decompositionId: number | null;
}) {
  const { data, isLoading } = useDecomposition(decompositionId);
  const undoMutation = useDeleteDecomposition();

  const handleUndo = async () => {
    if (!data) return;
    if (
      !confirm(
        'Undo this decomposition? The pack lot will be soft-deleted and the box qty will be re-credited.'
      )
    ) {
      return;
    }
    const affected = [
      ...(data.sourceCatalogItem ? [data.sourceCatalogItem.id] : []),
      ...(data.packCatalogItem ? [data.packCatalogItem.id] : []),
    ];
    try {
      await undoMutation.mutateAsync({
        id: data.decomposition.id,
        affectedCatalogItemIds: affected,
      });
      onOpenChange(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo decomposition failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Decomposition details</DialogTitle>
          <DialogDescription>Review the open-box event, then optionally undo it.</DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Box</div>
              <div className="font-medium">{data.sourceCatalogItem?.name ?? '(deleted)'}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Opened {data.decomposition.decomposeDate} · Cost basis{' '}
                {formatCents(data.decomposition.sourceCostCents)}
              </div>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Resulting pack lot
              </div>
              <div className="font-medium">
                {data.decomposition.packCount} × {data.packCatalogItem?.name ?? '(deleted)'}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                at {formatCents(data.decomposition.perPackCostCents)} each · rounding residual{' '}
                {formatSignedCents(data.decomposition.roundingResidualCents)}
              </div>
            </div>

            {data.decomposition.notes && (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                <div className="whitespace-pre-wrap">{data.decomposition.notes}</div>
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
            disabled={undoMutation.isPending || !data}
          >
            {undoMutation.isPending ? 'Undoing…' : 'Undo decomposition'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit + push**

```bash
git add components/decompositions/OpenBoxDetailDialog.tsx
git commit -m "feat(components): add OpenBoxDetailDialog (read-only view + undo)"
git push origin main
```

---

## Task 17: Component — `<DecompositionRow>`

**Files:**
- Create: `components/decompositions/DecompositionRow.tsx`

**Spec:** Section 6.1.

Mirror of `<RipRow>` (commit `a19ec4a`). Sealed lot detail page renders one of these per decomposition.

- [ ] **Step 1: Implement the component**

Create `components/decompositions/DecompositionRow.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { MoreHorizontal, PackageOpen } from 'lucide-react';
import { OpenBoxDetailDialog } from './OpenBoxDetailDialog';
import { useDeleteDecomposition } from '@/lib/query/hooks/useDecompositions';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type DecompositionRowProps = {
  decomposition: {
    id: number;
    decomposeDate: string;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    sourcePurchaseId: number;
  };
  packCatalogItem: { id: number; name: string };
  affectedCatalogItemIds: number[];
};

export function DecompositionRow({
  decomposition,
  packCatalogItem,
  affectedCatalogItemIds,
}: DecompositionRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const undoMutation = useDeleteDecomposition();

  const handleUndo = async () => {
    if (!confirm('Undo this decomposition?')) return;
    try {
      await undoMutation.mutateAsync({
        id: decomposition.id,
        affectedCatalogItemIds,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'undo decomposition failed');
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="grid size-8 place-items-center rounded-full bg-muted">
            <PackageOpen className="size-4" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="text-sm">
              Opened {decomposition.decomposeDate}{' '}
              <span className="text-muted-foreground">
                · {decomposition.packCount} × {packCatalogItem.name} at{' '}
                {formatCents(decomposition.perPackCostCents)} each
              </span>
            </div>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Decomposition actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-md hover:bg-muted"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-md"
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
                View details
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
                Undo decomposition
              </button>
            </div>
          )}
        </div>
      </div>
      <OpenBoxDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        decompositionId={decomposition.id}
      />
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit + push**

```bash
git add components/decompositions/DecompositionRow.tsx
git commit -m "feat(components): add DecompositionRow (sealed lot history entry)"
git push origin main
```

---

## Task 18: Extend `<LotRow>` for `onOpenBox` + sourceDecomposition provenance

**Files:**
- Modify: `components/purchases/LotRow.tsx`

**Spec:** Section 6.2.

Two extensions: an "Open box" menu entry that shows when conditions match, and a "From: [container] · opened [date]" subtitle for pack child lots.

- [ ] **Step 1: Read the current file to understand its structure**

Read `components/purchases/LotRow.tsx` so you know exactly where to splice the changes.

- [ ] **Step 2: Add new prop types**

The props currently include `lot`, `catalogItem`, `sourcePack`, `sourceRip`, `onRip`. Add two new optional props:

```ts
sourceContainer?: { catalogItemId: number; name: string } | null;
sourceDecomposition?: { id: number; decomposeDate: string } | null;
onOpenBox?: (lot: EditableLot) => void;
```

Update `LotRowProps` type accordingly. Pull from existing pattern.

The `catalogItem` type for the lot needs to know `packCount`. The `PurchaseFormCatalogItem` type used by `<LotRow>` doesn't currently include `packCount`. Open `components/purchases/PurchaseForm.tsx` and add `packCount: number | null` to `PurchaseFormCatalogItem`. Also update any place that constructs a `PurchaseFormCatalogItem` (notably the holdings detail page server component, which currently builds this from a Drizzle item — needs to pass through `packCount`).

This is the trickiest part of this task. Search for `PurchaseFormCatalogItem` references:

```bash
grep -rn "PurchaseFormCatalogItem" --include="*.ts" --include="*.tsx" .
```

For each construction site, add `packCount: item.packCount ?? null`.

- [ ] **Step 3: Add the "Open box" menu item**

Inside `<LotRow>`, find the menu button block. The existing "Rip pack" entry looks like:

```tsx
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
```

Add a parallel "Open box" entry immediately after it:

```tsx
{onOpenBox &&
  catalogItem.kind === 'sealed' &&
  catalogItem.packCount != null &&
  catalogItem.packCount > 1 && (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onOpenBox(lot);
      }}
      className="block w-full rounded-sm px-2 py-1.5 text-left hover:bg-muted"
    >
      Open box
    </button>
  )}
```

- [ ] **Step 4: Add the sourceDecomposition provenance subtitle**

Find where the existing rip provenance subtitle renders:

```tsx
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
```

Add a parallel block for decomposition provenance immediately after it:

```tsx
{sourceDecomposition && sourceContainer && (
  <div className="text-xs text-muted-foreground">
    From:{' '}
    <Link
      href={`/holdings/${sourceContainer.catalogItemId}`}
      className="underline hover:text-foreground"
    >
      {sourceContainer.name}
    </Link>{' '}
    · opened {sourceDecomposition.decomposeDate}
  </div>
)}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If `PurchaseFormCatalogItem` callers haven't all been updated to pass `packCount`, tsc will yell. Fix each call site.

- [ ] **Step 6: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit + push**

```bash
git add components/purchases/LotRow.tsx components/purchases/PurchaseForm.tsx 'app/(authenticated)/holdings/[catalogItemId]/page.tsx' 'app/(authenticated)/purchases/new/page.tsx' 'app/(authenticated)/purchases/[id]/edit/page.tsx'
git commit -m "feat(components): LotRow gets Open box menu + decomposition provenance subtitle"
git push origin main
```

(Adjust `git add` to include any other files that needed `packCount` plumbed through `PurchaseFormCatalogItem`.)

---

## Task 19: Extend GET `/api/holdings/[catalogItemId]` for decomposition provenance + history

**Files:**
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Modify: `lib/query/hooks/useHoldings.ts`

**Spec:** Section 5.5 (`GET /api/holdings/[catalogItemId]` extension).

Two changes:
- Sealed items get a new `decompositions` array in the response.
- Card pack child lots get `sourceDecomposition` and `sourceContainer` provenance fields.

- [ ] **Step 1: Update the route to fetch + include decomposition data**

Open `app/api/holdings/[catalogItemId]/route.ts`. The route already fetches the holding's lots, joins them with their source rips for provenance, and returns a `rips` array for sealed items. Mirror that structure for decompositions.

Read the file first so you understand its layout. Then add the parallel fetches:

After the existing source-rip provenance lookups, add source-decomposition lookups:

```ts
// Source decomposition provenance for pack-child lots (parallel to source-rip lookups above).
const sourceDecompositionIds = lots
  .map((l) => l.sourceDecompositionId)
  .filter((v): v is number => v != null);
const sourceDecompositions = sourceDecompositionIds.length
  ? await db.query.boxDecompositions.findMany({
      where: inArray(schema.boxDecompositions.id, sourceDecompositionIds),
    })
  : [];
const decompById = new Map(sourceDecompositions.map((d) => [d.id, d]));
const sourceContainerPurchaseIds = sourceDecompositions.map((d) => d.sourcePurchaseId);
const sourceContainerPurchases = sourceContainerPurchaseIds.length
  ? await db.query.purchases.findMany({
      where: inArray(schema.purchases.id, sourceContainerPurchaseIds),
    })
  : [];
const sourceContainerByPurchaseId = new Map(sourceContainerPurchases.map((p) => [p.id, p]));
const sourceContainerCatalogIds = sourceContainerPurchases.map((p) => p.catalogItemId);
const sourceContainerCatalogs = sourceContainerCatalogIds.length
  ? await db.query.catalogItems.findMany({
      where: inArray(schema.catalogItems.id, sourceContainerCatalogIds),
    })
  : [];
const sourceContainerCatalogById = new Map(sourceContainerCatalogs.map((c) => [c.id, c]));
```

After the existing `ripsForSealed` lookup, add a parallel `decompositionsForSealed` lookup:

```ts
const decompositionsForSealed =
  item.kind === 'sealed' && lotIds.length
    ? await db.query.boxDecompositions.findMany({
        where: inArray(schema.boxDecompositions.sourcePurchaseId, lotIds),
      })
    : [];
```

When constructing the lot annotations (`lots.map((l) => ...)` block that adds `sourceRip`/`sourcePack`), extend each annotation to also include `sourceDecomposition` and `sourceContainer`:

```ts
const decomp = l.sourceDecompositionId != null
  ? decompById.get(l.sourceDecompositionId) ?? null
  : null;
const container = decomp
  ? sourceContainerByPurchaseId.get(decomp.sourcePurchaseId) ?? null
  : null;
const containerCatalog = container
  ? sourceContainerCatalogById.get(container.catalogItemId) ?? null
  : null;

return {
  lot: { /* ...existing lot fields... */ },
  sourceRip: /* existing */,
  sourcePack: /* existing */,
  sourceDecomposition: decomp
    ? { id: decomp.id, decomposeDate: decomp.decomposeDate, sourcePurchaseId: decomp.sourcePurchaseId }
    : null,
  sourceContainer: containerCatalog
    ? { catalogItemId: containerCatalog.id, name: containerCatalog.name }
    : null,
};
```

For sealed items, add a `decompositions` array to the response (parallel to the existing `rips` array):

```ts
const decompositionsSummary =
  item.kind === 'sealed'
    ? decompositionsForSealed.map((d) => ({
        id: d.id,
        decomposeDate: d.decomposeDate,
        sourceCostCents: d.sourceCostCents,
        packCount: d.packCount,
        perPackCostCents: d.perPackCostCents,
        roundingResidualCents: d.roundingResidualCents,
        sourcePurchaseId: d.sourcePurchaseId,
        notes: d.notes,
      }))
    : [];
```

The qty-remaining computation in this route also needs to subtract decomposition counts. Find the existing rollup that subtracts `ripsForSealed`. Pass `decompositionsForSealed` (transformed to `RawDecompositionRow[]`) as the third arg to `aggregateHoldings`:

```ts
const rawDecompositions = decompositionsForSealed.map((d) => ({
  id: d.id,
  source_purchase_id: d.sourcePurchaseId,
}));
const [holding] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);
```

Add to the response JSON:

```ts
return NextResponse.json({
  item: { /* existing */ },
  holding: holding ?? { /* existing fallback */ },
  lots: lotsWithProvenance, // now also has sourceDecomposition + sourceContainer
  rips: ripsSummary,
  decompositions: decompositionsSummary,
});
```

Add the `packCount` field to the `item` object in the response:

```ts
item: {
  // ... existing fields ...
  packCount: item.packCount,
  // ... rest ...
}
```

(This is needed by `<LotRow>` to decide whether to show "Open box" — the catalog item passed to `<LotRow>` comes through this DTO.)

- [ ] **Step 2: Update `useHoldings` types**

Open `lib/query/hooks/useHoldings.ts`. Find the `HoldingDetailDto` type. Update:

The `item` shape adds `packCount`:
```ts
item: {
  // ... existing fields ...
  packCount: number | null;
};
```

Each `lots[i]` shape adds `sourceDecomposition` and `sourceContainer`:
```ts
lots: Array<{
  lot: { /* existing */ };
  sourceRip: { id: number; ripDate: string; sourcePurchaseId: number } | null;
  sourcePack: { catalogItemId: number; name: string } | null;
  sourceDecomposition: { id: number; decomposeDate: string; sourcePurchaseId: number } | null;
  sourceContainer: { catalogItemId: number; name: string } | null;
}>;
```

Add a new field at the top level:
```ts
decompositions: Array<{
  id: number;
  decomposeDate: string;
  sourceCostCents: number;
  packCount: number;
  perPackCostCents: number;
  roundingResidualCents: number;
  sourcePurchaseId: number;
  notes: string | null;
}>;
```

- [ ] **Step 3: Update the holdings detail server page to fetch + pass decompositions**

The server page at `app/(authenticated)/holdings/[catalogItemId]/page.tsx` builds the `HoldingDetailDto` to pass to the client island. Mirror the route's changes there too:
- Fetch source decompositions for pack-child lots' provenance
- Fetch decompositions for sealed lots
- Pass through to the client component
- Include `packCount` on the `item` field

Read the existing file and apply the same pattern as the route. The structure is parallel because the page builds the same DTO shape that the route returns.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit + push**

```bash
git add app/api/holdings/[catalogItemId]/route.ts 'app/(authenticated)/holdings/[catalogItemId]/page.tsx' lib/query/hooks/useHoldings.ts
git commit -m "feat(api): GET /api/holdings/[id] returns decompositions + sourceDecomposition provenance"
git push origin main
```

---

## Task 20: Wire `<OpenBoxDialog>` and decomposition history into `<HoldingDetailClient>`

**Files:**
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

**Spec:** Section 6.2.

Three changes inside the client component: openBox state, Dialog instance + onOpenBox handler wired to LotRow, and a new "Decomposition history" section.

- [ ] **Step 1: Read the current file**

Read `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx` so you know where each new bit goes.

- [ ] **Step 2: Add openBox state + handler**

Near the existing rip state:

```ts
const [ripOpen, setRipOpen] = useState(false);
const [ripPack, setRipPack] = useState<RipPackSourceLot | null>(null);
```

Add parallel openBox state:

```ts
const [openBoxOpen, setOpenBoxOpen] = useState(false);
const [openBoxSource, setOpenBoxSource] = useState<OpenBoxSourceLot | null>(null);
```

Import the type:

```ts
import { OpenBoxDialog, type OpenBoxSourceLot } from '@/components/decompositions/OpenBoxDialog';
import { DecompositionRow } from '@/components/decompositions/DecompositionRow';
```

Define the handler near the existing `openRip(lot)` handler:

```ts
const openOpenBox = (lot: EditableLot) => {
  if (
    detail.item.packCount == null ||
    detail.item.packCount <= 1
  ) {
    return; // not decomposable; the menu item shouldn't have been visible
  }
  setOpenBoxSource({
    purchaseId: lot.id,
    catalogItemId: detail.item.id,
    name: detail.item.name,
    productType: detail.item.productType ?? 'Sealed',
    imageUrl: detail.item.imageUrl,
    packCount: detail.item.packCount,
    sourceCostCents: lot.costCents,
    setCode: null, // populated below if available; the page server should pass setCode through
    setName: detail.item.setName,
  });
  setOpenBoxOpen(true);
};
```

Note: the `setCode` field — `HoldingDetailDto.item` doesn't currently include `setCode`. Add it: extend the API/DTO to also include `setCode` on the item field (it's already in the catalog row). This is a small addition to Task 19's work — if you got here without it, go back and add `setCode: item.setCode` to the route + page response, and `setCode: string | null` to the DTO type.

- [ ] **Step 3: Pass `onOpenBox` to LotRow**

Find the existing `<LotRow>` invocation in the lot map. Currently:

```tsx
return (
  <LotRow
    key={lot.id}
    lot={editableLot}
    catalogItem={catalogItem}
    sourceRip={sourceRip}
    sourcePack={sourcePack}
    onRip={canRip ? openRip : undefined}
  />
);
```

Add the new props:

```tsx
return (
  <LotRow
    key={lot.id}
    lot={editableLot}
    catalogItem={catalogItem}
    sourceRip={sourceRip}
    sourcePack={sourcePack}
    sourceDecomposition={sourceDecomposition}
    sourceContainer={sourceContainer}
    onRip={canRip ? openRip : undefined}
    onOpenBox={canOpenBox ? openOpenBox : undefined}
  />
);
```

Where `sourceDecomposition` and `sourceContainer` come from the lot annotation in `detail.lots[i]`. And where `canOpenBox` is computed inside the `lot.map()`:

```ts
const canOpenBox =
  isSealed &&
  detail.item.packCount != null &&
  detail.item.packCount > 1 &&
  qtyRemaining > 0;
```

(`qtyRemaining` is already computed for `canRip`; reuse.)

- [ ] **Step 4: Render the OpenBoxDialog instance**

Below the existing RipPackDialog instance at the end of the return:

```tsx
{openBoxSource && (
  <OpenBoxDialog
    open={openBoxOpen}
    onOpenChange={setOpenBoxOpen}
    source={openBoxSource}
  />
)}
```

- [ ] **Step 5: Render the "Decomposition history" section**

Below the existing "Rip history" section:

```tsx
{isSealed && detail.decompositions.length > 0 && (
  <section className="space-y-2">
    <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
      Decomposition history
    </h2>
    <div>
      {detail.decompositions.map((d) => (
        <DecompositionRow
          key={d.id}
          decomposition={{
            id: d.id,
            decomposeDate: d.decomposeDate,
            packCount: d.packCount,
            perPackCostCents: d.perPackCostCents,
            roundingResidualCents: d.roundingResidualCents,
            sourcePurchaseId: d.sourcePurchaseId,
          }}
          packCatalogItem={{ id: detail.item.id, name: 'Booster Pack' }}
          // affectedCatalogItemIds: source container catalog (this page) plus
          // the resulting pack catalog. We don't have the pack catalog id
          // immediately; the undo mutation invalidates ['holdings'] which
          // covers it. Use just the source for now.
          affectedCatalogItemIds={[detail.item.id]}
        />
      ))}
    </div>
  </section>
)}
```

The `packCatalogItem.name` is hardcoded to "Booster Pack" because the row layout uses it as a generic label; if you want the actual set-specific name you'd need to expose it on the decomposition summary in the DTO. For Plan 3.5 v1, "Booster Pack" is fine — the UX still reads clearly ("Opened 2026-04-27 · 9 × Booster Pack at $5.56 each").

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit + push**

```bash
git add 'app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx'
git commit -m "feat(ui): /holdings/[id] gets Open box dialog + decomposition history section"
git push origin main
```

---

## Task 21: Final integration smoke + plan-complete commit

**Files:** none (verification only).

End-to-end smoke checklist. Run each, confirm, then make a final empty commit marking the plan complete.

- [ ] **Step 1: Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Verify route tree exists**

```bash
ls 'app/api/decompositions/'
ls 'app/api/decompositions/[id]/'
ls 'components/decompositions/'
```

Expected: each directory has the new files (route.ts, OpenBoxDialog.tsx, etc.).

- [ ] **Step 4: Manual browser smoke checklist** (for the user, not the implementer)

The implementer subagent should NOT run a browser. The user will run this against https://pokestonks.vercel.app:

1. Visit `/holdings/<sealed_item_id>` for an ETB or Tin lot. Verify "Open box" appears in the "..." menu.
2. Click "Open box". Dialog shows "9 × [Set] Booster Pack at $5.56 each" (numbers vary by source cost / pack count).
3. Submit. Dialog closes. New section "Decomposition history" appears with the new decomposition row. The lot list shows the sealed lot's qty reduced by 1.
4. Navigate to `/holdings/<booster_pack_catalog_id>`. Verify the new pack lot exists with `quantity = 9` (or whatever pack count) and the "From: [ETB] · opened DATE" subtitle.
5. From the pack lot, click "..." → Rip pack. Walk through the existing Plan 3 rip flow with one kept card. Verify the kept card lot shows the "From: pack · ripped DATE" subtitle.
6. Try to soft-delete the source ETB lot. Verify 409 error: "this purchase has been decomposed. Undo the decomposition first."
7. From `/holdings/<sealed_item_id>`, click the decomposition row's "..." → Undo decomposition. Verify the rip from step 5 BLOCKS the undo with a 409: "decomposition has linked rips on its packs."
8. Undo the rip from step 5 first. Then undo the decomposition. Verify the source ETB lot's qty is restored, and the pack lot is gone.
9. Try opening a single Booster Pack (not a multi-pack container). Verify "Open box" does NOT appear in the menu.
10. Search for a sealed item whose set has no Booster Pack catalog row imported. Try to Open box it. Verify the dialog shows the "booster pack catalog row not found" error with the "Search for the booster pack" link.

If any check fails, fix the offending task and re-run.

- [ ] **Step 5: Final empty commit**

```bash
git commit --allow-empty -m "feat: ship Plan 3.5 (Box Decomposition)"
git push origin main
```

- [ ] **Step 6: Update project memory**

Update `C:\Users\Michael\.claude\projects\C--Users-Michael-Documents-Claude-Pokemon-Portfolio\memory\project_state.md`:

In the Plan structure section, mark Plan 3.5 as ✅ shipped 2026-04-27. Add a brief acceptance note: "Plan 3.5 acceptance: pack_count column on catalog_items, box_decompositions table + source_decomposition_id, OpenBoxDialog + DecompositionRow + OpenBoxDetailDialog, useDecompositions hooks, /api/decompositions endpoints, qty consumption from both rips and decompositions, undo with linked-rips 409 block."

Update the "How to apply" footer: "Plan 3.5 done. Next step on resume is writing Plan 4 (P&L + Dashboard) — brainstorm first to scope unrealized P&L computation, top movers, time-window filters, then writing-plans, then subagent-driven-development."

Memory file is not under git (`.claude/` is gitignored); just save the file.

---

## Plan Self-Review

After writing the full plan, this section captures the self-review pass per the writing-plans skill.

### Spec coverage

- Section 4.1 (catalog_items.pack_count + seed) → Tasks 1, 2
- Section 4.2 (box_decompositions table + sourceDecompositionId) → Tasks 3, 4
- Section 4.3 (RLS + back-FK) → Task 5
- Section 5.1 (POST /api/decompositions) → Task 9
- Section 5.2 (GET /api/decompositions/[id]) → Task 10
- Section 5.3 (DELETE /api/decompositions/[id] undo) → Task 10
- Section 5.4 (computePerPackCost) → Task 7
- Section 5.5 PATCH extension → Task 11
- Section 5.5 DELETE extension → Task 12
- Section 5.5 GET /api/holdings extension → Task 8 (aggregateHoldings + route)
- Section 5.5 GET /api/holdings/[id] extension → Task 19
- Section 6.1 OpenBoxDialog → Task 15
- Section 6.1 DecompositionRow → Task 17
- Section 6.1 OpenBoxDetailDialog → Task 16
- Section 6.2 LotRow extensions → Task 18
- Section 6.2 HoldingDetailClient extensions → Task 20
- Section 6.3 useDecompositions hooks → Task 14
- Section 7 validation → Task 6
- Section 7 HARD_FIELDS rename → Task 11
- Section 8 error handling → exercised in Tasks 9, 10, 11, 12, 13
- Section 9.1 unit tests → Tasks 6, 7, 8
- Section 9.2 API integration tests → covered as manual smoke per task and Task 21 step 4 (real-DB integration tests deferred to Plan 6 polish, same posture as Plan 3)
- Section 9.3 component tests → Task 15 (OpenBoxDialog)
- Section 10 migrations → Tasks 1, 4, 5

### Type consistency

- `RawDecompositionRow` defined in Task 8; imported in Tasks 8, 19. ✓
- `DecompositionInput` defined in Task 6; imported in Tasks 9, 14. ✓
- `OpenBoxSourceLot` defined in Task 15; imported in Task 20. ✓
- `DecompositionDetailDto` defined in Task 14; consumed by Task 16 (OpenBoxDetailDialog). ✓
- `HoldingDetailDto` extended in Task 19 (`packCount`, `setCode`, `decompositions`, `sourceDecomposition`, `sourceContainer`); consumed by Tasks 20 (HoldingDetailClient). ✓
- `PurchaseFormCatalogItem` extended in Task 18 (`packCount`); call sites updated in same task. ✓
- `HARD_FIELDS_FOR_DERIVED_CHILDREN` (renamed in Task 11) imported by Task 11's own PATCH route update. ✓
- `computePerPackCost` defined in Task 7; imported by Tasks 9, 15. ✓
- `useCreateDecomposition` and `useDeleteDecomposition` and `useDecomposition` defined in Task 14; consumed by Tasks 15, 16, 17. ✓

### Placeholders

None. Every step contains concrete code or commands.

### Scope check

The plan stays focused on box decomposition. No unrelated refactoring, no Plan 4 work bleeds in. The HARD_FIELDS rename in Task 11 is the only "scope creep" but it's directly motivated by the spec's requirement to share the lock between rip-children and decomposition-children. Acceptable.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-04-27-pokestonks-box-decomposition.md`.

## Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Best for a plan with this many independent tasks; the per-task isolation reduces blast radius if a single task goes sideways.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review. Lower context overhead between tasks but slower because each task waits for review.

Which approach?
