# Plan 9 — Decomposition polish (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Plan 5.1 recipe-driven decomposition system to (1) accept card rows alongside sealed-product rows in recipes, (2) generalize the recipe target so Booster Box Cases decompose into Box-level lots that themselves open into packs (two-stage), and (3) give the user a Reset affordance + visibility cue in OpenBoxDialog so a wrong saved recipe can be wiped without needing another box to open.

**Architecture:** One column rename in `catalog_pack_compositions` (`pack_catalog_item_id` → `contents_catalog_item_id`). Cost-split math narrows so only `kind='sealed'` rows enter the divisor; card-kind rows are $0-cost-basis "freebie" lots. New `DELETE /api/catalog/[id]/composition` endpoint backs the dialog Reset button. While we're in here, fix a latent bug from Plan 5.1: `GET /api/decompositions/[id]` and the DELETE handler's linked-sales check both only look at the FIRST child purchase, masked until now because real recipes were single-row.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM, Supabase Postgres, TanStack Query, Vitest, base-ui Dialog.

**Spec:** `docs/superpowers/specs/2026-05-02-pokestonks-decomposition-polish-design.md`

**Reference commits:** `bff5f30` (Plan 8 ship marker, current main).

---

## File map

**New files:**
- `supabase/migrations/20260502000002_recipe_polish.sql`

**Modified files:**
- `lib/db/schema/catalogPackCompositions.ts` (column rename, index name)
- `lib/validation/decomposition.ts` (field rename)
- `lib/services/decompositions.ts` (add `computeCostSplitTotal`)
- `lib/services/decompositions.test.ts` (test new helper)
- `app/api/decompositions/route.ts` (accept card rows, new validation, cost-split filter)
- `app/api/decompositions/route.test.ts` (regression + new error paths)
- `app/api/decompositions/[id]/route.ts` (return ALL children; fix linked-sales check)
- `app/api/decompositions/[id]/route.test.ts` (multi-child regression — create file if absent)
- `app/api/catalog/[id]/composition/route.ts` (response shape `pack*` → `contents*`, add `kind`/`productType`, new DELETE handler)
- `app/api/catalog/[id]/composition/route.test.ts` (DELETE tests, response shape updates)
- `lib/query/hooks/useDecompositions.ts` (DTO rename, drop legacy `_packCatalogItemId`, new `useClearCatalogComposition`, `DecompositionDetailDto` widens to arrays)
- `components/decompositions/OpenBoxDialog.tsx` (drop picker filter, recipe-state banner, Clear button + confirm, mixed-recipe preview)
- `components/decompositions/OpenBoxDialog.test.tsx` (new card-picker, banner, clear, mixed-recipe tests)
- `components/decompositions/OpenBoxDetailDialog.tsx` (render list of children, "(promo)" labels)
- `components/decompositions/OpenBoxDetailDialog.test.tsx` (multi-child render — create if absent)

**No code changes needed (verified during plan write):**
- `lib/services/pnl.ts` — `aggregateHoldings`/`computeHoldingPnL` already handle $0-cost lots correctly via Plan 8's `unknownCost` plumbing; card children with `cost_cents=0, unknownCost=false` produce `currentValue - 0 = currentValue` P&L naturally.
- `app/api/holdings/[catalogItemId]/route.ts`, `app/api/dashboard/totals/route.ts`, `app/api/sales/*` — read-side surfaces inherit child-purchase rows generically; no per-kind branching.
- LotsTable / HoldingDetailClient menu gates — existing rules (`Open Box: kind==='sealed' && productType !== 'Booster Pack'`, `Rip Pack: productType === 'Booster Pack'`) naturally exclude card children.
- `app/api/search/route.ts` — already supports `kind=all` (default).

---

## Pre-flight: confirm current state

- [ ] **Step 0.1: Verify clean working tree on main at Plan 8 ship marker**

```bash
git status
git log -1 --format="%H %s"
```

Expected: clean working tree. Latest commit should be `64f31b9 docs(plan-9): spec for decomposition polish ...` on top of `bff5f30 feat: ship Plan 8 ...`.

- [ ] **Step 0.2: Confirm baseline test count**

```bash
npm run test -- --run
```

Expected: 433 tests passing across the test suite. Record the exact number; this is the baseline for "+N new tests" math at ship time.

---

## Task 1: SQL migration file

**Files:**
- Create: `supabase/migrations/20260502000002_recipe_polish.sql`

- [ ] **Step 1.1: Create the migration file**

Create `supabase/migrations/20260502000002_recipe_polish.sql` with this exact content:

```sql
-- ============================================================
-- Plan 9: recipe contents can be any catalog row, not just
-- Booster Pack rows. Rename column to reflect.
--
-- "pack" stays in the table name for historical continuity;
-- callers should read the column name as the source of truth.
-- ============================================================

ALTER TABLE catalog_pack_compositions
  RENAME COLUMN pack_catalog_item_id TO contents_catalog_item_id;

-- Recreate the unique index with the new column name.
DROP INDEX IF EXISTS catalog_pack_compositions_source_pack_idx;
CREATE UNIQUE INDEX catalog_pack_compositions_source_contents_idx
  ON catalog_pack_compositions(source_catalog_item_id, contents_catalog_item_id);

COMMENT ON COLUMN catalog_pack_compositions.contents_catalog_item_id IS
  'FK to catalog_items.id. Any kind allowed (sealed sub-products like Booster Boxes, Booster Packs, or cards for promos).';

COMMENT ON COLUMN box_decompositions.pack_count IS
  'Cost-split divisor at decomp time. Equals sum(quantity) of non-card recipe rows. Historical name retained.';
```

**DO NOT apply the migration yet.** It runs at ship time after the deploy completes — see the final smoke task.

- [ ] **Step 1.2: Commit**

```bash
git add supabase/migrations/20260502000002_recipe_polish.sql
git commit -m "feat(plan-9): migration to rename pack_catalog_item_id to contents_catalog_item_id"
```

---

## Task 2: Drizzle schema rename

**Files:**
- Modify: `lib/db/schema/catalogPackCompositions.ts`

- [ ] **Step 2.1: Update the schema file**

Replace `lib/db/schema/catalogPackCompositions.ts` with:

```ts
import { pgTable, bigserial, bigint, integer, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';

export const catalogPackCompositions = pgTable(
  'catalog_pack_compositions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceCatalogItemId: bigint('source_catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    contentsCatalogItemId: bigint('contents_catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceContentsIdx: uniqueIndex('catalog_pack_compositions_source_contents_idx').on(
      t.sourceCatalogItemId,
      t.contentsCatalogItemId
    ),
    sourceIdx: index('catalog_pack_compositions_source_idx').on(
      t.sourceCatalogItemId,
      t.displayOrder
    ),
    qtyCheck: check('catalog_pack_compositions_qty_positive', sql`${t.quantity} > 0`),
  })
);

export type CatalogPackComposition = typeof catalogPackCompositions.$inferSelect;
export type NewCatalogPackComposition = typeof catalogPackCompositions.$inferInsert;
```

- [ ] **Step 2.2: Verify tsc fails (it should, in callers that use the old field name)**

```bash
npx tsc --noEmit
```

Expected: type errors in `app/api/decompositions/route.ts`, `app/api/catalog/[id]/composition/route.ts` — references to `packCatalogItemId` on the schema. We fix those next. **Do NOT commit yet** — the next task fixes the callers and then we commit together.

---

## Task 3: Validation field rename + type updates

**Files:**
- Modify: `lib/validation/decomposition.ts`

- [ ] **Step 3.1: Update validation schema**

Replace `lib/validation/decomposition.ts` with:

```ts
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const recipeRowSchema = z.object({
  contentsCatalogItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export const decompositionInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  decomposeDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
  recipe: z.array(recipeRowSchema).min(1).optional(),
});

export type RecipeRow = z.infer<typeof recipeRowSchema>;
export type DecompositionInput = z.infer<typeof decompositionInputSchema>;
```

(Only change vs. current: `packCatalogItemId` → `contentsCatalogItemId`.)

---

## Task 4: Pure-function `computeCostSplitTotal`

**Files:**
- Modify: `lib/services/decompositions.ts`
- Modify: `lib/services/decompositions.test.ts`

- [ ] **Step 4.1: Write the failing test**

Append to `lib/services/decompositions.test.ts`:

```ts
import { computeCostSplitTotal } from './decompositions';

describe('computeCostSplitTotal', () => {
  type Catalog = { id: number; kind: 'sealed' | 'card' };
  const catalog = (rows: Catalog[]) => new Map(rows.map((r) => [r.id, r]));

  it('sums quantities for all-sealed recipes', () => {
    const c = catalog([
      { id: 1, kind: 'sealed' },
      { id: 2, kind: 'sealed' },
    ]);
    const total = computeCostSplitTotal(
      [
        { contentsCatalogItemId: 1, quantity: 3 },
        { contentsCatalogItemId: 2, quantity: 2 },
      ],
      c
    );
    expect(total).toBe(5);
  });

  it('excludes card rows from the divisor', () => {
    const c = catalog([
      { id: 1, kind: 'sealed' },
      { id: 2, kind: 'card' },
    ]);
    const total = computeCostSplitTotal(
      [
        { contentsCatalogItemId: 1, quantity: 3 },
        { contentsCatalogItemId: 2, quantity: 1 },
      ],
      c
    );
    expect(total).toBe(3);
  });

  it('returns 0 when all rows are cards', () => {
    const c = catalog([
      { id: 1, kind: 'card' },
      { id: 2, kind: 'card' },
    ]);
    const total = computeCostSplitTotal(
      [
        { contentsCatalogItemId: 1, quantity: 1 },
        { contentsCatalogItemId: 2, quantity: 2 },
      ],
      c
    );
    expect(total).toBe(0);
  });

  it('throws when a recipe row references a missing catalog item', () => {
    const c = catalog([{ id: 1, kind: 'sealed' }]);
    expect(() =>
      computeCostSplitTotal([{ contentsCatalogItemId: 99, quantity: 1 }], c)
    ).toThrow(/missing catalog item/);
  });
});
```

- [ ] **Step 4.2: Run test, verify failure**

```bash
npx vitest run lib/services/decompositions.test.ts
```

Expected: tests for `computeCostSplitTotal` fail with "computeCostSplitTotal is not a function" or import error.

- [ ] **Step 4.3: Implement the helper**

Append to `lib/services/decompositions.ts`:

```ts
/**
 * Sum the quantities of recipe rows whose contents catalog item is kind='sealed'.
 * Card-kind rows are excluded — they're freebies at $0 cost basis.
 *
 * Throws if a row references a catalog item not present in the lookup map.
 *
 * Used by POST /api/decompositions to compute the cost-split divisor and by
 * OpenBoxDialog to render the live preview.
 */
export function computeCostSplitTotal(
  recipe: Array<{ contentsCatalogItemId: number; quantity: number }>,
  contentsCatalogByItemId: Map<number, { id: number; kind: 'sealed' | 'card' }>
): number {
  let total = 0;
  for (const row of recipe) {
    const item = contentsCatalogByItemId.get(row.contentsCatalogItemId);
    if (!item) {
      throw new Error(`missing catalog item for contentsCatalogItemId ${row.contentsCatalogItemId}`);
    }
    if (item.kind === 'sealed') total += row.quantity;
  }
  return total;
}
```

- [ ] **Step 4.4: Run test, verify pass**

```bash
npx vitest run lib/services/decompositions.test.ts
```

Expected: all `computeCostSplitTotal` tests pass; existing `computePerPackCost` tests still pass.

---

## Task 5: POST /api/decompositions accepts card rows + new validation

**Files:**
- Modify: `app/api/decompositions/route.ts`
- Modify: `app/api/decompositions/route.test.ts`

- [ ] **Step 5.1: Write failing tests for the new behavior**

Append the following test cases to `app/api/decompositions/route.test.ts` (preserve all existing tests). If your test file uses `describe` blocks, place these inside the existing `describe('POST /api/decompositions', ...)`:

```ts
it('creates a card child purchase with cost_cents=0 for a card recipe row', async () => {
  // Seed: source sealed purchase ($60 Mega ex Box), 1 pack catalog item, 1 card catalog item.
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const packItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Pack' });
  const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 6000,
  });

  const res = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: sourcePurchase.id,
        recipe: [
          { contentsCatalogItemId: packItem.id, quantity: 3 },
          { contentsCatalogItemId: cardItem.id, quantity: 1 },
        ],
      }),
    })
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.packPurchases).toHaveLength(2);
  const pack = body.packPurchases.find(
    (p: { catalogItemId: number }) => p.catalogItemId === packItem.id
  );
  const card = body.packPurchases.find(
    (p: { catalogItemId: number }) => p.catalogItemId === cardItem.id
  );
  expect(pack.costCents).toBe(2000); // 6000 / 3 packs = 2000 each
  expect(pack.quantity).toBe(3);
  expect(card.costCents).toBe(0); // freebie
  expect(card.quantity).toBe(1);
});

it('rejects a recipe with no sealed rows', async () => {
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const cardA = await seedCatalogItem({ kind: 'card', productType: null });
  const cardB = await seedCatalogItem({ kind: 'card', productType: null });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 2000,
  });

  const res = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: sourcePurchase.id,
        recipe: [
          { contentsCatalogItemId: cardA.id, quantity: 1 },
          { contentsCatalogItemId: cardB.id, quantity: 1 },
        ],
      }),
    })
  );

  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.error).toBe('recipe_must_contain_sealed_row');
});

it('rejects a circular recipe (contents == source)', async () => {
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Box' });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 12000,
  });

  const res = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: sourcePurchase.id,
        recipe: [{ contentsCatalogItemId: sourceItem.id, quantity: 1 }],
      }),
    })
  );

  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.error).toBe('circular_recipe');
});

it('inherits unknown_cost from the source on both pack and card children', async () => {
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const packItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Pack' });
  const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 0,
    unknownCost: true,
  });

  const res = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: sourcePurchase.id,
        recipe: [
          { contentsCatalogItemId: packItem.id, quantity: 3 },
          { contentsCatalogItemId: cardItem.id, quantity: 1 },
        ],
      }),
    })
  );

  expect(res.status).toBe(201);
  const body = await res.json();
  for (const child of body.packPurchases) {
    expect(child.unknownCost).toBe(true);
    expect(child.costCents).toBe(0);
  }
});

it('two-stage: opening a Case creates Box children which themselves can be opened to packs', async () => {
  const caseItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Box Case' });
  const boxItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Box' });
  const packItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Pack' });
  const casePurchase = await seedPurchase({
    catalogItemId: caseItem.id,
    quantity: 1,
    costCents: 72000,
  });

  // Stage 1: Case → 6 Boxes
  const res1 = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: casePurchase.id,
        recipe: [{ contentsCatalogItemId: boxItem.id, quantity: 6 }],
      }),
    })
  );
  expect(res1.status).toBe(201);
  const body1 = await res1.json();
  const boxChild = body1.packPurchases[0];
  expect(boxChild.catalogItemId).toBe(boxItem.id);
  expect(boxChild.quantity).toBe(6);
  expect(boxChild.costCents).toBe(12000); // 72000 / 6

  // Stage 2: open ONE of those boxes (we treat boxChild as the source) → 36 packs
  // Note: in real usage, the user would split the 6-qty lot first or open the
  // multi-qty lot directly. The decomposition routes accept any sealed source
  // purchase, so the same pattern works.
  const res2 = await POST(
    new NextRequest('http://test/api/decompositions', {
      method: 'POST',
      body: JSON.stringify({
        sourcePurchaseId: boxChild.id,
        recipe: [{ contentsCatalogItemId: packItem.id, quantity: 36 }],
      }),
    })
  );
  expect(res2.status).toBe(201);
  const body2 = await res2.json();
  const packChild = body2.packPurchases[0];
  expect(packChild.quantity).toBe(36);
  // 72000 / 6 = 12000 per box; per box / 36 = 333 per pack with residual.
  expect(packChild.costCents).toBe(Math.round(12000 / 36));
});
```

If `seedCatalogItem`/`seedPurchase` helpers don't exist in the test file yet, follow the pattern used by existing tests in this file — most likely direct `db.insert(...)` calls. Match the existing style.

- [ ] **Step 5.2: Run tests, verify they fail**

```bash
npx vitest run app/api/decompositions/route.test.ts
```

Expected: the new tests fail (cost split divides across all rows including the card; no `recipe_must_contain_sealed_row` rejection; no `circular_recipe` rejection). Existing tests should still pass since the field rename happens in the implementation step.

- [ ] **Step 5.3: Update the route implementation**

Replace `app/api/decompositions/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, and, count, asc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { decompositionInputSchema } from '@/lib/validation/decomposition';
import { computePerPackCost, computeCostSplitTotal } from '@/lib/services/decompositions';
import { DETERMINISTIC_DECOMPOSITION_TYPES } from '@/lib/services/tcgcsv';
import type { RecipeRow } from '@/lib/validation/decomposition';

// ---------------------------------------------------------------------------
// Recipe resolution
// ---------------------------------------------------------------------------

type ResolvedRecipe = {
  recipe: RecipeRow[];
  persisted: boolean;
  usedBody: boolean;
};

async function resolveRecipe(
  sourceItem: { id: number; productType: string | null; setCode: string | null; setName: string | null; packCount: number | null },
  bodyRecipe: RecipeRow[] | undefined
): Promise<ResolvedRecipe> {
  // 1. Use body recipe if provided.
  if (bodyRecipe && bodyRecipe.length > 0) {
    return { recipe: bodyRecipe, persisted: false, usedBody: true };
  }

  // 2. Check saved recipe.
  const saved = await db.query.catalogPackCompositions.findMany({
    where: eq(schema.catalogPackCompositions.sourceCatalogItemId, sourceItem.id),
    orderBy: [
      asc(schema.catalogPackCompositions.displayOrder),
      asc(schema.catalogPackCompositions.id),
    ],
  });
  if (saved.length > 0) {
    return {
      recipe: saved.map((r) => ({ contentsCatalogItemId: r.contentsCatalogItemId, quantity: r.quantity })),
      persisted: true,
      usedBody: false,
    };
  }

  // 3. Auto-derive for deterministic product types only.
  if (
    sourceItem.productType != null &&
    DETERMINISTIC_DECOMPOSITION_TYPES.has(sourceItem.productType) &&
    sourceItem.packCount != null
  ) {
    const packCandidates = await db.query.catalogItems.findMany({
      where: (ci, ops) =>
        ops.and(
          ops.eq(ci.kind, 'sealed'),
          ops.eq(ci.productType, 'Booster Pack'),
          sourceItem.setCode != null
            ? ops.eq(ci.setCode, sourceItem.setCode)
            : ops.and(ops.isNull(ci.setCode), ops.eq(ci.setName, sourceItem.setName ?? ''))
        ),
    });
    const packCatalog =
      packCandidates.length > 0
        ? [...packCandidates].sort((a, b) => a.name.length - b.name.length)[0]
        : null;
    if (packCatalog) {
      return {
        recipe: [{ contentsCatalogItemId: packCatalog.id, quantity: sourceItem.packCount }],
        persisted: false,
        usedBody: false,
      };
    }
  }

  return { recipe: [], persisted: false, usedBody: false };
}

// ---------------------------------------------------------------------------
// POST /api/decompositions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = decompositionInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

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
      { error: 'decompose source must be a sealed lot' },
      { status: 422 }
    );
  }
  if (sourceItem.productType === 'Booster Pack') {
    return NextResponse.json(
      { error: 'cannot decompose a Booster Pack into packs' },
      { status: 422 }
    );
  }

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

  const { recipe, persisted, usedBody } = await resolveRecipe(sourceItem, v.recipe);

  if (recipe.length === 0) {
    return NextResponse.json(
      {
        error: 'recipe_required',
        message: 'No saved or auto-derived recipe; provide a recipe in the request body.',
      },
      { status: 422 }
    );
  }

  // Validate every row's contents catalog item exists. Allow kind='sealed' OR
  // kind='card'. Reject self-referencing rows.
  const contentsCatalogMap = new Map<number, { id: number; name: string; kind: 'sealed' | 'card' }>();
  for (const row of recipe) {
    if (row.contentsCatalogItemId === sourceItem.id) {
      return NextResponse.json({ error: 'circular_recipe' }, { status: 422 });
    }
    if (!contentsCatalogMap.has(row.contentsCatalogItemId)) {
      const item = await db.query.catalogItems.findFirst({
        where: eq(schema.catalogItems.id, row.contentsCatalogItemId),
      });
      if (!item || (item.kind !== 'sealed' && item.kind !== 'card')) {
        return NextResponse.json(
          { error: 'invalid_contents_catalog', contentsCatalogItemId: row.contentsCatalogItemId },
          { status: 422 }
        );
      }
      contentsCatalogMap.set(item.id, { id: item.id, name: item.name, kind: item.kind });
    }
  }

  // Cost split: only sealed-kind rows enter the divisor.
  const costSplitTotal = computeCostSplitTotal(recipe, contentsCatalogMap);
  if (costSplitTotal === 0) {
    return NextResponse.json({ error: 'recipe_must_contain_sealed_row' }, { status: 422 });
  }
  const sourceCostCents = sourcePurchase.costCents;
  const { perPackCostCents, roundingResidualCents } = computePerPackCost(
    sourceCostCents,
    costSplitTotal
  );

  const today = new Date().toISOString().slice(0, 10);
  const decomposeDate = v.decomposeDate ?? today;

  try {
    const result = await db.transaction(async (tx) => {
      // Persist recipe when: caller supplied it (usedBody) OR auto-derived
      // (not yet persisted).
      if (usedBody || (!usedBody && !persisted)) {
        await tx
          .delete(schema.catalogPackCompositions)
          .where(
            eq(schema.catalogPackCompositions.sourceCatalogItemId, sourceItem.id)
          );
        for (let i = 0; i < recipe.length; i++) {
          await tx.insert(schema.catalogPackCompositions).values({
            sourceCatalogItemId: sourceItem.id,
            contentsCatalogItemId: recipe[i].contentsCatalogItemId,
            quantity: recipe[i].quantity,
            displayOrder: i,
          });
        }
      }

      const [decomposition] = await tx
        .insert(schema.boxDecompositions)
        .values({
          userId: user.id,
          sourcePurchaseId: sourcePurchase.id,
          decomposeDate,
          sourceCostCents,
          packCount: costSplitTotal,
          perPackCostCents,
          roundingResidualCents,
          notes: v.notes ?? null,
        })
        .returning();

      const packPurchases = [];
      for (const row of recipe) {
        const contents = contentsCatalogMap.get(row.contentsCatalogItemId)!;
        const childCostCents = contents.kind === 'card' ? 0 : perPackCostCents;
        const [child] = await tx
          .insert(schema.purchases)
          .values({
            userId: user.id,
            catalogItemId: row.contentsCatalogItemId,
            purchaseDate: decomposeDate,
            quantity: row.quantity,
            costCents: childCostCents,
            condition: null,
            isGraded: false,
            gradingCompany: null,
            grade: null,
            certNumber: null,
            unknownCost: sourcePurchase.unknownCost,
            source: null,
            location: null,
            notes: null,
            sourceDecompositionId: decomposition.id,
          })
          .returning();
        packPurchases.push(child);
      }

      return { decomposition, packPurchases };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'decomposition create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Key changes vs. current implementation:
- Validation accepts `kind === 'sealed' || kind === 'card'` (was sealed-only).
- New `circular_recipe` rejection.
- `costSplitTotal = computeCostSplitTotal(recipe, contentsCatalogMap)` — filters cards out of the divisor.
- New `recipe_must_contain_sealed_row` rejection when divisor is 0.
- Per-row child cost: `0` if card-kind, else `perPackCostCents`.
- Field rename `packCatalogItemId` → `contentsCatalogItemId` in saved-recipe insert.
- Response key `packPurchases` retained for backward compat with existing callers; semantically it's "child purchases" now.

- [ ] **Step 5.4: Run tests, verify pass**

```bash
npx vitest run app/api/decompositions/route.test.ts
```

Expected: all tests pass (existing + new).

- [ ] **Step 5.5: Run tsc**

```bash
npx tsc --noEmit
```

Expected: `app/api/decompositions/route.ts` is now type-clean. There may still be errors in other files (`app/api/catalog/[id]/composition/route.ts`, `lib/query/hooks/useDecompositions.ts`, etc.) — those get fixed in subsequent tasks. **Do NOT commit yet.**

---

## Task 6: GET /api/catalog/[id]/composition response shape

**Files:**
- Modify: `app/api/catalog/[id]/composition/route.ts`
- Modify: `app/api/catalog/[id]/composition/route.test.ts`

- [ ] **Step 6.1: Write failing tests for the new shape**

Append to `app/api/catalog/[id]/composition/route.test.ts` (preserve existing tests):

```ts
it('returns contentsKind and contentsProductType for each saved recipe row', async () => {
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const packItem = await seedCatalogItem({
    kind: 'sealed',
    productType: 'Booster Pack',
  });
  const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
  await db.insert(schema.catalogPackCompositions).values([
    {
      sourceCatalogItemId: sourceItem.id,
      contentsCatalogItemId: packItem.id,
      quantity: 3,
      displayOrder: 0,
    },
    {
      sourceCatalogItemId: sourceItem.id,
      contentsCatalogItemId: cardItem.id,
      quantity: 1,
      displayOrder: 1,
    },
  ]);

  const res = await GET(
    new NextRequest(`http://test/api/catalog/${sourceItem.id}/composition`),
    { params: Promise.resolve({ id: String(sourceItem.id) }) }
  );

  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.persisted).toBe(true);
  expect(body.recipe).toHaveLength(2);
  const pack = body.recipe.find(
    (r: { contentsCatalogItemId: number }) => r.contentsCatalogItemId === packItem.id
  );
  const card = body.recipe.find(
    (r: { contentsCatalogItemId: number }) => r.contentsCatalogItemId === cardItem.id
  );
  expect(pack.contentsKind).toBe('sealed');
  expect(pack.contentsProductType).toBe('Booster Pack');
  expect(card.contentsKind).toBe('card');
  expect(card.contentsProductType).toBeNull();
});
```

If existing tests reference field names like `packName`, `packSetName`, `packImageUrl`, `packCatalogItemId` — update them in this step too. The shape changes consistently.

- [ ] **Step 6.2: Update existing tests in this file to use new field names**

Search the file for `packCatalogItemId`, `packName`, `packSetName`, `packImageUrl` and rename to `contentsCatalogItemId`, `contentsName`, `contentsSetName`, `contentsImageUrl` everywhere they appear. Existing assertions that check the response shape must use the new names.

- [ ] **Step 6.3: Run tests, verify the new test fails**

```bash
npx vitest run app/api/catalog/[id]/composition/route.test.ts
```

Expected: new test fails (no `contentsKind`/`contentsProductType` in response). Existing tests fail (shape rename pending in implementation).

- [ ] **Step 6.4: Update the route implementation**

Replace the GET handler in `app/api/catalog/[id]/composition/route.ts` with the body below. Keep the file's existing imports and add the DELETE handler later in Task 7.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq, asc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { DETERMINISTIC_DECOMPOSITION_TYPES } from '@/lib/services/tcgcsv';

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

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const saved = await db.query.catalogPackCompositions.findMany({
    where: eq(schema.catalogPackCompositions.sourceCatalogItemId, numericId),
    orderBy: [
      asc(schema.catalogPackCompositions.displayOrder),
      asc(schema.catalogPackCompositions.id),
    ],
  });

  let recipe: Array<{
    contentsCatalogItemId: number;
    quantity: number;
    contentsName: string;
    contentsSetName: string | null;
    contentsImageUrl: string | null;
    contentsKind: 'sealed' | 'card';
    contentsProductType: string | null;
  }> | null = null;
  let persisted = false;
  let suggested = false;

  if (saved.length > 0) {
    persisted = true;
    const contentsIds = saved.map((r) => r.contentsCatalogItemId);
    const contents = await db.query.catalogItems.findMany({
      where: (ci, ops) => ops.inArray(ci.id, contentsIds),
    });
    const byId = new Map(contents.map((c) => [c.id, c]));
    recipe = saved.map((r) => {
      const c = byId.get(r.contentsCatalogItemId)!;
      return {
        contentsCatalogItemId: r.contentsCatalogItemId,
        quantity: r.quantity,
        contentsName: c.name,
        contentsSetName: c.setName,
        contentsImageUrl: c.imageUrl,
        contentsKind: c.kind,
        contentsProductType: c.productType,
      };
    });
  } else if (
    sourceItem.kind === 'sealed' &&
    sourceItem.productType != null &&
    DETERMINISTIC_DECOMPOSITION_TYPES.has(sourceItem.productType) &&
    sourceItem.packCount != null
  ) {
    const packCandidates = await db.query.catalogItems.findMany({
      where: (ci, ops) =>
        ops.and(
          ops.eq(ci.kind, 'sealed'),
          ops.eq(ci.productType, 'Booster Pack'),
          sourceItem.setCode != null
            ? ops.eq(ci.setCode, sourceItem.setCode)
            : ops.and(ops.isNull(ci.setCode), ops.eq(ci.setName, sourceItem.setName ?? ''))
        ),
    });
    const packCatalog =
      packCandidates.length > 0
        ? [...packCandidates].sort((a, b) => a.name.length - b.name.length)[0]
        : null;
    if (packCatalog) {
      suggested = true;
      recipe = [
        {
          contentsCatalogItemId: packCatalog.id,
          quantity: sourceItem.packCount,
          contentsName: packCatalog.name,
          contentsSetName: packCatalog.setName,
          contentsImageUrl: packCatalog.imageUrl,
          contentsKind: packCatalog.kind,
          contentsProductType: packCatalog.productType,
        },
      ];
    }
  }

  return NextResponse.json({
    sourceCatalogItemId: numericId,
    sourceName: sourceItem.name,
    sourcePackCount: sourceItem.packCount,
    sourceProductType: sourceItem.productType,
    recipe,
    persisted,
    suggested,
  });
}
```

- [ ] **Step 6.5: Run tests, verify pass**

```bash
npx vitest run app/api/catalog/[id]/composition/route.test.ts
```

Expected: all tests pass.

---

## Task 7: DELETE /api/catalog/[id]/composition

**Files:**
- Modify: `app/api/catalog/[id]/composition/route.ts`
- Modify: `app/api/catalog/[id]/composition/route.test.ts`

- [ ] **Step 7.1: Write failing tests for DELETE**

Append to `app/api/catalog/[id]/composition/route.test.ts`:

```ts
describe('DELETE /api/catalog/[id]/composition', () => {
  it('returns 401 when unauthenticated', async () => {
    setUserForTest(null);
    const res = await DELETE(
      new NextRequest('http://test/api/catalog/1/composition', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the catalog item does not exist', async () => {
    setUserForTest({ id: 'test-user' });
    const res = await DELETE(
      new NextRequest('http://test/api/catalog/99999/composition', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '99999' }) }
    );
    expect(res.status).toBe(404);
  });

  it('deletes all rows for the source and returns the count', async () => {
    setUserForTest({ id: 'test-user' });
    const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
    const packItem = await seedCatalogItem({
      kind: 'sealed',
      productType: 'Booster Pack',
    });
    const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
    await db.insert(schema.catalogPackCompositions).values([
      {
        sourceCatalogItemId: sourceItem.id,
        contentsCatalogItemId: packItem.id,
        quantity: 3,
        displayOrder: 0,
      },
      {
        sourceCatalogItemId: sourceItem.id,
        contentsCatalogItemId: cardItem.id,
        quantity: 1,
        displayOrder: 1,
      },
    ]);

    const res = await DELETE(
      new NextRequest(`http://test/api/catalog/${sourceItem.id}/composition`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: String(sourceItem.id) }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);

    const remaining = await db.query.catalogPackCompositions.findMany({
      where: eq(schema.catalogPackCompositions.sourceCatalogItemId, sourceItem.id),
    });
    expect(remaining).toHaveLength(0);
  });

  it('is idempotent — empty source returns deleted: 0', async () => {
    setUserForTest({ id: 'test-user' });
    const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });

    const res = await DELETE(
      new NextRequest(`http://test/api/catalog/${sourceItem.id}/composition`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: String(sourceItem.id) }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(0);
  });

  it('does not affect existing box_decompositions rows', async () => {
    setUserForTest({ id: 'test-user' });
    const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
    const packItem = await seedCatalogItem({
      kind: 'sealed',
      productType: 'Booster Pack',
    });
    await db.insert(schema.catalogPackCompositions).values({
      sourceCatalogItemId: sourceItem.id,
      contentsCatalogItemId: packItem.id,
      quantity: 3,
      displayOrder: 0,
    });
    const sourcePurchase = await seedPurchase({
      catalogItemId: sourceItem.id,
      quantity: 1,
      costCents: 6000,
    });
    const [decomp] = await db
      .insert(schema.boxDecompositions)
      .values({
        userId: 'test-user',
        sourcePurchaseId: sourcePurchase.id,
        decomposeDate: '2026-05-02',
        sourceCostCents: 6000,
        packCount: 3,
        perPackCostCents: 2000,
        roundingResidualCents: 0,
      })
      .returning();

    await DELETE(
      new NextRequest(`http://test/api/catalog/${sourceItem.id}/composition`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: String(sourceItem.id) }) }
    );

    const stillThere = await db.query.boxDecompositions.findFirst({
      where: eq(schema.boxDecompositions.id, decomp.id),
    });
    expect(stillThere).toBeDefined();
  });
});
```

You'll need to import `DELETE` from the route. Update the test file's top-level import:

```ts
import { GET, DELETE } from './route';
```

Match whatever `setUserForTest` / `seedCatalogItem` / `seedPurchase` helpers exist already in the test file. If they don't exist, follow the seed pattern used by `app/api/decompositions/route.test.ts`.

- [ ] **Step 7.2: Run tests, verify failure**

```bash
npx vitest run app/api/catalog/[id]/composition/route.test.ts
```

Expected: import error or "DELETE is not a function".

- [ ] **Step 7.3: Add the DELETE handler**

Append to `app/api/catalog/[id]/composition/route.ts`:

```ts
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

  const sourceItem = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!sourceItem) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const result = await db
    .delete(schema.catalogPackCompositions)
    .where(eq(schema.catalogPackCompositions.sourceCatalogItemId, numericId))
    .returning({ id: schema.catalogPackCompositions.id });

  return NextResponse.json({ deleted: result.length });
}
```

- [ ] **Step 7.4: Run tests, verify pass**

```bash
npx vitest run app/api/catalog/[id]/composition/route.test.ts
```

Expected: all tests pass.

---

## Task 8: GET /api/decompositions/[id] returns ALL children + DELETE checks ALL children

**Files:**
- Modify: `app/api/decompositions/[id]/route.ts`
- Modify: `app/api/decompositions/[id]/route.test.ts` (create if absent)

- [ ] **Step 8.1: Check whether the test file exists, create with skeleton if not**

```bash
ls app/api/decompositions/[id]/route.test.ts
```

If it doesn't exist, create it with the following skeleton:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, DELETE } from './route';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
// Match the helpers used by app/api/decompositions/route.test.ts:
import { resetDb, seedCatalogItem, seedPurchase, setUserForTest } from '@/test/helpers';

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/decompositions/[id]', () => {
  // tests in next step
});

describe('DELETE /api/decompositions/[id]', () => {
  // tests in next step
});
```

(Adjust the helper import path to match what `app/api/decompositions/route.test.ts` uses.)

- [ ] **Step 8.2: Write failing tests**

Add inside the `describe('GET ...')` block:

```ts
it('returns ALL child purchases (mixed packs + cards)', async () => {
  setUserForTest({ id: 'test-user' });
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const packItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Pack' });
  const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 6000,
  });
  const [decomp] = await db
    .insert(schema.boxDecompositions)
    .values({
      userId: 'test-user',
      sourcePurchaseId: sourcePurchase.id,
      decomposeDate: '2026-05-02',
      sourceCostCents: 6000,
      packCount: 3,
      perPackCostCents: 2000,
      roundingResidualCents: 0,
    })
    .returning();
  await db.insert(schema.purchases).values([
    {
      userId: 'test-user',
      catalogItemId: packItem.id,
      purchaseDate: '2026-05-02',
      quantity: 3,
      costCents: 2000,
      sourceDecompositionId: decomp.id,
    },
    {
      userId: 'test-user',
      catalogItemId: cardItem.id,
      purchaseDate: '2026-05-02',
      quantity: 1,
      costCents: 0,
      sourceDecompositionId: decomp.id,
    },
  ]);

  const res = await GET(new NextRequest(`http://test/api/decompositions/${decomp.id}`), {
    params: Promise.resolve({ id: String(decomp.id) }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.childPurchases).toHaveLength(2);
  expect(body.childCatalogItems).toHaveLength(2);
  const packChild = body.childPurchases.find(
    (p: { catalogItemId: number }) => p.catalogItemId === packItem.id
  );
  const cardChild = body.childPurchases.find(
    (p: { catalogItemId: number }) => p.catalogItemId === cardItem.id
  );
  expect(packChild.costCents).toBe(2000);
  expect(cardChild.costCents).toBe(0);
});
```

Add inside the `describe('DELETE ...')` block:

```ts
it('blocks undo when ANY child has linked sales (not just the first)', async () => {
  setUserForTest({ id: 'test-user' });
  const sourceItem = await seedCatalogItem({ kind: 'sealed', productType: 'Mega ex Box' });
  const packItem = await seedCatalogItem({ kind: 'sealed', productType: 'Booster Pack' });
  const cardItem = await seedCatalogItem({ kind: 'card', productType: null });
  const sourcePurchase = await seedPurchase({
    catalogItemId: sourceItem.id,
    quantity: 1,
    costCents: 6000,
  });
  const [decomp] = await db
    .insert(schema.boxDecompositions)
    .values({
      userId: 'test-user',
      sourcePurchaseId: sourcePurchase.id,
      decomposeDate: '2026-05-02',
      sourceCostCents: 6000,
      packCount: 3,
      perPackCostCents: 2000,
      roundingResidualCents: 0,
    })
    .returning();
  // Insert pack child FIRST, card child SECOND. Then sell the card child.
  // Pre-fix bug: the route's `findFirst(...)` only inspected one child; if it
  // happened to land on the pack and miss the card's sale, undo would proceed.
  const [packChild] = await db
    .insert(schema.purchases)
    .values({
      userId: 'test-user',
      catalogItemId: packItem.id,
      purchaseDate: '2026-05-02',
      quantity: 3,
      costCents: 2000,
      sourceDecompositionId: decomp.id,
    })
    .returning();
  const [cardChild] = await db
    .insert(schema.purchases)
    .values({
      userId: 'test-user',
      catalogItemId: cardItem.id,
      purchaseDate: '2026-05-02',
      quantity: 1,
      costCents: 0,
      sourceDecompositionId: decomp.id,
    })
    .returning();
  await db.insert(schema.sales).values({
    userId: 'test-user',
    purchaseId: cardChild.id,
    saleDate: '2026-05-02',
    quantity: 1,
    salePriceCents: 500,
    feesCents: 0,
  });
  // Suppress unused warning — packChild seeded so the linked-sales check has
  // multiple children to scan.
  void packChild;

  const res = await DELETE(
    new NextRequest(`http://test/api/decompositions/${decomp.id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id: String(decomp.id) }) }
  );
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.error).toMatch(/linked sales/i);
});
```

- [ ] **Step 8.3: Run tests, verify failure**

```bash
npx vitest run app/api/decompositions/[id]/route.test.ts
```

Expected: GET test fails because response uses `packPurchase` (singular) and `packCatalogItem`. DELETE test may pass or fail depending on which child the existing `findFirst` lands on (Postgres ordering is unspecified without ORDER BY) — either way, the implementation is broken.

- [ ] **Step 8.4: Update the route implementation**

Replace `app/api/decompositions/[id]/route.ts` with:

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

  const childPurchases = await db.query.purchases.findMany({
    where: and(
      eq(schema.purchases.sourceDecompositionId, decomposition.id),
      isNull(schema.purchases.deletedAt)
    ),
    orderBy: (p, ops) => [ops.asc(p.id)],
  });
  const childCatalogIds = childPurchases.map((p) => p.catalogItemId);
  const childCatalogItems =
    childCatalogIds.length > 0
      ? await db.query.catalogItems.findMany({
          where: (ci, ops) => ops.inArray(ci.id, childCatalogIds),
        })
      : [];

  return NextResponse.json({
    decomposition,
    sourcePurchase,
    sourceCatalogItem,
    childPurchases,
    childCatalogItems,
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

  // Find ALL child purchases of this decomposition (was findFirst — bug).
  const children = await db.query.purchases.findMany({
    where: eq(schema.purchases.sourceDecompositionId, numericId),
  });
  const childIds = children.map((c) => c.id);

  if (childIds.length > 0) {
    const { data: linkedRips, error: ripsErr } = await supabase
      .from('rips')
      .select('id')
      .in('source_purchase_id', childIds);
    if (ripsErr) {
      return NextResponse.json({ error: ripsErr.message }, { status: 500 });
    }
    if (linkedRips && linkedRips.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked rips on its children',
          linkedRipIds: linkedRips.map((r) => r.id),
        },
        { status: 409 }
      );
    }

    const { data: linkedSales, error: salesErr } = await supabase
      .from('sales')
      .select('id')
      .in('purchase_id', childIds);
    if (salesErr) {
      return NextResponse.json({ error: salesErr.message }, { status: 500 });
    }
    if (linkedSales && linkedSales.length > 0) {
      return NextResponse.json(
        {
          error: 'decomposition has linked sales on its children',
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

Key changes:
- GET: response shape `packPurchase` (singular) → `childPurchases` (array); `packCatalogItem` (singular) → `childCatalogItems` (array). Children fetched with `findMany` ordered by id.
- DELETE: linked-rips / linked-sales scan uses `.in('source_purchase_id', childIds)` / `.in('purchase_id', childIds)` instead of single-id `.eq(...)`. Error messages updated from "on its packs" to "on its children".

- [ ] **Step 8.5: Run tests, verify pass**

```bash
npx vitest run app/api/decompositions/[id]/route.test.ts
```

Expected: all tests pass (existing + new).

---

## Task 9: Hooks update + commit fence

**Files:**
- Modify: `lib/query/hooks/useDecompositions.ts`

- [ ] **Step 9.1: Update the hooks file**

Replace `lib/query/hooks/useDecompositions.ts` with:

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
  childPurchases: Array<{
    id: number;
    catalogItemId: number;
    quantity: number;
    costCents: number;
    unknownCost: boolean;
  }>;
  childCatalogItems: Array<{
    id: number;
    name: string;
    imageUrl: string | null;
    setName: string | null;
    kind: 'sealed' | 'card';
    productType: string | null;
  }>;
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
  qc.invalidateQueries({ queryKey: ['catalogComposition'] });
  for (const id of affectedCatalogIds) {
    qc.invalidateQueries({ queryKey: ['holding', id] });
  }
}

export function useCreateDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: DecompositionInput & {
        // Caller passes the source container's catalog id. The created
        // children's catalog ids are returned by the API and used for
        // per-holding cache invalidation in onSuccess.
        _sourceCatalogItemId: number;
      }
    ) => {
      const { _sourceCatalogItemId: _src, ...body } = payload;
      const res = await fetch('/api/decompositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json<{
        decomposition: { id: number };
        packPurchases: Array<{ id: number; catalogItemId: number }>;
      }>(res);
    },
    onSuccess: (data, variables) => {
      const childIds = data.packPurchases.map((p) => p.catalogItemId);
      invalidateAfterDecompositionMutation(qc, [
        variables._sourceCatalogItemId,
        ...childIds,
      ]);
    },
  });
}

export type CatalogCompositionDto = {
  sourceCatalogItemId: number;
  sourceName: string;
  sourcePackCount: number | null;
  sourceProductType: string | null;
  recipe: Array<{
    contentsCatalogItemId: number;
    quantity: number;
    contentsName: string;
    contentsSetName: string | null;
    contentsImageUrl: string | null;
    contentsKind: 'sealed' | 'card';
    contentsProductType: string | null;
  }> | null;
  persisted: boolean;
  suggested: boolean;
};

export function useCatalogComposition(catalogItemId: number | null) {
  return useQuery({
    queryKey: ['catalogComposition', catalogItemId],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/composition`);
      return json<CatalogCompositionDto>(res);
    },
    enabled: catalogItemId != null && Number.isFinite(catalogItemId),
  });
}

export function useClearCatalogComposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (catalogItemId: number) => {
      const res = await fetch(`/api/catalog/${catalogItemId}/composition`, {
        method: 'DELETE',
      });
      return json<{ deleted: number }>(res);
    },
    onSuccess: (_data, catalogItemId) => {
      qc.invalidateQueries({ queryKey: ['catalogComposition', catalogItemId] });
    },
  });
}

export function useDeleteDecomposition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
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

Key changes vs. current:
- `DecompositionDetailDto`: `packPurchase` (single, optional) → `childPurchases` (array); `packCatalogItem` (single, optional) → `childCatalogItems` (array, with `kind` and `productType`).
- `useCreateDecomposition` payload drops the `_packCatalogItemId` legacy compat field. `onSuccess` derives child catalog ids from the API response.
- `CatalogCompositionDto.recipe[*]` field renames `pack*` → `contents*`, adds `contentsKind` and `contentsProductType`.
- New `useClearCatalogComposition()` mutation.

- [ ] **Step 9.2: Run tsc — confirm clean**

```bash
npx tsc --noEmit
```

Expected: clean. If errors remain, they're in OpenBoxDialog or OpenBoxDetailDialog — those get fixed in Tasks 10 and 11. **DO NOT commit yet.** Continue to Task 10. (We've held the commit fence since Task 2 because the schema rename touches multiple files; one big commit at the end of Task 11 covers everything.)

---

## Task 10: OpenBoxDialog — drop picker filter, banner, Clear button, mixed-recipe preview

**Files:**
- Modify: `components/decompositions/OpenBoxDialog.tsx`
- Modify: `components/decompositions/OpenBoxDialog.test.tsx`

- [ ] **Step 10.1: Add failing tests**

Append to `components/decompositions/OpenBoxDialog.test.tsx` (preserve existing tests):

```ts
it('search picker shows card results, not just Booster Packs', async () => {
  // Mock /api/search to return both a pack and a card result.
  vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    const u = String(url);
    if (u.startsWith('/api/search?')) {
      return new Response(
        JSON.stringify({
          results: [
            {
              catalogItemId: 100,
              name: 'Mega Pikachu Promo',
              setName: 'Mega Evolution',
              productType: null,
              kind: 'card',
              imageUrl: null,
            },
            {
              catalogItemId: 200,
              name: 'Mega Booster Pack',
              setName: 'Mega Evolution',
              productType: 'Booster Pack',
              kind: 'sealed',
              imageUrl: null,
            },
          ],
        }),
        { status: 200 }
      );
    }
    if (u.startsWith('/api/catalog/')) {
      return new Response(
        JSON.stringify({
          recipe: null,
          persisted: false,
          suggested: false,
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 200 });
  });

  render(<OpenBoxDialogHarness />);
  await userEvent.click(screen.getByRole('button', { name: /search for a/i }));
  await userEvent.type(screen.getByPlaceholderText(/search/i), 'mega');
  await waitFor(() => {
    expect(screen.getByText('Mega Pikachu Promo')).toBeInTheDocument();
    expect(screen.getByText('Mega Booster Pack')).toBeInTheDocument();
  });
});

it('shows the persisted-recipe banner when composition.persisted is true', async () => {
  mockComposition({
    persisted: true,
    suggested: false,
    recipe: [
      {
        contentsCatalogItemId: 200,
        quantity: 3,
        contentsName: 'Mega Booster Pack',
        contentsSetName: 'Mega Evolution',
        contentsImageUrl: null,
        contentsKind: 'sealed',
        contentsProductType: 'Booster Pack',
      },
    ],
  });
  render(<OpenBoxDialogHarness />);
  expect(
    await screen.findByText(/saved recipe.*update future opens/i)
  ).toBeInTheDocument();
});

it('shows the suggested-recipe banner when composition.suggested is true', async () => {
  mockComposition({
    persisted: false,
    suggested: true,
    recipe: [
      {
        contentsCatalogItemId: 200,
        quantity: 36,
        contentsName: 'SV151 Booster Pack',
        contentsSetName: 'Scarlet & Violet 151',
        contentsImageUrl: null,
        contentsKind: 'sealed',
        contentsProductType: 'Booster Pack',
      },
    ],
  });
  render(<OpenBoxDialogHarness />);
  expect(
    await screen.findByText(/suggested.*first edit will save/i)
  ).toBeInTheDocument();
});

it('shows the new-recipe banner when no saved or suggested recipe', async () => {
  mockComposition({ persisted: false, suggested: false, recipe: null });
  render(<OpenBoxDialogHarness />);
  expect(
    await screen.findByText(/build the recipe.*first save sticks/i)
  ).toBeInTheDocument();
});

it('Clear saved recipe button calls DELETE and refetches', async () => {
  const deleteSpy = vi.fn().mockResolvedValue({ deleted: 1 });
  mockComposition({
    persisted: true,
    suggested: false,
    recipe: [
      {
        contentsCatalogItemId: 200,
        quantity: 3,
        contentsName: 'Wrong Pack',
        contentsSetName: null,
        contentsImageUrl: null,
        contentsKind: 'sealed',
        contentsProductType: 'Booster Pack',
      },
    ],
  });
  vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes('/composition') && init?.method === 'DELETE') {
      const r = await deleteSpy();
      return new Response(JSON.stringify(r), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  });

  render(<OpenBoxDialogHarness />);
  await userEvent.click(await screen.findByRole('button', { name: /clear saved recipe/i }));
  await userEvent.click(screen.getByRole('button', { name: /^clear$/i })); // confirm
  await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
});

it('preview labels card rows as "promo (no cost)" and disables submit when all rows are cards', async () => {
  // Submit gating: when costSplitTotal === 0, the dialog should disable submit
  // and surface inline error.
  mockComposition({ persisted: false, suggested: false, recipe: null });
  render(<OpenBoxDialogHarness />);
  // Use a test hook on the dialog or the picker to add a card row directly;
  // see existing tests for the pattern. After adding two card rows, the
  // submit button should be disabled and the preview should NOT show
  // perPackCost.
  // ...
});
```

The exact test harness (`OpenBoxDialogHarness`, `mockComposition`) follows whatever pattern your existing `OpenBoxDialog.test.tsx` uses — read it before writing these. The point is the assertions on banner text, picker results, and the Clear flow.

- [ ] **Step 10.2: Run tests, verify failure**

```bash
npx vitest run components/decompositions/OpenBoxDialog.test.tsx
```

Expected: new tests fail; existing tests may also fail because the dialog uses `_packCatalogItemId` (removed in Task 9) and old DTO field names.

- [ ] **Step 10.3: Update the dialog implementation**

Replace `components/decompositions/OpenBoxDialog.tsx` with:

```tsx
'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useCreateDecomposition,
  useCatalogComposition,
  useClearCatalogComposition,
} from '@/lib/query/hooks/useDecompositions';
import { computePerPackCost } from '@/lib/services/decompositions';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormHint,
  DialogActions,
} from '@/components/ui/dialog-form';

export type OpenBoxSourceLot = {
  purchaseId: number;
  catalogItemId: number;
  name: string;
  productType: string;
  imageUrl: string | null;
  packCount: number | null;
  sourceCostCents: number;
  setCode: string | null;
  setName: string | null;
};

type RecipeRowState = {
  contentsCatalogItemId: number;
  contentsName: string;
  contentsSetName: string | null;
  contentsImageUrl: string | null;
  contentsKind: 'sealed' | 'card';
  contentsProductType: string | null;
  quantity: number;
};

type SearchResult = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
};

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
  const [recipe, setRecipe] = useState<RecipeRowState[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const createMutation = useCreateDecomposition();
  const clearMutation = useClearCatalogComposition();
  const composition = useCatalogComposition(source.catalogItemId);

  // Pre-populate recipe from saved/suggested composition.
  useEffect(() => {
    if (composition.data?.recipe) {
      setRecipe(
        composition.data.recipe.map((r) => ({
          contentsCatalogItemId: r.contentsCatalogItemId,
          contentsName: r.contentsName,
          contentsSetName: r.contentsSetName,
          contentsImageUrl: r.contentsImageUrl,
          contentsKind: r.contentsKind,
          contentsProductType: r.contentsProductType,
          quantity: r.quantity,
        }))
      );
    } else {
      setRecipe([]);
    }
  }, [composition.data]);

  const search = useQuery({
    queryKey: ['contentsSearch', searchQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}&kind=all`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ results: Array<SearchResult> }>;
    },
    enabled: showPicker && searchQuery.length >= 2,
    staleTime: 30_000,
  });

  // No client-side filter — the API now returns mixed kinds and we accept all.
  const searchResults = search.data?.results ?? [];

  const addContents = (hit: SearchResult) => {
    setRecipe((prev) => {
      const existing = prev.findIndex((r) => r.contentsCatalogItemId === hit.catalogItemId);
      if (existing !== -1) {
        return prev.map((r, i) =>
          i === existing ? { ...r, quantity: r.quantity + 1 } : r
        );
      }
      return [
        ...prev,
        {
          contentsCatalogItemId: hit.catalogItemId,
          contentsName: hit.name,
          contentsSetName: hit.setName,
          contentsImageUrl: hit.imageUrl,
          contentsKind: hit.kind,
          contentsProductType: hit.productType,
          quantity: 1,
        },
      ];
    });
    setShowPicker(false);
    setSearchQuery('');
  };

  const updateQuantity = (idx: number, qty: number) => {
    const clamped = Math.max(1, Math.min(99, qty));
    setRecipe((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: clamped } : r)));
  };

  const removeRow = (idx: number) => {
    setRecipe((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalItems = recipe.reduce((s, r) => s + r.quantity, 0);
  const costSplitTotal = recipe
    .filter((r) => r.contentsKind === 'sealed')
    .reduce((s, r) => s + r.quantity, 0);
  const { perPackCostCents, roundingResidualCents } =
    costSplitTotal > 0
      ? computePerPackCost(source.sourceCostCents, costSplitTotal)
      : { perPackCostCents: 0, roundingResidualCents: 0 };

  const compositionLoaded = !composition.isLoading;
  const isPersisted = compositionLoaded && composition.data?.persisted === true;
  const isSuggested = compositionLoaded && composition.data?.suggested === true;

  const isSubmitDisabled =
    recipe.length === 0 ||
    costSplitTotal === 0 ||
    createMutation.isPending ||
    composition.isLoading ||
    clearMutation.isPending;

  const handleSubmit = async () => {
    setError(null);
    if (recipe.length === 0) {
      setError('Add at least one item to the recipe.');
      return;
    }
    if (costSplitTotal === 0) {
      setError('Recipe must contain at least one sealed item (e.g., a Booster Pack).');
      return;
    }
    try {
      await createMutation.mutateAsync({
        sourcePurchaseId: source.purchaseId,
        notes: notes || null,
        recipe: recipe.map((r) => ({
          contentsCatalogItemId: r.contentsCatalogItemId,
          quantity: r.quantity,
        })),
        _sourceCatalogItemId: source.catalogItemId,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decomposition failed');
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await clearMutation.mutateAsync(source.catalogItemId);
      setConfirmingClear(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'clear recipe failed');
    }
  };

  const banner = isPersisted
    ? 'Saved recipe — your edits update future opens'
    : isSuggested
    ? 'Suggested recipe — first edit will save'
    : 'Build the recipe — first save sticks for future opens';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <VaultDialogHeader
          title="Open box"
          sub="Pick the items inside; the cost basis splits evenly across sealed contents."
        />

        {/* Source info card */}
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
              {source.productType}
              {totalItems > 0
                ? ` · ${totalItems} item${totalItems === 1 ? '' : 's'} in recipe`
                : ''}
            </div>
            <div className="text-xs text-muted-foreground">
              Cost basis: {formatCents(source.sourceCostCents)}
            </div>
          </div>
        </div>

        {/* Recipe state banner */}
        {compositionLoaded && (
          <p className="text-xs text-muted-foreground">{banner}</p>
        )}

        {/* Pack contents section */}
        <FormSection>
          <div className="flex items-center justify-between">
            <FormLabel>Contents</FormLabel>
            <div className="flex items-center gap-1">
              {recipe.length > 0 && !showPicker && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowPicker(true)}
                >
                  Edit contents
                </Button>
              )}
              {isPersisted && !confirmingClear && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setConfirmingClear(true)}
                  disabled={clearMutation.isPending}
                >
                  Clear saved recipe
                </Button>
              )}
            </div>
          </div>

          {/* Inline confirm bar for Clear */}
          {confirmingClear && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <span>
                Clear the saved recipe? Existing decompositions and lots are unaffected.
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingClear(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleClear}
                  disabled={clearMutation.isPending}
                >
                  {clearMutation.isPending ? 'Clearing...' : 'Clear'}
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {recipe.length === 0 && !isSuggested && !isPersisted && !showPicker && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              <p>
                This is the first time opening this product. Add the items it contains:
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setShowPicker(true)}
              >
                Search for an item
              </Button>
            </div>
          )}

          {/* Recipe rows */}
          {recipe.length > 0 && (
            <div className="space-y-1">
              {recipe.map((row, idx) => (
                <div
                  key={row.contentsCatalogItemId}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  {row.contentsImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.contentsImageUrl}
                      alt={row.contentsName}
                      className="h-8 w-8 rounded object-contain"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.contentsName}</div>
                    {row.contentsSetName && (
                      <div className="text-xs text-muted-foreground">
                        {row.contentsSetName}
                        {row.contentsKind === 'card' ? ' · promo' : ''}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={row.quantity}
                    onChange={(e) => updateQuantity(idx, parseInt(e.target.value, 10) || 1)}
                    className="w-14 rounded-md border bg-background px-2 py-1 text-center text-sm"
                    aria-label={`Quantity for ${row.contentsName}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label={`Remove ${row.contentsName}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Search picker */}
          {showPicker && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for a pack, box, or card..."
                  className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPicker(false);
                    setSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
              </div>
              {search.isLoading && (
                <p className="text-xs text-muted-foreground">Searching...</p>
              )}
              {searchQuery.length >= 2 && !search.isLoading && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No matches. Try a different search term.
                </p>
              )}
              {searchResults.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {searchResults.map((hit) => (
                    <li key={hit.catalogItemId}>
                      <button
                        type="button"
                        onClick={() => addContents(hit)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {hit.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={hit.imageUrl}
                            alt={hit.name}
                            className="h-8 w-8 rounded object-contain"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{hit.name}</div>
                          {hit.setName && (
                            <div className="text-xs text-muted-foreground">
                              {hit.setName}
                              {hit.kind === 'card'
                                ? ' · card'
                                : hit.productType
                                ? ` · ${hit.productType}`
                                : ''}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </FormSection>

        {/* Cost preview */}
        {recipe.length > 0 && (
          <div className="rounded-md border p-3 text-sm" data-testid="decomp-preview">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              This will create new lots:
            </div>
            <div className="mt-1 space-y-0.5">
              {recipe.map((row) => (
                <div key={row.contentsCatalogItemId} className="font-medium">
                  {row.quantity} x {row.contentsName}
                  {row.contentsSetName ? ` (${row.contentsSetName})` : ''}
                  {' — '}
                  {row.contentsKind === 'card' ? (
                    <span className="font-normal text-muted-foreground">promo (no cost)</span>
                  ) : (
                    <span className="font-normal" data-testid="decomp-per-pack">
                      at {formatCents(perPackCostCents)} each
                    </span>
                  )}
                </div>
              ))}
            </div>
            {costSplitTotal > 0 && (
              <div className="mt-1 text-xs">
                rounding residual:{' '}
                <span data-testid="decomp-residual">
                  {formatCentsSigned(roundingResidualCents)}
                </span>
              </div>
            )}
            {totalItems > 0 && (
              <FormHint>
                Source: {totalItems} item{totalItems === 1 ? '' : 's'} in recipe
                {costSplitTotal !== totalItems
                  ? ` (${costSplitTotal} cost-split)`
                  : ''}
              </FormHint>
            )}
          </div>
        )}

        {/* Notes */}
        <FormSection>
          <FormLabel>Notes (optional)</FormLabel>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={2}
            className="block w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </FormSection>

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{error}</p>
          </div>
        )}

        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitDisabled}>
            {createMutation.isPending ? 'Opening...' : 'Open box'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10.4: Run tests, verify pass**

```bash
npx vitest run components/decompositions/OpenBoxDialog.test.tsx
```

Expected: all tests pass.

---

## Task 11: OpenBoxDetailDialog renders the list of children

**Files:**
- Modify: `components/decompositions/OpenBoxDetailDialog.tsx`
- Modify: `components/decompositions/OpenBoxDetailDialog.test.tsx` (create if absent)

- [ ] **Step 11.1: Check whether the test file exists; create skeleton if not**

```bash
ls components/decompositions/OpenBoxDetailDialog.test.tsx
```

If it doesn't exist, create with:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OpenBoxDetailDialog } from './OpenBoxDetailDialog';

const renderWithProviders = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const baseDecomposition = {
  id: 1,
  userId: 'test',
  sourcePurchaseId: 1,
  decomposeDate: '2026-05-02',
  sourceCostCents: 6000,
  packCount: 3,
  perPackCostCents: 2000,
  roundingResidualCents: 0,
  notes: null,
  createdAt: '2026-05-02T00:00:00Z',
};

describe('OpenBoxDetailDialog', () => {
  // tests in next step
});
```

- [ ] **Step 11.2: Add failing test**

Inside the `describe`:

```ts
it('renders multiple children with kind labels', async () => {
  vi.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (String(url).includes('/api/decompositions/1')) {
      return new Response(
        JSON.stringify({
          decomposition: baseDecomposition,
          sourcePurchase: null,
          sourceCatalogItem: { id: 99, name: 'Mega ex Box', imageUrl: null, setName: null, productType: 'Mega ex Box' },
          childPurchases: [
            { id: 10, catalogItemId: 1, quantity: 3, costCents: 2000, unknownCost: false },
            { id: 11, catalogItemId: 2, quantity: 1, costCents: 0, unknownCost: false },
          ],
          childCatalogItems: [
            { id: 1, name: 'Mega Booster Pack', imageUrl: null, setName: null, kind: 'sealed', productType: 'Booster Pack' },
            { id: 2, name: 'Mega Pikachu Promo', imageUrl: null, setName: null, kind: 'card', productType: null },
          ],
        }),
        { status: 200 }
      );
    }
    return new Response('{}', { status: 200 });
  });

  renderWithProviders(
    <OpenBoxDetailDialog open={true} onOpenChange={() => {}} decompositionId={1} />
  );
  expect(await screen.findByText(/Mega Booster Pack/)).toBeInTheDocument();
  expect(await screen.findByText(/Mega Pikachu Promo/)).toBeInTheDocument();
  // Card row should be marked as promo:
  expect(await screen.findByText(/promo/i)).toBeInTheDocument();
});
```

- [ ] **Step 11.3: Run test, verify failure**

```bash
npx vitest run components/decompositions/OpenBoxDetailDialog.test.tsx
```

Expected: test fails — current dialog renders only `packCatalogItem` (singular).

- [ ] **Step 11.4: Update the detail dialog**

Replace `components/decompositions/OpenBoxDetailDialog.tsx` with:

```tsx
'use client';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  useDecomposition,
  useDeleteDecomposition,
} from '@/lib/query/hooks/useDecompositions';
import { formatCents, formatCentsSigned } from '@/lib/utils/format';
import {
  VaultDialogHeader,
  FormSection,
  DialogActions,
} from '@/components/ui/dialog-form';

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
        'Undo this decomposition? All resulting lots will be soft-deleted and the source qty re-credited.'
      )
    ) {
      return;
    }
    const affected = [
      ...(data.sourceCatalogItem ? [data.sourceCatalogItem.id] : []),
      ...data.childCatalogItems.map((c) => c.id),
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
        <VaultDialogHeader
          title="Decomposition details"
          sub="Review the open-box event, then optionally undo it."
        />

        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded bg-muted" />
        ) : (
          <div className="space-y-4">
            <FormSection>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Source</div>
                <div className="font-medium">{data.sourceCatalogItem?.name ?? '(deleted)'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Opened {data.decomposition.decomposeDate} · Cost basis{' '}
                  {formatCents(data.decomposition.sourceCostCents)}
                </div>
              </div>
            </FormSection>

            <FormSection>
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Resulting lots
                </div>
                <div className="mt-1 space-y-1">
                  {data.childPurchases.length === 0 && (
                    <div className="text-muted-foreground">(no children)</div>
                  )}
                  {data.childPurchases.map((child) => {
                    const item = data.childCatalogItems.find(
                      (c) => c.id === child.catalogItemId
                    );
                    const isCard = item?.kind === 'card';
                    return (
                      <div key={child.id} className="font-medium">
                        {child.quantity} x {item?.name ?? '(deleted)'}
                        {isCard ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            promo
                          </span>
                        ) : (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            at {formatCents(child.costCents)} each
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Cost-split divisor: {data.decomposition.packCount} · per-unit{' '}
                  {formatCents(data.decomposition.perPackCostCents)} · rounding residual{' '}
                  {formatCentsSigned(data.decomposition.roundingResidualCents)}
                </div>
              </div>
            </FormSection>

            {data.decomposition.notes && (
              <FormSection>
                <div className="rounded-md border p-3 text-sm">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Notes</div>
                  <div className="whitespace-pre-wrap">{data.decomposition.notes}</div>
                </div>
              </FormSection>
            )}
          </div>
        )}

        <DialogActions>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleUndo}
            disabled={undoMutation.isPending || !data}
          >
            {undoMutation.isPending ? 'Undoing...' : 'Undo decomposition'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 11.5: Run tests, verify pass**

```bash
npx vitest run components/decompositions/OpenBoxDetailDialog.test.tsx
```

Expected: all tests pass.

- [ ] **Step 11.6: Run full test suite + tsc**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: full suite green; tsc clean.

- [ ] **Step 11.7: Commit (this covers Tasks 2–11)**

```bash
git add lib/db/schema/catalogPackCompositions.ts \
        lib/validation/decomposition.ts \
        lib/services/decompositions.ts \
        lib/services/decompositions.test.ts \
        app/api/decompositions/route.ts \
        app/api/decompositions/route.test.ts \
        app/api/decompositions/[id]/route.ts \
        app/api/decompositions/[id]/route.test.ts \
        app/api/catalog/[id]/composition/route.ts \
        app/api/catalog/[id]/composition/route.test.ts \
        lib/query/hooks/useDecompositions.ts \
        components/decompositions/OpenBoxDialog.tsx \
        components/decompositions/OpenBoxDialog.test.tsx \
        components/decompositions/OpenBoxDetailDialog.tsx \
        components/decompositions/OpenBoxDetailDialog.test.tsx

git commit -m "feat(plan-9): card rows in recipes, two-stage decomposition, recipe reset UX"
```

- [ ] **Step 11.8: Push to origin**

```bash
git push origin main
```

---

## Task 12: Build verification + ship-time migration

**Files:**
- None.

- [ ] **Step 12.1: Run npm run build**

```bash
npm run build
```

Expected: build completes with no errors. Static export passes.

- [ ] **Step 12.2: Wait for Vercel deploy to complete on https://pokestonks.vercel.app**

Watch the Vercel dashboard or use `gh` to check deploy status. Don't proceed until the new deploy is live.

- [ ] **Step 12.3: Apply the migration via Supabase SQL Editor**

Open the Supabase SQL Editor and execute the contents of `supabase/migrations/20260502000002_recipe_polish.sql`:

```sql
ALTER TABLE catalog_pack_compositions
  RENAME COLUMN pack_catalog_item_id TO contents_catalog_item_id;

DROP INDEX IF EXISTS catalog_pack_compositions_source_pack_idx;
CREATE UNIQUE INDEX catalog_pack_compositions_source_contents_idx
  ON catalog_pack_compositions(source_catalog_item_id, contents_catalog_item_id);

COMMENT ON COLUMN catalog_pack_compositions.contents_catalog_item_id IS
  'FK to catalog_items.id. Any kind allowed (sealed sub-products like Booster Boxes, Booster Packs, or cards for promos).';

COMMENT ON COLUMN box_decompositions.pack_count IS
  'Cost-split divisor at decomp time. Equals sum(quantity) of non-card recipe rows. Historical name retained.';
```

Verify with:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'catalog_pack_compositions' AND column_name LIKE '%catalog_item_id%';
```

Expected output:
```
source_catalog_item_id
contents_catalog_item_id
```

- [ ] **Step 12.4: Manual smoke**

On https://pokestonks.vercel.app:

1. Find a Booster Box you own (or seed one). Open it. Confirm the suggested recipe pre-populates as packs and the "Suggested recipe" banner appears. Submit. Confirm pack lots appear in `/holdings/[packCatalogId]`.
2. (Two-stage) Find or seed a Booster Box Case. Open it; recipe is empty (no auto-derive). Add the same-set Booster Box × 6 via the picker. Submit. Confirm 6-qty Box lot appears in `/holdings/[boxCatalogId]`. Open one of those Boxes; confirm it suggests packs. Submit. Confirm 36 packs.
3. (Promo) Find or seed a Mega ex Box. Open it. Add a Booster Pack × 3 + a card × 1 via the picker. Confirm preview shows "promo (no cost)" for the card. Submit. On `/holdings/[cardCatalogId]`, confirm the card lot has $0 cost basis (no NoBasisPill — it's a real $0, not unknown).
4. (Sale) Sell the promo for $5. Confirm $5 lands in realized P&L on the dashboard.
5. (Reset) On the same Mega ex Box catalog item, click Open Box again. Confirm the "Saved recipe" banner appears. Click "Clear saved recipe" → Clear. Confirm the dialog returns to the empty state.

- [ ] **Step 12.5: Final ship marker commit**

```bash
git commit --allow-empty -m "feat: ship Plan 9 (Decomposition polish — promos, two-stage, recipe reset)"
git push origin main
```

---

## Self-review

- **Spec coverage:** Every locked decision (Q1, Q2, Q3) is implemented in Tasks 1–11. Migration applied at ship time per Task 12.3. Latent multi-child bug (`packPurchase` singular, linked-sales `findFirst`) covered in Task 8.
- **Type consistency:** `contentsCatalogItemId` is the new field name everywhere (validation, schema, API, hooks, dialog). `childPurchases` / `childCatalogItems` are the new array names on `DecompositionDetailDto`. `useCreateDecomposition` payload no longer includes `_packCatalogItemId`.
- **Breaking-change fence:** Tasks 2–11 touch schema, API, hooks, and UI in lockstep. One commit (Step 11.7) ships everything together; the migration runs alongside that commit's deploy. Previous staged commits aren't possible because the schema rename breaks tsc until all callers update.
- **Testing:** TDD for every behavior change. New tests: `computeCostSplitTotal` (×4), POST decomposition new paths (×5), GET composition response shape (×1, plus existing-test updates), DELETE composition (×4), GET/[id] multi-child (×1), DELETE/[id] all-children sales check (×1), OpenBoxDialog picker/banner/clear/preview (×5), OpenBoxDetailDialog children list (×1). Approximate net new: ~20 tests, lifting baseline from 433 → ~453.
- **Out of scope per spec:** No backwards-compat shims, no `/catalog/[id]` recipe manager surface, no recursive case→pack flow, no auto-derive for Booster Box Case. All deferred per design doc.
