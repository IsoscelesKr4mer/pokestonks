# Plan 8 — Collection-Tracking Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users record lots they own without a known cost basis. Those lots count toward vault current market value but are excluded from cost basis + unrealized P&L. Single-flag flow, inline UI surfacing, one-way conversion.

**Architecture:** Add `purchases.unknown_cost BOOLEAN NOT NULL DEFAULT FALSE`. Service-layer math (`aggregateHoldings`, `computeHoldingPnL`, `computePortfolioPnL`) splits qty + value into tracked vs. collection buckets; cost basis and unrealized P&L only ever sum the tracked subset. UI surfaces the flag with a "No basis" pill, mode-toggling AddPurchaseDialog, catalog-page bulk multi-select, and an EditPurchaseDialog conversion affordance.

**Tech Stack:** Next.js 15 App Router, TypeScript, Drizzle ORM (service-role), Supabase JS (user-scope, RLS), Zod, TanStack Query, Vitest, Tailwind, base-ui.

**Spec:** `docs/superpowers/specs/2026-05-02-pokestonks-collection-mode-design.md` (commit `82b046e`).

---

## Pre-flight

- [ ] Plan 7 migration `20260430000001_pricing_automation.sql` is applied via Supabase SQL editor before starting (still pending per memory; cron 502s without it). Plan 8 doesn't depend on it, but interleaving migrations breaks ordering.
- [ ] On `main`, branch clean: `git status` empty.
- [ ] `npm install` ok, `npm run build` clean before starting (catch any pre-existing fallout).
- [ ] `npx vitest run` baseline at 380 passing (Plan 7 ship marker).

---

## Task 1: Migration + Drizzle schema

**Files:**
- Create: `supabase/migrations/20260502000001_unknown_cost_purchases.sql`
- Modify: `lib/db/schema/purchases.ts`

- [ ] **Step 1: Create the migration file**

Path: `supabase/migrations/20260502000001_unknown_cost_purchases.sql`

```sql
-- Plan 8: Collection-tracking mode
-- Adds an unknown_cost flag to purchases. Lots with unknown_cost = true
-- are excluded from cost basis + unrealized P&L, but still count toward
-- vault current market value and feed realized P&L on sale.
-- Storage convention: when unknown_cost = true, cost_cents = 0. The flag,
-- not the value, is the source of truth.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS unknown_cost BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Apply via Supabase SQL editor**

Open the Supabase Dashboard SQL editor for the project (per memory: never `drizzle-kit push`). Paste the migration contents, run it. Verify with:

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'purchases' AND column_name = 'unknown_cost';
```

Expected: `unknown_cost | NO | false`.

- [ ] **Step 3: Update Drizzle schema**

Edit `lib/db/schema/purchases.ts`. Add the field after `notes`:

```ts
notes: text('notes'),
unknownCost: boolean('unknown_cost').notNull().default(false),
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

The full file becomes (no other changes — keep all existing fields, indexes, and checks intact):

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
    unknownCost: boolean('unknown_cost').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    sourceRipId: bigint('source_rip_id', { mode: 'number' }),
    sourceDecompositionId: bigint('source_decomposition_id', { mode: 'number' }),
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
    sourceDecompositionIdx: index('purchases_source_decomp_idx')
      .on(t.sourceDecompositionId)
      .where(sql`${t.sourceDecompositionId} IS NOT NULL`),
    quantityCheck: check('purchases_quantity_positive', sql`${t.quantity} > 0`),
    costCheck: check('purchases_cost_nonneg', sql`${t.costCents} >= 0`),
  })
);

export type Purchase = typeof purchases.$inferSelect;
export type NewPurchase = typeof purchases.$inferInsert;
```

- [ ] **Step 4: Verify tsc + vitest still clean**

Run:

```bash
npx tsc --noEmit
npx vitest run
```

Expected: tsc clean (0 errors), vitest 380/380 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260502000001_unknown_cost_purchases.sql lib/db/schema/purchases.ts
git commit -m "feat(plan-8): migration + drizzle schema for purchases.unknown_cost"
git push origin main
```

---

## Task 2: aggregateHoldings — qty split

**Files:**
- Modify: `lib/services/holdings.ts`
- Modify: `lib/services/holdings.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/services/holdings.test.ts` (inside the `describe('aggregateHoldings', () => { ... })` block, before its closing brace):

```ts
  it('splits qtyHeld into tracked vs. collection by unknown_cost flag', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 1, quantity: 2, cost_cents: 5000, unknown_cost: false }),
      makePurchase({ id: 2, catalog_item_id: 1, quantity: 3, cost_cents: 0, unknown_cost: true }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].qtyHeld).toBe(5);
    expect(result[0].qtyHeldTracked).toBe(2);
    expect(result[0].qtyHeldCollection).toBe(3);
    expect(result[0].totalInvestedCents).toBe(10000);
  });

  it('all-collection holding has qtyHeldTracked=0 and totalInvestedCents=0', () => {
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 1, quantity: 4, cost_cents: 0, unknown_cost: true }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result[0].qtyHeldTracked).toBe(0);
    expect(result[0].qtyHeldCollection).toBe(4);
    expect(result[0].totalInvestedCents).toBe(0);
  });

  it('does not accumulate cost basis for unknown_cost rows even if cost_cents > 0', () => {
    // Defensive guard: storage convention is unknown_cost => cost_cents=0,
    // but the flag must win if the value is bad.
    const purchases = [
      makePurchase({ id: 1, catalog_item_id: 1, quantity: 1, cost_cents: 9999, unknown_cost: true }),
    ];
    const result = aggregateHoldings(purchases, [], [], []);
    expect(result[0].totalInvestedCents).toBe(0);
    expect(result[0].qtyHeldTracked).toBe(0);
    expect(result[0].qtyHeldCollection).toBe(1);
  });
```

Also update the `makePurchase` factory at the top of the file to include the new field with a default:

```ts
function makePurchase(overrides: Partial<RawPurchaseRow>): RawPurchaseRow {
  return {
    id: 1,
    catalog_item_id: 1,
    catalog_item: sealed,
    quantity: 1,
    cost_cents: 5000,
    unknown_cost: false,
    deleted_at: null,
    created_at: '2026-04-25T00:00:00Z',
    ...overrides,
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/holdings.test.ts`

Expected: TS compilation fails (`unknown_cost` not on `RawPurchaseRow`, `qtyHeldTracked` not on `Holding`). That's the red.

- [ ] **Step 3: Update the types and aggregator**

Edit `lib/services/holdings.ts`. Make three edits:

(a) `RawPurchaseRow` gains `unknown_cost`:

```ts
export type RawPurchaseRow = {
  id: number;
  catalog_item_id: number;
  catalog_item: RawCatalogItem;
  quantity: number;
  cost_cents: number;
  unknown_cost: boolean;
  deleted_at: string | null;
  created_at: string;
};
```

(b) `Holding` gains the two new fields:

```ts
export type Holding = {
  catalogItemId: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  qtyHeld: number;
  qtyHeldTracked: number;
  qtyHeldCollection: number;
  totalInvestedCents: number;
};
```

(c) The accumulator branches on `p.unknown_cost`. Replace the existing `if (existing) { ... } else { ... }` block inside the purchase loop with:

```ts
    const isCollection = p.unknown_cost === true;
    const trackedDelta = isCollection ? 0 : remaining;
    const collectionDelta = isCollection ? remaining : 0;
    const investedDelta = isCollection ? 0 : p.cost_cents * remaining;

    const existing = byCatalogItem.get(p.catalog_item_id);
    if (existing) {
      existing.holding.qtyHeld += remaining;
      existing.holding.qtyHeldTracked += trackedDelta;
      existing.holding.qtyHeldCollection += collectionDelta;
      existing.holding.totalInvestedCents += investedDelta;
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
          lastMarketAt: p.catalog_item.last_market_at,
          qtyHeld: remaining,
          qtyHeldTracked: trackedDelta,
          qtyHeldCollection: collectionDelta,
          totalInvestedCents: investedDelta,
        },
        latestCreatedAt: p.created_at,
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/holdings.test.ts`

Expected: all assertions green, including pre-existing ones (the existing tests don't reference `unknown_cost` on the input but the factory provides the default).

- [ ] **Step 5: Commit**

```bash
git add lib/services/holdings.ts lib/services/holdings.test.ts
git commit -m "feat(plan-8): aggregateHoldings splits qty into tracked vs. collection"
git push origin main
```

---

## Task 3: computeHoldingPnL — tracked-subset gates

**Files:**
- Modify: `lib/services/pnl.ts`
- Modify: `lib/services/pnl.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/services/pnl.test.ts` (within the existing `describe('computeHoldingPnL', () => { ... })`):

```ts
  it('mixed holding: P&L uses tracked subset only; current value totals all qty', () => {
    const holding: Holding = {
      catalogItemId: 1,
      kind: 'sealed',
      name: 'X',
      setName: null,
      productType: null,
      imageUrl: null,
      imageStoragePath: null,
      lastMarketCents: 3000,
      lastMarketAt: '2026-04-30T00:00:00Z',
      qtyHeld: 5,
      qtyHeldTracked: 2,
      qtyHeldCollection: 3,
      totalInvestedCents: 10000,
    };
    const out = computeHoldingPnL(holding, new Date('2026-05-02T00:00:00Z'));
    expect(out.currentValueCents).toBe(15000);                // 5 * 3000
    expect(out.currentValueTrackedCents).toBe(6000);          // 2 * 3000
    expect(out.currentValueCollectionCents).toBe(9000);       // 3 * 3000
    expect(out.pnlCents).toBe(-4000);                          // 6000 - 10000
    expect(out.pnlPct).toBeCloseTo(-40);
  });

  it('all-collection priced holding: pnlCents and pnlPct are null; currentValueCents is full', () => {
    const holding: Holding = {
      catalogItemId: 1,
      kind: 'sealed',
      name: 'X',
      setName: null,
      productType: null,
      imageUrl: null,
      imageStoragePath: null,
      lastMarketCents: 3000,
      lastMarketAt: '2026-04-30T00:00:00Z',
      qtyHeld: 4,
      qtyHeldTracked: 0,
      qtyHeldCollection: 4,
      totalInvestedCents: 0,
    };
    const out = computeHoldingPnL(holding, new Date('2026-05-02T00:00:00Z'));
    expect(out.currentValueCents).toBe(12000);
    expect(out.currentValueTrackedCents).toBe(0);
    expect(out.currentValueCollectionCents).toBe(12000);
    expect(out.pnlCents).toBeNull();
    expect(out.pnlPct).toBeNull();
  });

  it('all-collection unpriced holding: every value is null', () => {
    const holding: Holding = {
      catalogItemId: 1,
      kind: 'sealed',
      name: 'X',
      setName: null,
      productType: null,
      imageUrl: null,
      imageStoragePath: null,
      lastMarketCents: null,
      lastMarketAt: null,
      qtyHeld: 4,
      qtyHeldTracked: 0,
      qtyHeldCollection: 4,
      totalInvestedCents: 0,
    };
    const out = computeHoldingPnL(holding, new Date('2026-05-02T00:00:00Z'));
    expect(out.currentValueCents).toBeNull();
    expect(out.currentValueTrackedCents).toBeNull();
    expect(out.currentValueCollectionCents).toBeNull();
    expect(out.pnlCents).toBeNull();
    expect(out.pnlPct).toBeNull();
  });
```

The existing tests construct `Holding` literals; they need the new fields too. Find every `Holding` literal in `pnl.test.ts` and add `qtyHeldTracked: <prevQtyHeld>, qtyHeldCollection: 0,` so existing assertions still hold (a non-collection holding has all qty in the tracked bucket).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/pnl.test.ts`

Expected: TS errors on missing fields plus the three new tests fail with "currentValueTrackedCents is undefined".

- [ ] **Step 3: Update HoldingPnL type and implementation**

Edit `lib/services/pnl.ts`. Add the three new fields to `HoldingPnL`:

```ts
export type HoldingPnL = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  qtyHeld: number;
  qtyHeldTracked: number;
  qtyHeldCollection: number;
  totalInvestedCents: number;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  currentValueCents: number | null;
  currentValueTrackedCents: number | null;
  currentValueCollectionCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;
  priced: boolean;
  stale: boolean;
  delta7dCents?: number | null;
  delta7dPct?: number | null;
  manualMarketCents?: number | null;
};
```

Replace the body of `computeHoldingPnL` with the gated math:

```ts
export function computeHoldingPnL(holding: Holding, now: Date): HoldingPnL {
  const priced = holding.lastMarketCents != null;
  let currentValueCents: number | null = null;
  let currentValueTrackedCents: number | null = null;
  let currentValueCollectionCents: number | null = null;
  let pnlCents: number | null = null;
  let pnlPct: number | null = null;
  let stale = false;

  if (priced) {
    const m = holding.lastMarketCents!;
    currentValueCents = m * holding.qtyHeld;
    currentValueTrackedCents = m * holding.qtyHeldTracked;
    currentValueCollectionCents = m * holding.qtyHeldCollection;

    if (holding.qtyHeldTracked > 0) {
      pnlCents = currentValueTrackedCents - holding.totalInvestedCents;
      pnlPct =
        holding.totalInvestedCents > 0
          ? (pnlCents / holding.totalInvestedCents) * 100
          : null;
    }

    if (holding.lastMarketAt == null) {
      stale = true;
    } else {
      const ageMs = now.getTime() - new Date(holding.lastMarketAt).getTime();
      stale = ageMs > STALE_THRESHOLD_MS;
    }
  }

  return {
    catalogItemId: holding.catalogItemId,
    name: holding.name,
    setName: holding.setName,
    productType: holding.productType,
    kind: holding.kind,
    imageUrl: holding.imageUrl,
    imageStoragePath: holding.imageStoragePath,
    qtyHeld: holding.qtyHeld,
    qtyHeldTracked: holding.qtyHeldTracked,
    qtyHeldCollection: holding.qtyHeldCollection,
    totalInvestedCents: holding.totalInvestedCents,
    lastMarketCents: holding.lastMarketCents,
    lastMarketAt: holding.lastMarketAt,
    currentValueCents,
    currentValueTrackedCents,
    currentValueCollectionCents,
    pnlCents,
    pnlPct,
    priced,
    stale,
  };
}
```

Update `emptyHoldingPnL` similarly:

```ts
export function emptyHoldingPnL(item: {
  id: number;
  name: string;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  setName: string | null;
  productType: string | null;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
}): HoldingPnL {
  return {
    catalogItemId: item.id,
    name: item.name,
    kind: item.kind,
    imageUrl: item.imageUrl,
    imageStoragePath: item.imageStoragePath,
    setName: item.setName,
    productType: item.productType,
    lastMarketCents: item.lastMarketCents,
    lastMarketAt: item.lastMarketAt,
    qtyHeld: 0,
    qtyHeldTracked: 0,
    qtyHeldCollection: 0,
    totalInvestedCents: 0,
    currentValueCents: null,
    currentValueTrackedCents: null,
    currentValueCollectionCents: null,
    pnlCents: null,
    pnlPct: null,
    priced: false,
    stale: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/pnl.test.ts`

Expected: all green, including pre-existing tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/pnl.ts lib/services/pnl.test.ts
git commit -m "feat(plan-8): computeHoldingPnL gates P&L on tracked subset"
git push origin main
```

---

## Task 4: computePortfolioPnL — portfolio-level fields + performers filter

**Files:**
- Modify: `lib/services/pnl.ts`
- Modify: `lib/services/pnl.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `lib/services/pnl.test.ts` within `describe('computePortfolioPnL', () => { ... })`:

```ts
  it('exposes tracked/collection portfolio totals + lot counts', () => {
    const holdings: Holding[] = [
      {
        catalogItemId: 1, kind: 'sealed', name: 'A', setName: null, productType: null,
        imageUrl: null, imageStoragePath: null,
        lastMarketCents: 3000, lastMarketAt: '2026-04-30T00:00:00Z',
        qtyHeld: 2, qtyHeldTracked: 2, qtyHeldCollection: 0, totalInvestedCents: 4000,
      },
      {
        catalogItemId: 2, kind: 'sealed', name: 'B', setName: null, productType: null,
        imageUrl: null, imageStoragePath: null,
        lastMarketCents: 5000, lastMarketAt: '2026-04-30T00:00:00Z',
        qtyHeld: 3, qtyHeldTracked: 0, qtyHeldCollection: 3, totalInvestedCents: 0,
      },
    ];
    const out = computePortfolioPnL(holdings, 0, 0, 5, new Date('2026-05-02T00:00:00Z'));
    expect(out.totalCurrentValueCents).toBe(2 * 3000 + 3 * 5000); // 21000
    expect(out.totalCurrentValueTrackedCents).toBe(6000);
    expect(out.totalCurrentValueCollectionCents).toBe(15000);
    expect(out.qtyHeldTrackedAcrossPortfolio).toBe(2);
    expect(out.qtyHeldCollectionAcrossPortfolio).toBe(3);
    expect(out.unrealizedPnLCents).toBe(2000); // 6000 - 4000
  });

  it('best/worst performers exclude all-collection holdings', () => {
    const holdings: Holding[] = [
      {
        catalogItemId: 1, kind: 'sealed', name: 'TrackedWinner', setName: null, productType: null,
        imageUrl: null, imageStoragePath: null,
        lastMarketCents: 5000, lastMarketAt: '2026-04-30T00:00:00Z',
        qtyHeld: 1, qtyHeldTracked: 1, qtyHeldCollection: 0, totalInvestedCents: 1000,
      },
      {
        catalogItemId: 2, kind: 'sealed', name: 'CollectionOnly', setName: null, productType: null,
        imageUrl: null, imageStoragePath: null,
        lastMarketCents: 9999, lastMarketAt: '2026-04-30T00:00:00Z',
        qtyHeld: 1, qtyHeldTracked: 0, qtyHeldCollection: 1, totalInvestedCents: 0,
      },
    ];
    const out = computePortfolioPnL(holdings, 0, 0, 2, new Date('2026-05-02T00:00:00Z'));
    expect(out.bestPerformers.map((h) => h.catalogItemId)).toEqual([1]);
    expect(out.worstPerformers.map((h) => h.catalogItemId)).toEqual([1]);
  });

  it('lotCountTracked + lotCountCollection breakdown', () => {
    const holdings: Holding[] = [];
    const out = computePortfolioPnL(holdings, 0, 0, 0, new Date('2026-05-02T00:00:00Z'), {
      lotCountTracked: 7,
      lotCountCollection: 2,
    });
    expect(out.lotCountTracked).toBe(7);
    expect(out.lotCountCollection).toBe(2);
    expect(out.lotCount).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/services/pnl.test.ts`

Expected: TS errors on missing portfolio fields + missing 6th `breakdown` argument.

- [ ] **Step 3: Update PortfolioPnL type and computePortfolioPnL**

Edit `lib/services/pnl.ts`. Extend the type:

```ts
export type PortfolioPnL = {
  totalInvestedCents: number;
  pricedInvestedCents: number;
  totalCurrentValueCents: number;
  totalCurrentValueTrackedCents: number;
  totalCurrentValueCollectionCents: number;
  qtyHeldTrackedAcrossPortfolio: number;
  qtyHeldCollectionAcrossPortfolio: number;
  unrealizedPnLCents: number;
  unrealizedPnLPct: number | null;
  realizedPnLCents: number;
  realizedRipPnLCents: number;
  realizedSalesPnLCents: number;
  pricedCount: number;
  unpricedCount: number;
  staleCount: number;
  lotCount: number;
  lotCountTracked: number;
  lotCountCollection: number;
  perHolding: HoldingPnL[];
  bestPerformers: HoldingPnL[];
  worstPerformers: HoldingPnL[];
};
```

Add an optional 6th argument `breakdown` and rewrite the body:

```ts
export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,
  realizedSalesPnLCents: number,
  lotCount: number,
  now: Date = new Date(),
  breakdown: { lotCountTracked: number; lotCountCollection: number } = {
    lotCountTracked: lotCount,
    lotCountCollection: 0,
  }
): PortfolioPnL {
  const perHolding = holdings.map((h) => computeHoldingPnL(h, now));

  let totalInvestedCents = 0;
  let pricedInvestedCents = 0;
  let totalCurrentValueCents = 0;
  let totalCurrentValueTrackedCents = 0;
  let totalCurrentValueCollectionCents = 0;
  let qtyHeldTrackedAcrossPortfolio = 0;
  let qtyHeldCollectionAcrossPortfolio = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let staleCount = 0;

  for (const h of perHolding) {
    totalInvestedCents += h.totalInvestedCents;
    qtyHeldTrackedAcrossPortfolio += h.qtyHeldTracked;
    qtyHeldCollectionAcrossPortfolio += h.qtyHeldCollection;
    if (h.priced) {
      pricedInvestedCents += h.totalInvestedCents;
      totalCurrentValueCents += h.currentValueCents ?? 0;
      totalCurrentValueTrackedCents += h.currentValueTrackedCents ?? 0;
      totalCurrentValueCollectionCents += h.currentValueCollectionCents ?? 0;
      pricedCount++;
      if (h.stale) staleCount++;
    } else {
      unpricedCount++;
    }
  }

  const unrealizedPnLCents = totalCurrentValueTrackedCents - pricedInvestedCents;
  const unrealizedPnLPct =
    pricedInvestedCents > 0
      ? (unrealizedPnLCents / pricedInvestedCents) * 100
      : null;

  const rankable = perHolding.filter((h) => h.priced && h.qtyHeldTracked > 0);
  const sortDesc = [...rankable].sort((a, b) => {
    const pa = a.pnlCents ?? 0;
    const pb = b.pnlCents ?? 0;
    if (pb !== pa) return pb - pa;
    if (b.qtyHeld !== a.qtyHeld) return b.qtyHeld - a.qtyHeld;
    return a.catalogItemId - b.catalogItemId;
  });
  const sortAsc = [...rankable].sort((a, b) => {
    const pa = a.pnlCents ?? 0;
    const pb = b.pnlCents ?? 0;
    if (pa !== pb) return pa - pb;
    if (b.qtyHeld !== a.qtyHeld) return b.qtyHeld - a.qtyHeld;
    return a.catalogItemId - b.catalogItemId;
  });

  const realizedRipPnLCents = realizedRipLossCents === 0 ? 0 : -realizedRipLossCents;
  const sumRealized = realizedRipPnLCents + realizedSalesPnLCents;
  const realizedPnLCents = sumRealized === 0 ? 0 : sumRealized;

  return {
    totalInvestedCents,
    pricedInvestedCents,
    totalCurrentValueCents,
    totalCurrentValueTrackedCents,
    totalCurrentValueCollectionCents,
    qtyHeldTrackedAcrossPortfolio,
    qtyHeldCollectionAcrossPortfolio,
    unrealizedPnLCents,
    unrealizedPnLPct,
    realizedPnLCents,
    realizedRipPnLCents,
    realizedSalesPnLCents: realizedSalesPnLCents === 0 ? 0 : realizedSalesPnLCents,
    pricedCount,
    unpricedCount,
    staleCount,
    lotCount,
    lotCountTracked: breakdown.lotCountTracked,
    lotCountCollection: breakdown.lotCountCollection,
    perHolding,
    bestPerformers: sortDesc.slice(0, 3),
    worstPerformers: sortAsc.slice(0, 3),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/pnl.test.ts`

Expected: all green. Existing tests still pass because `breakdown` defaults to `{lotCountTracked: lotCount, lotCountCollection: 0}` (preserves old behavior for callers that only pass 5 args).

- [ ] **Step 5: Commit**

```bash
git add lib/services/pnl.ts lib/services/pnl.test.ts
git commit -m "feat(plan-8): portfolio totals split tracked/collection; performers filter"
git push origin main
```

---

## Task 5: Validation schemas — unknownCost on input + patch + locked fields

**Files:**
- Modify: `lib/validation/purchase.ts`

- [ ] **Step 1: Add `unknownCost` to both schemas + extend the locked-fields list**

Replace the file with:

```ts
import { z } from 'zod';

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export const GRADING_COMPANIES = ['PSA', 'CGC', 'BGS', 'TAG'] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const purchaseInputSchema = z
  .object({
    catalogItemId: z.number().int().positive(),
    quantity: z.number().int().min(1).default(1),
    costCents: z.number().int().nonnegative().nullable().optional(),
    unknownCost: z.boolean().optional(),
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

export const purchasePatchSchema = z.object({
  catalogItemId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).optional(),
  costCents: z.number().int().nonnegative().nullable().optional(),
  unknownCost: z.boolean().optional(),
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

export const HARD_FIELDS_FOR_DERIVED_CHILDREN = [
  'catalogItemId',
  'quantity',
  'costCents',
  'purchaseDate',
  'unknownCost',
] as const satisfies readonly (keyof PurchasePatch)[];
```

- [ ] **Step 2: Verify tsc clean**

Run: `npx tsc --noEmit`

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/validation/purchase.ts
git commit -m "feat(plan-8): purchase validation accepts unknownCost; lock list extended"
git push origin main
```

---

## Task 6: POST /api/purchases — accept unknownCost; force costCents=0 when true

**Files:**
- Modify: `app/api/purchases/route.ts`

- [ ] **Step 1: Update the POST handler**

Replace the existing POST body in `app/api/purchases/route.ts`. The relevant section (after the validation parse) becomes:

```ts
  const v = parsed.data;

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, v.catalogItemId),
  });
  if (!item) {
    return NextResponse.json({ error: 'catalog item not found' }, { status: 404 });
  }

  const isCard = item.kind === 'card';
  const unknownCost = v.unknownCost === true;
  // When unknownCost is true, force cost_cents = 0 regardless of any value sent.
  // The flag is the source of truth, not the value.
  const costCents = unknownCost
    ? 0
    : v.costCents ??
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
    unknown_cost: unknownCost,
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
```

- [ ] **Step 2: Verify tsc + existing tests still clean**

Run: `npx tsc --noEmit && npx vitest run`

Expected: all 380+ tests pass; no type errors. (Existing purchase POST integration tests, if any, still pass because the new field is optional and default-false.)

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/route.ts
git commit -m "feat(plan-8): POST /api/purchases accepts unknownCost"
git push origin main
```

---

## Task 7: PATCH /api/purchases/[id] — conversion + reverse-block + child lock

**Files:**
- Modify: `app/api/purchases/[id]/route.ts`

- [ ] **Step 1: Add reverse-block + write unknown_cost into update**

Edit `app/api/purchases/[id]/route.ts`. Two changes inside the `PATCH` handler:

(a) Add the reverse-block check after the existing isDerivedChild check (around the existing `if (isDerivedChild) {...}` close brace). Read existing `unknown_cost` first; expand the lookup select to include it:

Find the existing lookup:

```ts
  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id, source_rip_id, source_decomposition_id, deleted_at')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
```

Replace with:

```ts
  const { data: existing, error: lookupErr } = await supabase
    .from('purchases')
    .select('id, source_rip_id, source_decomposition_id, deleted_at, unknown_cost')
    .eq('id', numericId)
    .is('deleted_at', null)
    .maybeSingle();
```

Then after the `if (isDerivedChild) { ... }` block (which now also covers `unknownCost` as a locked field, automatically — `HARD_FIELDS_FOR_DERIVED_CHILDREN` already includes it from Task 5), add:

```ts
  // One-way conversion only. Block known -> unknown.
  if (
    v.unknownCost === true &&
    existing.unknown_cost === false
  ) {
    return NextResponse.json(
      { error: 'cannot_unset_basis' },
      { status: 422 }
    );
  }
```

(b) Add `unknownCost` to the `update` builder:

Find the existing `update` block:

```ts
  const update: Record<string, unknown> = {};
  if (v.catalogItemId !== undefined) update.catalog_item_id = v.catalogItemId;
  if (v.quantity !== undefined) update.quantity = v.quantity;
  if (v.costCents !== undefined) update.cost_cents = v.costCents;
```

Insert immediately after the `costCents` line:

```ts
  if (v.unknownCost !== undefined) update.unknown_cost = v.unknownCost;
  // Conversion convenience: when flipping unknown -> known, costCents
  // must be supplied in the same request. We don't auto-zero on the
  // reverse path because reverse is already blocked above.
```

Note: the existing field write of `cost_cents` already handles the conversion case where the client sends both fields. No special-casing needed.

- [ ] **Step 2: Verify with manual test in Supabase test or via curl**

Skip if integration test infra exists at the API route layer for this codebase. Otherwise verify after Task 16 (UI conversion path) end-to-end.

`npx tsc --noEmit && npx vitest run` clean.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/[id]/route.ts
git commit -m "feat(plan-8): PATCH /api/purchases/[id] supports one-way conversion"
git push origin main
```

---

## Task 8: POST /api/purchases/bulk — new endpoint

**Files:**
- Create: `app/api/purchases/bulk/route.ts`
- Create: `app/api/purchases/bulk/route.test.ts`

- [ ] **Step 1: Write the failing test**

Path: `app/api/purchases/bulk/route.test.ts`

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insertMock = vi.fn();
const fromMock = vi.fn();
const getUserMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findMany: (...args: unknown[]) => findManyMock(...args),
      },
    },
  },
  schema: {
    catalogItems: { id: 'id-col' },
  },
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://test/api/purchases/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/purchases/bulk', () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
    getUserMock.mockReset();
    findManyMock.mockReset();
    fromMock.mockReturnValue({
      insert: insertMock,
    });
  });

  it('rejects unauthenticated', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(makeReq({ items: [{ catalogItemId: 1, quantity: 1 }] }) as never);
    expect(res.status).toBe(401);
  });

  it('rejects empty items array', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    const res = await POST(makeReq({ items: [] }) as never);
    expect(res.status).toBe(422);
  });

  it('rejects > 200 items', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    const items = Array.from({ length: 201 }, (_, i) => ({ catalogItemId: 1, quantity: 1 }));
    const res = await POST(makeReq({ items }) as never);
    expect(res.status).toBe(422);
  });

  it('rejects when a catalogItemId does not exist', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    findManyMock.mockResolvedValueOnce([{ id: 1 }]); // only id 1 exists
    const res = await POST(
      makeReq({
        items: [
          { catalogItemId: 1, quantity: 1 },
          { catalogItemId: 999, quantity: 1 },
        ],
      }) as never
    );
    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inserts N rows all with unknown_cost=true and cost_cents=0', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: 'u1' } } });
    findManyMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    insertMock.mockReturnValueOnce({
      select: () => Promise.resolve({ data: [{ id: 10 }, { id: 11 }], error: null }),
    });
    const today = new Date().toISOString().slice(0, 10);
    const res = await POST(
      makeReq({
        items: [
          { catalogItemId: 1, quantity: 2, source: 'Walmart' },
          { catalogItemId: 2, quantity: 1 },
        ],
      }) as never
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(2);
    expect(body.ids).toEqual([10, 11]);
    expect(insertMock).toHaveBeenCalledWith([
      expect.objectContaining({
        catalog_item_id: 1,
        quantity: 2,
        cost_cents: 0,
        unknown_cost: true,
        source: 'Walmart',
        purchase_date: today,
      }),
      expect.objectContaining({
        catalog_item_id: 2,
        quantity: 1,
        cost_cents: 0,
        unknown_cost: true,
        source: null,
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/purchases/bulk/route.test.ts`

Expected: fails because route doesn't exist.

- [ ] **Step 3: Create the route**

Path: `app/api/purchases/bulk/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

const bulkInputSchema = z.object({
  items: z
    .array(
      z.object({
        catalogItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).default(1),
        purchaseDate: isoDate.optional(),
        source: z.string().max(120).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bulkInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { items } = parsed.data;

  const ids = Array.from(new Set(items.map((i) => i.catalogItemId)));
  const found = await db.query.catalogItems.findMany({
    where: inArray(schema.catalogItems.id, ids),
    columns: { id: true },
  });
  const foundIds = new Set(found.map((r) => r.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'catalog_items_not_found', missingIds: missing },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = items.map((it) => ({
    user_id: user.id,
    catalog_item_id: it.catalogItemId,
    purchase_date: it.purchaseDate ?? today,
    quantity: it.quantity,
    cost_cents: 0,
    unknown_cost: true,
    source: it.source ?? null,
    location: null,
    notes: null,
    condition: null,
    is_graded: false,
    grading_company: null,
    grade: null,
    cert_number: null,
  }));

  const { data, error } = await supabase
    .from('purchases')
    .insert(rows)
    .select('id');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const insertedIds = (data ?? []).map((r: { id: number }) => r.id);
  return NextResponse.json(
    { created: insertedIds.length, ids: insertedIds },
    { status: 201 }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/purchases/bulk/route.test.ts`

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/purchases/bulk/
git commit -m "feat(plan-8): POST /api/purchases/bulk for collection bulk-add"
git push origin main
```

---

## Task 9: POST /api/rips — child inherits unknown_cost

**Files:**
- Modify: `app/api/rips/route.ts`

- [ ] **Step 1: Read the file to find the child-purchase insert site**

Open `app/api/rips/route.ts`. Locate the transaction block where the rip's child purchase is inserted (look for an `insert(...purchases...)` after `db.transaction`).

- [ ] **Step 2: Pass unknown_cost from source through to child**

In the same query that loads the source purchase row (where `cost_cents` and other parent fields are read), add `unknown_cost` to the selected columns. Pass it into the inserted child row:

```ts
// In the source-purchase select:
columns: {
  id: true,
  catalogItemId: true,
  costCents: true,
  unknownCost: true, // <-- add
  // ... other existing columns
},
```

When constructing the child purchase row, include:

```ts
unknown_cost: source.unknownCost,
```

If the child row uses Drizzle insert (camelCase) instead of supabase insert (snake_case), use `unknownCost: source.unknownCost`.

- [ ] **Step 3: Verify tsc + existing rips tests still pass**

Run: `npx tsc --noEmit && npx vitest run lib/services/rips.test.ts`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/rips/route.ts
git commit -m "feat(plan-8): rip children inherit parent's unknown_cost"
git push origin main
```

---

## Task 10: POST /api/decompositions — children inherit unknown_cost

**Files:**
- Modify: `app/api/decompositions/route.ts`

- [ ] **Step 1: Read the file**

Open `app/api/decompositions/route.ts`. Locate the source-purchase select and the child-pack-purchase insert(s) inside the transaction.

- [ ] **Step 2: Pass unknown_cost from parent to each child**

Add `unknownCost` to the source-purchase select. When constructing each child pack purchase row, include `unknown_cost: source.unknownCost` (or `unknownCost: source.unknownCost` for camelCase Drizzle inserts).

The cost-split math (`computePerPackCost`) is unchanged — when the parent is unknown-cost, source cost is 0, so per-pack cost is 0 too. The flag is the source of truth.

- [ ] **Step 3: Verify tsc + existing decompositions tests pass**

Run: `npx tsc --noEmit && npx vitest run lib/services/decompositions.test.ts`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/decompositions/route.ts
git commit -m "feat(plan-8): decomposition children inherit parent's unknown_cost"
git push origin main
```

---

## Task 11: GET /api/holdings — surface qty splits + new fields

**Files:**
- Modify: `app/api/holdings/route.ts`
- Modify: `app/api/holdings/route.test.ts`

- [ ] **Step 1: Read the route + test**

Open both files. Note the supabase select for purchases — it must include `unknown_cost`. The fetched rows feed `aggregateHoldings`, so adding the column flows through automatically.

- [ ] **Step 2: Update the purchase select**

In the supabase `.select(...)` call that fetches purchases, add `unknown_cost` to the select string. Example shape:

```ts
.select('id, catalog_item_id, quantity, cost_cents, unknown_cost, deleted_at, created_at, catalog_item:catalog_items(...)')
```

(Match the existing select format precisely — if it's a multi-line string or template, just append the column.)

- [ ] **Step 3: Add an assertion to the route test**

Add to the existing `app/api/holdings/route.test.ts` a test that mixed inventory surfaces qtyHeldTracked and qtyHeldCollection in the response:

```ts
  it('surfaces qtyHeldTracked + qtyHeldCollection on each row', async () => {
    // (test setup that mocks supabase to return one tracked + one unknown-cost
    // purchase for the same catalog item; assert response row has the split.)
  });
```

If the existing test file uses fixture builders, follow that style; surface the new fields via the existing `aggregateHoldings` -> `computeHoldingPnL` flow (no separate code change needed here once the select column is added).

- [ ] **Step 4: Verify tests + tsc**

Run: `npx tsc --noEmit && npx vitest run app/api/holdings/route.test.ts`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings/route.ts app/api/holdings/route.test.ts
git commit -m "feat(plan-8): /api/holdings surfaces tracked/collection qty split"
git push origin main
```

---

## Task 12: GET /api/holdings/[catalogItemId] — same + per-lot unknownCost

**Files:**
- Modify: `app/api/holdings/[catalogItemId]/route.ts`

- [ ] **Step 1: Read the route**

Open `app/api/holdings/[catalogItemId]/route.ts`. Identify the lot-list builder (returns the `lots[]` array) and the `holding` summary section.

- [ ] **Step 2: Add `unknown_cost` to selects + bubble into the lot DTO**

Two places:

(a) The purchase select for the holding summary (used to build `qtyHeldTracked`/`qtyHeldCollection`) — add `unknown_cost` to the column list.

(b) The lot-list mapper — surface `unknownCost: lot.unknown_cost` (or its camelCase if a buildHoldingDetailDto helper is in use). The `LotsTable` consumer expects this field on each row (see Task 17).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/holdings/[catalogItemId]/route.ts
git commit -m "feat(plan-8): holding detail API surfaces per-lot unknownCost"
git push origin main
```

---

## Task 13: GET /api/dashboard/totals — surface portfolio fields

**Files:**
- Modify: `app/api/dashboard/totals/route.ts`

- [ ] **Step 1: Add `unknown_cost` to the purchases select + pass `breakdown` to computePortfolioPnL**

Open `app/api/dashboard/totals/route.ts`. Two changes:

(a) Add `unknown_cost` to the supabase select for purchases (same shape as Task 11).

(b) Compute `lotCountTracked` + `lotCountCollection` from the loaded purchase rows (filter by `unknown_cost`). Pass them as the 6th argument:

```ts
const lotCountTracked = openPurchaseRows.filter((p) => !p.unknown_cost).length;
const lotCountCollection = openPurchaseRows.filter((p) => p.unknown_cost).length;
const totals = computePortfolioPnL(
  holdings,
  realizedRipLossCents,
  realizedSalesPnLCents,
  lotCount,
  new Date(),
  { lotCountTracked, lotCountCollection }
);
```

The new portfolio fields (`totalCurrentValueTrackedCents`, etc.) flow through automatically since `computePortfolioPnL` populates them.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run`

Expected: clean. Existing dashboard route tests (if any) still pass — the new fields are additive.

- [ ] **Step 3: Commit**

```bash
git add app/api/dashboard/totals/route.ts
git commit -m "feat(plan-8): dashboard totals surfaces tracked/collection breakdown"
git push origin main
```

---

## Task 14: GET /api/sales + /api/sales/[saleGroupId] — bubble unknownCost

**Files:**
- Modify: `app/api/sales/route.ts`
- Modify: `app/api/sales/[saleGroupId]/route.ts`

- [ ] **Step 1: Add unknown_cost to the join + bubble into row + group**

Each sale row joins to its source purchase. Add `unknown_cost` to the joined column list. In the row DTO, surface a top-level `unknownCost: boolean` (per-leg).

In the group-level shape (`SaleEvent`-style), add `unknownCost: boolean` derived as `legs.some((l) => l.unknownCost)`.

For both routes:

```ts
// In the supabase select chain joining purchases:
purchase:purchases ( ..., unknown_cost )

// In the row mapper (per leg):
unknownCost: row.purchase.unknown_cost,

// In the group reducer:
unknownCost: legs.some((l) => l.unknownCost),
```

- [ ] **Step 2: Update existing sales-route tests if they assert exact row shape**

Append to those tests that assert row shape: `unknownCost: false` for tracked-lot fixtures.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run app/api/sales/`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/sales/route.ts app/api/sales/[saleGroupId]/route.ts
git commit -m "feat(plan-8): sales routes bubble per-leg + group unknownCost"
git push origin main
```

---

## Task 15: NoBasisPill shared atom

**Files:**
- Create: `components/holdings/NoBasisPill.tsx`
- Create: `components/holdings/NoBasisPill.test.tsx`

- [ ] **Step 1: Write the failing test**

Path: `components/holdings/NoBasisPill.test.tsx`

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoBasisPill } from './NoBasisPill';

describe('NoBasisPill', () => {
  it('renders the "No basis" label', () => {
    render(<NoBasisPill />);
    expect(screen.getByText('No basis')).toBeTruthy();
  });

  it('exposes an aria-label for screen readers', () => {
    render(<NoBasisPill />);
    const el = screen.getByLabelText(/excluded from p&l/i);
    expect(el).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/holdings/NoBasisPill.test.tsx`

Expected: fails (component does not exist).

- [ ] **Step 3: Implement the component**

Path: `components/holdings/NoBasisPill.tsx`

Match the styling of the existing `StalePill.tsx` and `UnpricedBadge.tsx` so the visual rhythm is consistent. Open both for reference. Then write:

```tsx
'use client';

export function NoBasisPill({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="No basis (excluded from P&L)"
      className={`inline-flex items-center gap-1 rounded-full border border-divider bg-vault px-[8px] py-[2px] text-[10px] font-mono uppercase tracking-[0.14em] text-meta ${className}`}
    >
      No basis
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/holdings/NoBasisPill.test.tsx`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add components/holdings/NoBasisPill.tsx components/holdings/NoBasisPill.test.tsx
git commit -m "feat(plan-8): NoBasisPill shared atom"
git push origin main
```

---

## Task 16: AddPurchaseDialog — checkbox + label + helper

**Files:**
- Modify: `components/purchases/AddPurchaseDialog.tsx`
- Modify: `components/purchases/AddPurchaseDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `components/purchases/AddPurchaseDialog.test.tsx`:

```tsx
  it('checking "I don\'t know the cost basis" disables cost field and flips submit label', () => {
    render(<AddPurchaseDialog open onClose={() => {}} catalogItemId={1} />, { wrapper });
    const checkbox = screen.getByLabelText(/don.t know the cost basis/i);
    fireEvent.click(checkbox);
    const cost = screen.getByLabelText(/cost/i) as HTMLInputElement;
    expect(cost.disabled).toBe(true);
    expect(screen.getByRole('button', { name: /add to vault/i })).toBeTruthy();
    expect(screen.getByText(/excluded from p&l/i)).toBeTruthy();
  });

  it('submits unknownCost: true and costCents: 0 when checkbox is checked', async () => {
    const create = vi.fn(() => Promise.resolve({}));
    // (replace the useCreatePurchase mock with one that exposes mutateAsync = create)
    render(<AddPurchaseDialog open onClose={() => {}} catalogItemId={42} />, { wrapper });
    fireEvent.click(screen.getByLabelText(/don.t know the cost basis/i));
    fireEvent.click(screen.getByRole('button', { name: /add to vault/i }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        catalogItemId: 42,
        unknownCost: true,
        costCents: 0,
      }))
    );
  });
```

(Mirror the existing test setup — `wrapper`, `useCreatePurchase` mock — already present in `AddPurchaseDialog.test.tsx`. Use the existing pattern; do not duplicate the setup.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/purchases/AddPurchaseDialog.test.tsx`

Expected: fails (no checkbox).

- [ ] **Step 3: Update the dialog**

Replace `components/purchases/AddPurchaseDialog.tsx` with:

```tsx
'use client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  FormHint,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { useCreatePurchase } from '@/lib/query/hooks/usePurchases';
import { dollarsStringToCents } from '@/lib/utils/cents';

export function AddPurchaseDialog({
  open,
  onClose,
  catalogItemId,
}: {
  open: boolean;
  onClose: () => void;
  catalogItemId: number;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [costDollars, setCostDollars] = useState('');
  const [source, setSource] = useState('');
  const [location, setLocation] = useState('');
  const [unknownCost, setUnknownCost] = useState(false);
  const create = useCreatePurchase();

  const submitDisabled = create.isPending || (!unknownCost && !costDollars);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <VaultDialogHeader title={unknownCost ? 'Add to vault' : 'Log purchase'} sub="Adds a lot to this catalog item" />
        <FormSection>
          <FormRow>
            <div>
              <FormLabel>Date</FormLabel>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <FormLabel>Quantity</FormLabel>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
            </div>
          </FormRow>
          <FormRow>
            <div>
              <FormLabel>Cost · per unit</FormLabel>
              <Input
                type="number"
                step="0.01"
                placeholder={unknownCost ? 'Unknown' : '0.00'}
                value={unknownCost ? '' : costDollars}
                onChange={(e) => setCostDollars(e.target.value)}
                disabled={unknownCost}
                required={!unknownCost}
              />
            </div>
            <div>
              <FormLabel>Source</FormLabel>
              <Input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Walmart vending"
              />
            </div>
          </FormRow>
          <label className="flex items-start gap-2 text-[12px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              className="mt-[3px]"
              checked={unknownCost}
              onChange={(e) => setUnknownCost(e.target.checked)}
              aria-label="I don't know the cost basis"
            />
            <span>
              <span className="font-medium text-text">I don&apos;t know the cost basis</span>
              {unknownCost && (
                <FormHint>Excluded from P&amp;L. Counts toward vault current market value.</FormHint>
              )}
            </span>
          </label>
          <div>
            <FormLabel>Location (optional)</FormLabel>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="franklin"
            />
          </div>
        </FormSection>
        <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const cents = unknownCost ? 0 : dollarsStringToCents(costDollars);
              if (cents === null) return;
              if (!unknownCost && cents <= 0) return;
              await create.mutateAsync({
                catalogItemId,
                purchaseDate: date,
                quantity,
                costCents: cents,
                unknownCost,
                source: source || null,
                location: location || null,
                isGraded: false,
              });
              onClose();
            }}
            disabled={submitDisabled}
          >
            {unknownCost ? '+ Add to vault' : '+ Log purchase'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Update `useCreatePurchase` hook to forward `unknownCost`**

Open `lib/query/hooks/usePurchases.ts`. Find the body shape passed in `useCreatePurchase`'s mutate function; add `unknownCost?: boolean` to that body type and include it in the JSON sent to `POST /api/purchases`. (If the hook already passes the entire input verbatim to the API, no change is needed.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/purchases/AddPurchaseDialog.test.tsx && npx tsc --noEmit`

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add components/purchases/AddPurchaseDialog.tsx components/purchases/AddPurchaseDialog.test.tsx lib/query/hooks/usePurchases.ts
git commit -m "feat(plan-8): AddPurchaseDialog gains 'don't know cost basis' mode"
git push origin main
```

---

## Task 17: LotsTable — render unknownCost lots with pill, hide P&L

**Files:**
- Modify: `components/lots/LotsTable.tsx`
- Modify: `components/lots/LotsTable.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `components/lots/LotsTable.test.tsx`:

```tsx
  it('renders NoBasisPill on unknown-cost rows', () => {
    render(
      <LotsTable
        rows={[{
          purchaseId: 1,
          purchaseDate: '2026-04-01',
          source: null,
          location: null,
          qtyRemaining: 1,
          qtyOriginal: 1,
          perUnitCostCents: 0,
          perUnitMarketCents: 1000,
          pnlCents: null,
          pnlPct: null,
          kind: 'sealed',
          productType: null,
          unknownCost: true,
        }]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText('No basis')).toBeTruthy();
  });

  it('hides per-lot P&L for unknown-cost rows', () => {
    render(
      <LotsTable
        rows={[{
          purchaseId: 1,
          purchaseDate: '2026-04-01',
          source: null,
          location: null,
          qtyRemaining: 1,
          qtyOriginal: 1,
          perUnitCostCents: 0,
          perUnitMarketCents: 1000,
          pnlCents: null,
          pnlPct: null,
          kind: 'sealed',
          productType: null,
          unknownCost: true,
        }]}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    );
    // The header label "P&L" should still appear in non-privacy mode, but the
    // value cell should NOT show "$0.00" or "unpriced" — instead, "no basis".
    expect(screen.queryByText(/unpriced/i)).toBeNull();
  });
```

(Adapt to the existing `LotsTable.test.tsx` import/wrapper pattern.)

- [ ] **Step 2: Update LotsTable**

Edit `components/lots/LotsTable.tsx`:

(a) Add `unknownCost: boolean` to `LotsTableRow`:

```ts
export interface LotsTableRow {
  purchaseId: number;
  purchaseDate: string;
  source: string | null;
  location: string | null;
  qtyRemaining: number;
  qtyOriginal: number;
  perUnitCostCents: number;
  perUnitMarketCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;
  kind: 'sealed' | 'card';
  productType: string | null;
  unknownCost: boolean;
}
```

(b) Import the NoBasisPill at the top:

```ts
import { NoBasisPill } from '@/components/holdings/NoBasisPill';
```

(c) In the row renderer, replace the cost cell's `{formatCents(row.perUnitCostCents)}` with a conditional:

```tsx
{!privacy && (
  <div className="text-right tabular-nums text-[13px]">
    <div className="text-[9px] uppercase tracking-[0.14em] text-meta font-mono mb-[2px]">Cost / ea</div>
    {row.unknownCost ? (
      <NoBasisPill />
    ) : (
      <div>{formatCents(row.perUnitCostCents)}</div>
    )}
  </div>
)}
```

(d) In the P&L cell, branch on `row.unknownCost` first:

```tsx
<div className="text-right tabular-nums text-[13px] font-mono">
  {privacy ? (
    <>
      <div className="text-[9px] uppercase tracking-[0.14em] text-meta mb-[2px]">Market / ea</div>
      {row.perUnitMarketCents !== null ? (
        <div>{formatCents(row.perUnitMarketCents)}</div>
      ) : (
        <div className="text-stale">unpriced</div>
      )}
    </>
  ) : (
    <>
      <div className="text-[9px] uppercase tracking-[0.14em] text-meta mb-[2px]">P&amp;L</div>
      {row.unknownCost ? (
        <div className="text-meta">no basis</div>
      ) : row.pnlCents === null ? (
        <div className="text-stale">unpriced</div>
      ) : (
        <div className={row.pnlCents >= 0 ? 'text-positive' : 'text-negative'}>
          {formatCentsSigned(row.pnlCents)} {row.pnlPct !== null ? formatPct(row.pnlPct) : ''}
        </div>
      )}
    </>
  )}
</div>
```

- [ ] **Step 3: Update HoldingDetailClient + holdings/page.tsx to pass `unknownCost`**

Both call sites construct `LotsTableRow[]`. They must include the new field. Open both files (`app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`, `app/(authenticated)/holdings/page.tsx`) and `app/(authenticated)/holdings/[catalogItemId]/page.tsx`. Add `unknownCost: lot.unknownCost ?? false` (or the field as exposed by the API DTO) when mapping rows.

The field flows from Task 12's per-lot DTO addition.

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/lots/LotsTable.test.tsx && npx tsc --noEmit`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add components/lots/ "app/(authenticated)/holdings"
git commit -m "feat(plan-8): LotsTable shows NoBasisPill for unknown-cost lots"
git push origin main
```

---

## Task 18: HoldingsGrid card — three states + caption

**Files:**
- Modify: `app/(authenticated)/holdings/HoldingsGrid.tsx`

- [ ] **Step 1: Read the existing card layout**

Open `app/(authenticated)/holdings/HoldingsGrid.tsx`. Identify the per-card render section: where `pnlCents`, `currentValueCents`, etc. are read from each `HoldingPnL`.

- [ ] **Step 2: Implement three render states**

Three branches per card, gated on `qtyHeldTracked` and `qtyHeldCollection`:

```tsx
import { NoBasisPill } from '@/components/holdings/NoBasisPill';
// ... existing imports

const isAllCollection = h.qtyHeldTracked === 0 && h.qtyHeldCollection > 0;
const isMixed = h.qtyHeldTracked > 0 && h.qtyHeldCollection > 0;

// Inside the card, after the qty badge:
{(isAllCollection || isMixed) && <NoBasisPill className="ml-1" />}

// In the P&L footer:
{isAllCollection ? (
  <div className="font-mono text-[12px] text-meta">
    No basis · vault total {h.currentValueCents != null ? formatCents(h.currentValueCents) : '—'}
  </div>
) : (
  // existing P&L footer (uses h.pnlCents which is already gated to tracked subset)
  // ... existing JSX
  <>
    {/* existing P&L number */}
    {isMixed && (
      <div className="text-[10px] font-mono text-meta mt-[2px]">
        +{h.qtyHeldCollection} in collection
      </div>
    )}
  </>
)}
```

(Match the exact existing JSX structure — the snippet above is illustrative. Do not break the existing layout.)

- [ ] **Step 3: Verify visually**

Start the dev server (`npm run dev`) and load `/holdings` after seeding at least one tracked lot, one collection lot, and one mixed catalog item via the AddPurchaseDialog flow. Confirm all three states render correctly.

- [ ] **Step 4: Verify tests + tsc**

Run: `npx tsc --noEmit && npx vitest run`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add "app/(authenticated)/holdings/HoldingsGrid.tsx"
git commit -m "feat(plan-8): HoldingsGrid card has all-tracked/all-collection/mixed states"
git push origin main
```

---

## Task 19: HoldingDetailClient — header gate + value caption

**Files:**
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

- [ ] **Step 1: Read the file**

Identify the header P&L block (where `currentValueCents`, `pnlCents`, `pnlPct` are rendered) and the surrounding layout.

- [ ] **Step 2: Update the header**

Two changes:

(a) When `holding.qtyHeldTracked === 0 && holding.qtyHeldCollection > 0`, replace the P&L block with a "No basis" caption:

```tsx
{holding.qtyHeldTracked === 0 && holding.qtyHeldCollection > 0 ? (
  <div className="font-mono text-[12px] text-meta">
    No basis · vault value {holding.currentValueCents != null ? formatCents(holding.currentValueCents) : '—'}
  </div>
) : (
  // existing P&L rendering using PnLDisplay
)}
```

(b) When `holding.qtyHeldCollection > 0` and tracked > 0 (mixed), add a sub-caption beneath the current value:

```tsx
{holding.qtyHeldCollection > 0 && holding.qtyHeldTracked > 0 && holding.currentValueTrackedCents != null && holding.currentValueCollectionCents != null && (
  <div className="text-[10px] font-mono text-meta mt-[4px]">
    {formatCents(holding.currentValueTrackedCents)} tracked · {formatCents(holding.currentValueCollectionCents)} in collection
  </div>
)}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vitest run`. Boot dev server, walk through holdings detail for tracked / mixed / all-collection items.

- [ ] **Step 4: Commit**

```bash
git add "app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx"
git commit -m "feat(plan-8): HoldingDetailClient header gates P&L on tracked subset"
git push origin main
```

---

## Task 20: EditPurchaseDialog — Set cost basis affordance

**Files:**
- Modify: `components/purchases/EditPurchaseDialog.tsx`
- Create: `components/purchases/EditPurchaseDialog.test.tsx` (if it doesn't exist; check first)
- Modify: `lib/query/hooks/usePurchases.ts` (extend `useUpdatePurchase` if needed)
- Modify: `components/purchases/PurchaseForm.tsx` (cost field disabled for unknown-cost initial values)

- [ ] **Step 1: Update EditPurchaseDialog and EditableLot**

Add `unknownCost: boolean` to `EditableLot`:

```ts
export type EditableLot = {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  unknownCost: boolean;
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  sourceRipId: number | null;
  sourceDecompositionId: number | null;
};
```

(Add `sourceDecompositionId` if it isn't already present — check; the spec's "derived child" rule covers both.)

Replace the dialog body to handle the conversion path:

```tsx
'use client';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { PurchaseForm, type PurchaseFormCatalogItem, type PurchaseFormValues } from './PurchaseForm';
import { useUpdatePurchase } from '@/lib/query/hooks/usePurchases';
import {
  VaultDialogHeader,
  FormHint,
  FormLabel,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { dollarsStringToCents } from '@/lib/utils/cents';

export type EditableLot = {
  id: number;
  catalogItemId: number;
  purchaseDate: string;
  quantity: number;
  costCents: number;
  unknownCost: boolean;
  source: string | null;
  location: string | null;
  notes: string | null;
  condition: string | null;
  isGraded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  certNumber: string | null;
  sourceRipId: number | null;
  sourceDecompositionId: number | null;
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
  const isDerivedChild = lot.sourceRipId != null || lot.sourceDecompositionId != null;
  const [conversionOpen, setConversionOpen] = useState(false);
  const [conversionDollars, setConversionDollars] = useState('');

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
        costCents: lot.unknownCost ? undefined : values.costCents,
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

  const handleConvert = async () => {
    const cents = dollarsStringToCents(conversionDollars);
    if (cents === null || cents < 0) return;
    await updateMutation.mutateAsync({
      id: lot.id,
      patch: {
        unknownCost: false,
        costCents: cents,
      },
    });
    setConversionOpen(false);
    setConversionDollars('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <VaultDialogHeader
          title="Edit purchase"
          sub={catalogItem.name}
        />
        {lot.sourceRipId != null && (
          <FormHint>
            This card was pulled from a rip - cost, qty, and date are locked to the rip record.
          </FormHint>
        )}
        {lot.sourceDecompositionId != null && (
          <FormHint>
            This pack came from an opened box - cost, qty, and date are locked to the box record.
          </FormHint>
        )}
        {lot.unknownCost && !conversionOpen && (
          <div className="border border-divider rounded-2xl p-4 bg-vault">
            <div className="text-[12px] text-meta mb-2">No cost basis on file. Excluded from P&amp;L.</div>
            {!isDerivedChild ? (
              <Button variant="ghost" onClick={() => setConversionOpen(true)}>
                Set cost basis
              </Button>
            ) : (
              <div className="text-[11px] text-meta">
                Convert the parent lot to set this row&apos;s cost basis.
              </div>
            )}
          </div>
        )}
        {lot.unknownCost && conversionOpen && (
          <div className="border border-divider rounded-2xl p-4 bg-vault">
            <FormLabel>Cost · per unit</FormLabel>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={conversionDollars}
              onChange={(e) => setConversionDollars(e.target.value)}
              autoFocus
            />
            <DialogActions>
              <Button variant="ghost" onClick={() => { setConversionOpen(false); setConversionDollars(''); }}>
                Cancel
              </Button>
              <Button
                onClick={handleConvert}
                disabled={updateMutation.isPending || !conversionDollars}
              >
                Save cost basis
              </Button>
            </DialogActions>
          </div>
        )}
        {!lot.unknownCost && (
          <PurchaseForm
            mode="edit"
            catalogItem={catalogItem}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitting={updateMutation.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Ensure call sites pass `unknownCost` and `sourceDecompositionId` on the `lot` prop**

Find every `<EditPurchaseDialog ... lot={...}>` usage (likely `HoldingDetailClient.tsx`). The lot DTO from the holding-detail API now includes `unknownCost` and `sourceDecompositionId` (Task 12). Map them through.

- [ ] **Step 3: Add unit test for the "Set cost basis" affordance**

Path: `components/purchases/EditPurchaseDialog.test.tsx`

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';

const updateMock = vi.fn(() => Promise.resolve({}));

vi.mock('@/lib/query/hooks/usePurchases', () => ({
  useUpdatePurchase: () => ({ mutateAsync: updateMock, isPending: false }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseCatalogItem = {
  id: 1,
  name: 'Test',
  kind: 'sealed' as const,
  setName: null,
  productType: null,
};

const baseLot: EditableLot = {
  id: 99,
  catalogItemId: 1,
  purchaseDate: '2026-04-01',
  quantity: 1,
  costCents: 0,
  unknownCost: true,
  source: null,
  location: null,
  notes: null,
  condition: null,
  isGraded: false,
  gradingCompany: null,
  grade: null,
  certNumber: null,
  sourceRipId: null,
  sourceDecompositionId: null,
};

describe('EditPurchaseDialog conversion flow', () => {
  it('shows "Set cost basis" button for unknown-cost non-derived lot', () => {
    render(wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={baseLot} />));
    expect(screen.getByRole('button', { name: /set cost basis/i })).toBeTruthy();
  });

  it('hides the button for unknown-cost derived child', () => {
    const child = { ...baseLot, sourceRipId: 1 };
    render(wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={child} />));
    expect(screen.queryByRole('button', { name: /set cost basis/i })).toBeNull();
  });

  it('submits PATCH with unknownCost: false and entered cents on save', async () => {
    render(wrap(<EditPurchaseDialog open onOpenChange={() => {}} catalogItem={baseCatalogItem} lot={baseLot} />));
    fireEvent.click(screen.getByRole('button', { name: /set cost basis/i }));
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '12.34' } });
    fireEvent.click(screen.getByRole('button', { name: /save cost basis/i }));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith({
        id: 99,
        patch: {
          unknownCost: false,
          costCents: 1234,
        },
      });
    });
  });
});
```

- [ ] **Step 4: Verify tests + tsc**

Run: `npx vitest run components/purchases/EditPurchaseDialog.test.tsx && npx tsc --noEmit`

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add components/purchases/EditPurchaseDialog.tsx components/purchases/EditPurchaseDialog.test.tsx "app/(authenticated)/holdings"
git commit -m "feat(plan-8): EditPurchaseDialog one-way conversion (unknown -> known)"
git push origin main
```

---

## Task 21: SaleRow + SaleDetailDialog — pill + per-leg pill

**Files:**
- Modify: `components/sales/SellDialog.tsx` (no — this is the entry; sale row rendering is elsewhere)
- Modify: `components/sales/SaleDetailDialog.tsx`
- Modify: `components/sales/SaleDetailDialog.test.tsx`
- Modify: every component that renders sale rows (search for `SaleRow` usage)

- [ ] **Step 1: Find sale-row render sites**

```bash
grep -rn "SaleEvent\|saleEvent\|salesEvents" components/ app/
```

The list-page (`app/(authenticated)/sales/page.tsx`) and holding-detail sales section (`HoldingDetailClient.tsx`) both render sale rows. Their row data already gains `unknownCost: boolean` from Task 14.

- [ ] **Step 2: Add a NoBasisPill next to the row's realized P&L**

In each sale-row render site:

```tsx
{row.unknownCost && <NoBasisPill className="ml-1" />}
```

beside the existing realized-P&L number.

- [ ] **Step 3: Update SaleDetailDialog**

Open `components/sales/SaleDetailDialog.tsx`. The dialog renders per-leg rows. Each leg's data structure now has `unknownCost: boolean` (from Task 14's per-leg surface). For each leg row, render `<NoBasisPill />` next to its realized number when `leg.unknownCost === true`.

- [ ] **Step 4: Update SaleDetailDialog.test.tsx**

Path: `components/sales/SaleDetailDialog.test.tsx`

If the file doesn't exist, create it; if it does, add a test that a fixture with `unknownCost: true` on a leg renders the "No basis" label inside the dialog. Match the existing test patterns.

- [ ] **Step 5: Verify**

Run: `npx vitest run components/sales/ && npx tsc --noEmit`

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/sales/ "app/(authenticated)/sales" "app/(authenticated)/holdings"
git commit -m "feat(plan-8): sale rows + detail dialog flag no-basis legs"
git push origin main
```

---

## Task 22: PortfolioHero — caption + value caption

**Files:**
- Modify: `components/dashboard/PortfolioHero.tsx`
- Modify: `components/dashboard/PortfolioHero.test.tsx`

- [ ] **Step 1: Update the caption builder**

Open `components/dashboard/PortfolioHero.tsx`. Locate the caption that today reads "Total invested across N lots · M sales".

Replace its construction with:

```tsx
function buildCaption(opts: {
  lotCountTracked: number;
  lotCountCollection: number;
  saleCount: number;
}) {
  const parts: string[] = [];
  if (opts.lotCountTracked > 0 || opts.lotCountCollection === 0) {
    parts.push(`Total invested across ${opts.lotCountTracked} tracked lots`);
  }
  if (opts.lotCountCollection > 0) {
    parts.push(`${opts.lotCountCollection} in collection`);
  }
  if (opts.saleCount > 0) {
    parts.push(`${opts.saleCount} sales`);
  }
  return parts.join(' · ');
}
```

Use this builder where the caption JSX is currently inlined. Source the new fields from the `/api/dashboard/totals` response (already widened in Task 13).

- [ ] **Step 2: Add the value sub-caption when mixed**

Beneath the "Current value" stat, when `qtyHeldCollectionAcrossPortfolio > 0` and `totalCurrentValueTrackedCents != null`:

```tsx
{totals.qtyHeldCollectionAcrossPortfolio > 0 && totals.totalCurrentValueTrackedCents != null && totals.totalCurrentValueCollectionCents != null && (
  <div className="text-[10px] font-mono text-meta mt-[4px]">
    {formatCents(totals.totalCurrentValueTrackedCents)} tracked · {formatCents(totals.totalCurrentValueCollectionCents)} in collection
  </div>
)}
```

- [ ] **Step 3: Update PortfolioHero.test.tsx**

Add a test fixture with mixed inventory; assert the caption contains "X tracked lots · Y in collection · Z sales" and the value sub-caption renders.

- [ ] **Step 4: Verify**

Run: `npx vitest run components/dashboard/PortfolioHero.test.tsx && npx tsc --noEmit`

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/PortfolioHero.tsx components/dashboard/PortfolioHero.test.tsx
git commit -m "feat(plan-8): PortfolioHero caption splits tracked/collection"
git push origin main
```

---

## Task 23: Catalog multi-select + BulkAddBar

**Files:**
- Create: `components/catalog/BulkAddBar.tsx`
- Create: `components/catalog/BulkAddBar.test.tsx`
- Modify: `components/catalog/SearchResultCard.tsx`
- Modify: `components/catalog/SearchResultCard.test.tsx`
- Modify: `app/(authenticated)/catalog/page.tsx`
- Modify: `lib/query/hooks/usePurchases.ts` — add `useBulkAddPurchases`

- [ ] **Step 1: Add `useBulkAddPurchases` hook**

In `lib/query/hooks/usePurchases.ts` add:

```ts
export function useBulkAddPurchases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ catalogItemId: number; quantity?: number; source?: string | null; purchaseDate?: string }>) => {
      const res = await fetch('/api/purchases/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'bulk_add_failed');
      }
      return res.json() as Promise<{ created: number; ids: number[] }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
    },
  });
}
```

(Match the file's existing import + export patterns. Use whatever queryKeys are canonical in this codebase.)

- [ ] **Step 2: Write the BulkAddBar test**

Path: `components/catalog/BulkAddBar.test.tsx`

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkAddBar } from './BulkAddBar';

describe('BulkAddBar', () => {
  it('renders the count and primary action', () => {
    render(<BulkAddBar count={3} onClear={() => {}} onSubmit={() => {}} pending={false} />);
    expect(screen.getByText(/3 selected/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /add to vault/i })).toBeTruthy();
  });

  it('calls onClear when "Clear" pressed', () => {
    const onClear = vi.fn();
    render(<BulkAddBar count={2} onClear={onClear} onSubmit={() => {}} pending={false} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onClear).toHaveBeenCalled();
  });

  it('calls onSubmit when primary pressed', () => {
    const onSubmit = vi.fn();
    render(<BulkAddBar count={2} onClear={() => {}} onSubmit={onSubmit} pending={false} />);
    fireEvent.click(screen.getByRole('button', { name: /add to vault/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('disables primary when pending', () => {
    render(<BulkAddBar count={2} onClear={() => {}} onSubmit={() => {}} pending />);
    expect(screen.getByRole('button', { name: /add to vault/i })).toHaveProperty('disabled', true);
  });
});
```

- [ ] **Step 3: Run test (should fail)**

Run: `npx vitest run components/catalog/BulkAddBar.test.tsx`

Expected: fails (component does not exist).

- [ ] **Step 4: Implement BulkAddBar**

Path: `components/catalog/BulkAddBar.tsx`

```tsx
'use client';
import { Button } from '@/components/ui/button';

export function BulkAddBar({
  count,
  onClear,
  onSubmit,
  pending,
}: {
  count: number;
  onClear: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-vault/95 backdrop-blur">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-text">{count} selected</span>
          <Button variant="ghost" onClick={onClear}>
            Clear
          </Button>
        </div>
        <Button onClick={onSubmit} disabled={pending}>
          {pending ? 'Adding...' : `Add ${count} to vault (no basis)`}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test (should pass)**

Run: `npx vitest run components/catalog/BulkAddBar.test.tsx`

Expected: green.

- [ ] **Step 6: Add a checkbox to SearchResultCard**

In `components/catalog/SearchResultCard.tsx`, accept new props:

```ts
selected?: boolean;
onSelectChange?: (selected: boolean) => void;
```

If `onSelectChange` is provided, render a leading checkbox at the top-left of the card (always visible — discoverability over chrome). Wire the checkbox to call `onSelectChange(!selected)`. The card itself remains a link to the detail page.

```tsx
{onSelectChange && (
  <input
    type="checkbox"
    aria-label={`Select ${name}`}
    checked={selected ?? false}
    onChange={(e) => onSelectChange(e.target.checked)}
    onClick={(e) => e.stopPropagation()}
    className="absolute left-2 top-2 z-10"
  />
)}
```

Update `SearchResultCard.test.tsx` with assertions: when `onSelectChange` is provided, the checkbox renders and toggles call the handler with the inverse boolean.

- [ ] **Step 7: Wire selection state into the catalog page**

Open `app/(authenticated)/catalog/page.tsx`. Add local state:

```tsx
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
const bulkAdd = useBulkAddPurchases();

const toggleSelected = (id: number) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const submitBulk = async () => {
  if (selectedIds.size === 0) return;
  await bulkAdd.mutateAsync(
    Array.from(selectedIds).map((catalogItemId) => ({ catalogItemId, quantity: 1 }))
  );
  setSelectedIds(new Set());
  // (optional: toast "Added N items to your vault.")
};
```

Pass `selected` + `onSelectChange={(v) => v ? selectedIds.add(...) : selectedIds.delete(...)}` (use `toggleSelected`) to each `<SearchResultCard>`.

Render `<BulkAddBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())} onSubmit={submitBulk} pending={bulkAdd.isPending} />` somewhere in the page tree (above the closing tag is fine — `position: fixed`).

- [ ] **Step 8: Verify tests + tsc + dev smoke**

Run: `npx tsc --noEmit && npx vitest run`

Then `npm run dev`, navigate to `/catalog`, search, tick a couple of cards, click "Add to vault (no basis)". Confirm toast or success and that the lots show on `/holdings` with "No basis" pill.

- [ ] **Step 9: Commit**

```bash
git add components/catalog/ "app/(authenticated)/catalog" lib/query/hooks/usePurchases.ts
git commit -m "feat(plan-8): catalog bulk multi-select adds collection lots"
git push origin main
```

---

## Task 24: Smoke + final ship marker

**Files:** none (verification only)

- [ ] **Step 1: Full test sweep**

```bash
npx tsc --noEmit
npx vitest run
npm run build
```

Expected: tsc clean, all tests pass (target ~412–417), build clean.

- [ ] **Step 2: Browser smoke**

`npm run dev`, walk through:

1. Open AddPurchaseDialog from holding detail. Tick "I don't know the cost basis". Confirm cost field disables, submit label flips to "Add to vault". Submit; lot appears with "No basis" pill.
2. Add a normal-cost lot to the same catalog item. Confirm holdings card now in mixed state with "+1 in collection" caption + tracked-subset P&L.
3. From `/catalog`, search "151", tick three result cards, click "Add to vault (no basis)". Confirm three new lots on `/holdings`.
4. Open EditPurchaseDialog on one of the no-basis lots. Click "Set cost basis", enter $50, save. Confirm the lot becomes a normal tracked lot (no pill, P&L renders).
5. Sell from a no-basis lot via SellDialog. Confirm SaleRow on `/sales` shows "No basis" pill; SaleDetailDialog flags the leg.
6. Open box on a no-basis sealed lot. Confirm child packs inherit "No basis" status.
7. Dashboard caption renders "Total invested across X tracked lots · Y in collection · Z sales".

- [ ] **Step 3: Final ship marker**

```bash
git commit --allow-empty -m "feat: ship Plan 8 (Collection-Tracking Mode)"
git push origin main
```

- [ ] **Step 4: Update memory**

Edit `C:\Users\Michael\.claude\projects\C--Users-Michael-Documents-Claude-Pokemon-Portfolio\memory\project_state.md`:

- Move Plan 8 from "brainstormed + spec'd" to "✅ shipped 2026-05-XX (final ship marker `<sha>`)".
- Record final test count.
- Record any deferred polish items (Plan 9 backlog candidates).

---

## Self-Review Notes

**Spec coverage check:**

- § 4 schema → Task 1
- § 4.3 HARD_FIELDS_FOR_DERIVED_CHILDREN → Task 5
- § 4.4 inheritance → Tasks 9, 10
- § 5.1 aggregation → Task 2
- § 5.2 per-holding gates → Task 3
- § 5.3 portfolio totals → Task 4
- § 5.4 performers filter → Task 4
- § 5.5 edge case (`pnlCents` returns null when tracked qty = 0 even if invested = 0) → Task 3 covers this in the gating; assertion present in the all-collection test
- § 5.6 realized P&L → Task 14 (UI badge); math is unchanged because cost = 0 already produces the right number through existing matchFifo
- § 5.7 dashboard caption → Task 22
- § 6.1 POST /api/purchases → Task 6
- § 6.2 POST /api/purchases/bulk → Task 8
- § 6.3 PATCH /api/purchases/[id] → Task 7
- § 6.4 read-side extensions → Tasks 11, 12, 13, 14
- § 7.1 AddPurchaseDialog → Task 16
- § 7.2 catalog bulk → Task 23
- § 7.3 HoldingsGrid → Task 18
- § 7.4 HoldingDetailClient + LotsTable → Tasks 17, 19
- § 7.5 EditPurchaseDialog → Task 20
- § 7.6 SaleRow + SaleDetailDialog → Task 21
- § 7.7 PortfolioHero → Task 22
- § 7.8 PerformersStrip → Task 4 (filter rule lives in `computePortfolioPnL`; component reads from API, no separate change needed)
- § 8 children inheritance behavior → Tasks 9, 10, 5 (via lock list), 7 (conversion-with-children footnote surfaces via the EditPurchaseDialog tooltip in Task 20)
- § 9 tests → distributed across all tasks; final count verified in Task 24

**Type consistency check:**

- `unknownCost` (camelCase) on Drizzle / DTOs / API JSON / props
- `unknown_cost` (snake_case) on raw Postgres column / supabase select strings / inserted rows
- `qtyHeldTracked`, `qtyHeldCollection`, `currentValueTrackedCents`, `currentValueCollectionCents`, `totalCurrentValueTrackedCents`, `totalCurrentValueCollectionCents`, `qtyHeldTrackedAcrossPortfolio`, `qtyHeldCollectionAcrossPortfolio`, `lotCountTracked`, `lotCountCollection` — names consistent across plan
- `cannot_unset_basis` 422 error string
- `catalog_items_not_found` for the bulk-add 404
- `NoBasisPill` component name

**Placeholder scan:** no TODO/TBD/"add validation"/"handle edge cases" remain. Code blocks are present at every code-changing step.
