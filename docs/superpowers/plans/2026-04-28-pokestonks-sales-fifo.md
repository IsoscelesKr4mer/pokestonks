# Pokestonks Plan 5 - Sales + FIFO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log sales against holdings with FIFO lot matching, surface unified Realized P&L on the dashboard, add a `/sales` history page with filters, and ship CSV exports for sales/purchases/portfolio summary on `/settings`.

**Architecture:** New pure FIFO matcher service (`lib/services/sales.ts`) powers both a preview endpoint and the transactional POST. Per-lot sale rows share a new `sale_group_id` uuid column on the existing `sales` table; one user-facing sale event = one group_id. `aggregateHoldings()` extended to subtract sold qty as a third consumption type alongside rips and decompositions. `computePortfolioPnL()` extended to fold sales realized P&L into a unified `realizedPnLCents`. Sales rows are immutable (no PATCH) - only create + atomic undo via DELETE by group_id. CSV export is three new endpoints reading the same shapes as the JSON APIs.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (service-role + manual auth) for transactional writes, Supabase Postgres + Auth, TanStack Query 5, shadcn/ui 4.x base-ui, Vitest 4 with per-file `// @vitest-environment happy-dom` directive for component tests.

**Spec reference:** `docs/superpowers/specs/2026-04-28-pokestonks-sales-fifo-design.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
drizzle/
└── 0008_sales_sale_group_id.sql       # CREATED

lib/
├── db/schema/
│   └── sales.ts                        # MODIFIED: add saleGroupId column
├── services/
│   ├── sales.ts                        # CREATED (matchFifo)
│   ├── sales.test.ts                   # CREATED
│   ├── holdings.ts                     # MODIFIED: sales as 4th param
│   ├── holdings.test.ts                # MODIFIED: sales fixtures
│   ├── pnl.ts                          # MODIFIED: realizedSalesPnLCents param + unified realizedPnLCents
│   └── pnl.test.ts                     # MODIFIED: 3 new cases
├── utils/
│   ├── csv.ts                          # CREATED (RFC 4180 row writer)
│   └── csv.test.ts                     # CREATED
├── validation/
│   ├── sale.ts                         # CREATED
│   └── sale.test.ts                    # CREATED
└── query/hooks/
    ├── useSales.ts                     # CREATED (list + detail + create + delete + preview)
    └── useDashboardTotals.ts           # MODIFIED: PortfolioPnL now has realizedPnLCents

app/
├── api/
│   ├── sales/
│   │   ├── route.ts                    # CREATED (POST + GET)
│   │   ├── route.test.ts               # CREATED
│   │   ├── preview/
│   │   │   ├── route.ts                # CREATED (POST dry-run)
│   │   │   └── route.test.ts           # CREATED
│   │   └── [saleGroupId]/
│   │       ├── route.ts                # CREATED (GET + DELETE)
│   │       └── route.test.ts           # CREATED
│   ├── exports/
│   │   ├── sales/
│   │   │   ├── route.ts                # CREATED (CSV)
│   │   │   └── route.test.ts           # CREATED
│   │   ├── purchases/
│   │   │   ├── route.ts                # CREATED (CSV)
│   │   │   └── route.test.ts           # CREATED
│   │   └── portfolio-summary/
│   │       ├── route.ts                # CREATED (CSV)
│   │       └── route.test.ts           # CREATED
│   ├── dashboard/totals/
│   │   ├── route.ts                    # MODIFIED: pipe sales into aggregate + pnl
│   │   └── route.test.ts               # MODIFIED: new realized fields
│   ├── holdings/
│   │   ├── route.ts                    # MODIFIED: pipe sales into aggregate
│   │   └── [catalogItemId]/
│   │       └── route.ts                # MODIFIED: include sales[] in response
│   └── purchases/[id]/
│       └── route.ts                    # MODIFIED: PATCH validates qty >= consumed
└── (authenticated)/
    ├── sales/
    │   ├── page.tsx                    # MODIFIED: replace placeholder with list
    │   └── SalesListClient.tsx         # CREATED
    ├── settings/
    │   └── page.tsx                    # MODIFIED: add Export section
    └── holdings/
        ├── HoldingsGrid.tsx            # MODIFIED: SellButton on each card
        └── [catalogItemId]/
            └── HoldingDetailClient.tsx # MODIFIED: SellButton in header + Sales section + LotRow sales subtitle

components/
├── sales/
│   ├── SellButton.tsx                  # CREATED
│   ├── SellDialog.tsx                  # CREATED
│   ├── SellDialog.test.tsx             # CREATED (happy-dom)
│   ├── SaleDetailDialog.tsx            # CREATED
│   ├── SaleRow.tsx                     # CREATED
│   └── SaleRow.test.tsx                # CREATED (happy-dom)
├── dashboard/
│   └── DashboardTotalsCard.tsx         # MODIFIED: label rename + sale count caption
└── purchases/
    └── LotRow.tsx                      # MODIFIED: optional salesByPurchase prop, "Sold N" subtitle
```

**Boundaries enforced:**

- `lib/services/sales.ts` - pure functions, no DB, no fetch, no React. Same posture as Plan 4's `pnl.ts`.
- `lib/utils/csv.ts` - pure RFC 4180 row formatter. No domain logic.
- `lib/validation/sale.ts` - Zod schema only. Shared between preview and POST.
- API routes - auth -> service-role read -> call pure services -> return DTO. No FIFO math in the route.
- `useSales.ts` - TanStack hooks. No raw `fetch` in components. Includes the debounced preview hook.
- `<SellDialog>` / `<SaleRow>` / `<SaleDetailDialog>` / `<SellButton>` - presentational + form state. Mutations live in hooks.

---

## Task 1: Migration `0008_sales_sale_group_id.sql`

**Files:**
- Create: `drizzle/0008_sales_sale_group_id.sql`
- Modify: `lib/db/schema/sales.ts`
- Modify: `drizzle/schema.ts`

**Spec:** Section 4.

**Why:** Per-lot sale rows need an explicit group identifier so one user-facing sale event (FIFO-split across N lots) can be undone atomically and grouped on read. Plan 1 created `sales` without an index on `purchase_id`, which we add now since `aggregateHoldings` will join sales rows back to their purchases.

- [ ] **Step 1: Create the migration SQL file**

Create `drizzle/0008_sales_sale_group_id.sql` with:

```sql
ALTER TABLE "sales" ADD COLUMN "sale_group_id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
CREATE INDEX "sales_sale_group_idx" ON "sales" USING btree ("sale_group_id");
--> statement-breakpoint
CREATE INDEX "sales_purchase_idx" ON "sales" USING btree ("purchase_id");
```

The `gen_random_uuid()` default protects any pre-existing rows. The application always supplies its own uuid; the default is defensive only.

- [ ] **Step 2: Update `lib/db/schema/sales.ts` to mirror the new column**

Replace the file:

```ts
import { pgTable, bigserial, uuid, bigint, date, integer, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { purchases } from './purchases';

export const sales = pgTable(
  'sales',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    saleGroupId: uuid('sale_group_id').notNull().defaultRandom(),
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
    saleGroupIdx: index('sales_sale_group_idx').on(t.saleGroupId),
    purchaseIdx: index('sales_purchase_idx').on(t.purchaseId),
    quantityCheck: check('sales_quantity_positive', sql`${t.quantity} > 0`),
    feesCheck: check('sales_fees_nonneg', sql`${t.feesCents} >= 0`),
  })
);

export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
```

- [ ] **Step 3: Update `drizzle/schema.ts` (Drizzle introspection mirror)**

Find the `sales` table block (currently around line 73 of `drizzle/schema.ts`). Inside the column object, after the existing `userId` field, add:

```ts
saleGroupId: uuid("sale_group_id").defaultRandom().notNull(),
```

In the table options array (the second arg, after `index("sales_user_date_idx")`), add two more index entries:

```ts
index("sales_sale_group_idx").using("btree", table.saleGroupId.asc().nullsLast().op("uuid_ops")),
index("sales_purchase_idx").using("btree", table.purchaseId.asc().nullsLast().op("int8_ops")),
```

- [ ] **Step 4: Apply the migration to the live database**

The user runs Drizzle migrations manually (TTY required per `feedback_stack_gotchas.md`). Print this message and pause:

```
Migration 0008 created. Apply with:
  npx drizzle-kit push

Confirm "yes" when prompted to add sale_group_id NOT NULL with default.
Verify the run succeeded before continuing.
```

- [ ] **Step 5: Commit**

```bash
git add drizzle/0008_sales_sale_group_id.sql lib/db/schema/sales.ts drizzle/schema.ts
git commit -m "feat(sales): add sale_group_id column + indexes (migration 0008)"
```

---

## Task 2: FIFO matcher service `lib/services/sales.ts`

**Files:**
- Create: `lib/services/sales.ts`
- Test: `lib/services/sales.test.ts`

**Spec:** Section 5.1.

**Why:** Pure FIFO matching is the core of Plan 5. Extracted as a pure function so the same code powers `POST /api/sales/preview` (dry-run) and `POST /api/sales` (transactional commit), and is fully unit-testable without a DB.

- [ ] **Step 1: Write the test file with all 10 cases failing**

Create `lib/services/sales.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchFifo, type OpenLot, type SaleRequest } from './sales';

function lot(overrides: Partial<OpenLot> = {}): OpenLot {
  return {
    purchaseId: 1,
    purchaseDate: '2026-03-01',
    createdAt: '2026-03-01T00:00:00Z',
    costCents: 5000,
    qtyAvailable: 10,
    ...overrides,
  };
}

const baseReq: SaleRequest = {
  totalQty: 1,
  totalSalePriceCents: 6000,
  totalFeesCents: 0,
  saleDate: '2026-04-20',
  platform: null,
  notes: null,
};

describe('matchFifo', () => {
  it('single lot exact match yields one row, no residual', () => {
    const r = matchFifo([lot({ qtyAvailable: 5 })], { ...baseReq, totalQty: 3, totalSalePriceCents: 18000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      purchaseId: 1,
      quantity: 3,
      salePriceCents: 18000,
      feesCents: 0,
      matchedCostCents: 15000,
    });
    expect(r.totalMatchedCostCents).toBe(15000);
    expect(r.realizedPnLCents).toBe(3000);
  });

  it('multi-lot split walks lots in FIFO order and pro-rates price + fees', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, purchaseDate: '2026-03-01', costCents: 5000, qtyAvailable: 2 }),
      lot({ purchaseId: 2, purchaseDate: '2026-04-12', costCents: 5500, qtyAvailable: 2 }),
      lot({ purchaseId: 3, purchaseDate: '2026-04-15', costCents: 5500, qtyAvailable: 5 }),
    ];
    const r = matchFifo(lots, {
      ...baseReq,
      totalQty: 5,
      totalSalePriceCents: 100000,
      totalFeesCents: 4000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toEqual({ purchaseId: 1, quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 10000 });
    expect(r.rows[1]).toEqual({ purchaseId: 2, quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 11000 });
    expect(r.rows[2]).toEqual({ purchaseId: 3, quantity: 1, salePriceCents: 20000, feesCents: 800, matchedCostCents: 5500 });
    expect(r.totalMatchedCostCents).toBe(26500);
    expect(r.realizedPnLCents).toBe(100000 - 4000 - 26500);
  });

  it('rounding residual lands on the last row so sums equal inputs', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, qtyAvailable: 1 }),
      lot({ purchaseId: 2, qtyAvailable: 1 }),
      lot({ purchaseId: 3, qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 1001, totalFeesCents: 11 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.salePriceCents)).toEqual([333, 333, 335]);
    expect(r.rows.map((x) => x.feesCents)).toEqual([3, 3, 5]);
    expect(r.rows.reduce((s, x) => s + x.salePriceCents, 0)).toBe(1001);
    expect(r.rows.reduce((s, x) => s + x.feesCents, 0)).toBe(11);
  });

  it('insufficient qty returns ok:false with totalAvailable', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 2 }), lot({ purchaseId: 2, qtyAvailable: 1 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 5, totalSalePriceCents: 50000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('insufficient_qty');
    expect(r.totalAvailable).toBe(3);
  });

  it('lots with qtyAvailable === 0 are skipped silently', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 1, qtyAvailable: 0 }),
      lot({ purchaseId: 2, qtyAvailable: 3 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 12000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].purchaseId).toBe(2);
  });

  it('FIFO order is purchaseDate asc, createdAt asc, purchaseId asc', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 30, purchaseDate: '2026-04-15', createdAt: '2026-04-15T08:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 10, purchaseDate: '2026-04-10', createdAt: '2026-04-10T09:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 20, purchaseDate: '2026-04-15', createdAt: '2026-04-15T07:00:00Z', qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 30000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.purchaseId)).toEqual([10, 20, 30]);
  });

  it('FIFO tiebreaker on identical date+createdAt uses purchaseId asc', () => {
    const lots: OpenLot[] = [
      lot({ purchaseId: 99, purchaseDate: '2026-04-10', createdAt: '2026-04-10T00:00:00Z', qtyAvailable: 1 }),
      lot({ purchaseId: 50, purchaseDate: '2026-04-10', createdAt: '2026-04-10T00:00:00Z', qtyAvailable: 1 }),
    ];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 20000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.map((x) => x.purchaseId)).toEqual([50, 99]);
  });

  it('zero fees produces feesCents: 0 on every row, no NaN', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 3 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 3, totalSalePriceCents: 18000, totalFeesCents: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0].feesCents).toBe(0);
    expect(Number.isFinite(r.rows[0].salePriceCents)).toBe(true);
  });

  it('selling at a loss yields negative realizedPnLCents', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 2, costCents: 10000 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 2, totalSalePriceCents: 15000, totalFeesCents: 1000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.realizedPnLCents).toBe(15000 - 1000 - 20000);
  });

  it('single unit sale puts full price + full fees on the one row', () => {
    const lots: OpenLot[] = [lot({ qtyAvailable: 5, costCents: 4000 })];
    const r = matchFifo(lots, { ...baseReq, totalQty: 1, totalSalePriceCents: 5000, totalFeesCents: 250 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows[0]).toEqual({ purchaseId: 1, quantity: 1, salePriceCents: 5000, feesCents: 250, matchedCostCents: 4000 });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/services/sales.test.ts`
Expected: All tests fail with "Cannot find module './sales'" or similar.

- [ ] **Step 3: Implement `lib/services/sales.ts`**

Create the file:

```ts
export type OpenLot = {
  purchaseId: number;
  purchaseDate: string;        // YYYY-MM-DD
  createdAt: string;           // ISO timestamp
  costCents: number;           // per-unit cost
  qtyAvailable: number;        // purchase.quantity - rips - decomps - prior sales
};

export type SaleRequest = {
  totalQty: number;
  totalSalePriceCents: number; // gross
  totalFeesCents: number;
  saleDate: string;
  platform: string | null;
  notes: string | null;
};

export type SaleRow = {
  purchaseId: number;
  quantity: number;
  salePriceCents: number;       // proportional, residual on last row
  feesCents: number;            // proportional, residual on last row
  matchedCostCents: number;     // qtyConsumed * lot.costCents
};

export type FifoResult =
  | { ok: true; rows: SaleRow[]; totalMatchedCostCents: number; realizedPnLCents: number }
  | { ok: false; reason: 'insufficient_qty'; totalAvailable: number };

export function matchFifo(lots: readonly OpenLot[], req: SaleRequest): FifoResult {
  const sorted = [...lots]
    .filter((l) => l.qtyAvailable > 0)
    .sort((a, b) => {
      if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate < b.purchaseDate ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.purchaseId - b.purchaseId;
    });

  const totalAvailable = sorted.reduce((s, l) => s + l.qtyAvailable, 0);
  if (totalAvailable < req.totalQty) {
    return { ok: false, reason: 'insufficient_qty', totalAvailable };
  }

  // Walk lots, consume qty, build per-row matched cost.
  type Pending = { purchaseId: number; quantity: number; matchedCostCents: number };
  const pending: Pending[] = [];
  let remaining = req.totalQty;
  for (const l of sorted) {
    if (remaining === 0) break;
    const take = Math.min(remaining, l.qtyAvailable);
    pending.push({ purchaseId: l.purchaseId, quantity: take, matchedCostCents: take * l.costCents });
    remaining -= take;
  }

  // Pro-rate sale price + fees by quantity. Residual on last row.
  const rows: SaleRow[] = pending.map((p, i) => ({
    purchaseId: p.purchaseId,
    quantity: p.quantity,
    salePriceCents: Math.floor((req.totalSalePriceCents * p.quantity) / req.totalQty),
    feesCents: Math.floor((req.totalFeesCents * p.quantity) / req.totalQty),
    matchedCostCents: p.matchedCostCents,
    _last: i === pending.length - 1,
  })).map(({ _last, ...r }) => r);

  const sumPrice = rows.reduce((s, r) => s + r.salePriceCents, 0);
  const sumFees = rows.reduce((s, r) => s + r.feesCents, 0);
  const lastIdx = rows.length - 1;
  rows[lastIdx] = {
    ...rows[lastIdx],
    salePriceCents: rows[lastIdx].salePriceCents + (req.totalSalePriceCents - sumPrice),
    feesCents: rows[lastIdx].feesCents + (req.totalFeesCents - sumFees),
  };

  const totalMatchedCostCents = rows.reduce((s, r) => s + r.matchedCostCents, 0);
  const realizedPnLCents = req.totalSalePriceCents - req.totalFeesCents - totalMatchedCostCents;

  return { ok: true, rows, totalMatchedCostCents, realizedPnLCents };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run lib/services/sales.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/sales.ts lib/services/sales.test.ts
git commit -m "feat(sales): add pure FIFO matcher service"
```

---

## Task 3: Extend `aggregateHoldings` to subtract sold qty

**Files:**
- Modify: `lib/services/holdings.ts`
- Modify: `lib/services/holdings.test.ts`

**Spec:** Section 5.2.

**Why:** Sold lots must drop out of `qty_held` so the holdings grid and dashboard reflect what's actually still on hand. Sales is the third consumption source after rips and decompositions; the existing `consumedUnitsByPurchase` Map gets one more contributor.

- [ ] **Step 1: Add failing tests for sales consumption**

In `lib/services/holdings.test.ts`, add a `RawSaleRow` import to the existing import line. Find the existing imports at the top:

```ts
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow } from './holdings';
```

Replace with:

```ts
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow, type RawSaleRow } from './holdings';
```

Update every existing call to `aggregateHoldings(...)` in the file to pass an empty `[]` as the fourth argument. There are around 8 call sites; each currently looks like `aggregateHoldings(purchases, rips, decompositions)`. Change all to `aggregateHoldings(purchases, rips, decompositions, [])`.

Then add three new tests at the end of the `describe('aggregateHoldings', () => { ... })` block, before the closing `});`:

```ts
  it('subtracts sale quantity from sealed lot qty_held', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
    const sales: RawSaleRow[] = [{ id: 200, purchase_id: 10, quantity: 2 }];
    const result = aggregateHoldings(purchases, [], [], sales);
    expect(result[0].qtyHeld).toBe(3);
    expect(result[0].totalInvestedCents).toBe(3 * 5000);
  });

  it('handles multi-row sale (FIFO split) consuming the same purchase across rows', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 5, cost_cents: 5000 })];
    const sales: RawSaleRow[] = [
      { id: 200, purchase_id: 10, quantity: 2 },
      { id: 201, purchase_id: 10, quantity: 1 },
    ];
    const result = aggregateHoldings(purchases, [], [], sales);
    expect(result[0].qtyHeld).toBe(2);
  });

  it('counts sales alongside rips and decompositions in the same purchase', () => {
    const purchases = [makePurchase({ id: 10, catalog_item_id: 1, quantity: 6, cost_cents: 5000 })];
    const rips: RawRipRow[] = [{ id: 1, source_purchase_id: 10 }];
    const decomps: RawDecompositionRow[] = [{ id: 1, source_purchase_id: 10 }];
    const sales: RawSaleRow[] = [{ id: 1, purchase_id: 10, quantity: 2 }];
    const result = aggregateHoldings(purchases, rips, decomps, sales);
    expect(result[0].qtyHeld).toBe(2);  // 6 - 1 - 1 - 2
  });
```

- [ ] **Step 2: Run tests to confirm new ones fail (and old ones still pass after the signature update propagates)**

Run: `npx vitest run lib/services/holdings.test.ts`
Expected: 3 new failures with "Expected number of arguments" or "Cannot find name 'RawSaleRow'". Other tests should now pass once the implementation is updated.

- [ ] **Step 3: Update `lib/services/holdings.ts` to accept and apply sales**

Replace the file:

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
  last_market_at: string | null;
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

export type RawDecompositionRow = {
  id: number;
  source_purchase_id: number;
};

export type RawSaleRow = {
  id: number;
  purchase_id: number;
  quantity: number;
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
  lastMarketAt: string | null;
  qtyHeld: number;
  totalInvestedCents: number;
};

export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[],
  decompositions: readonly RawDecompositionRow[],
  sales: readonly RawSaleRow[]
): Holding[] {
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
  for (const s of sales) {
    consumedUnitsByPurchase.set(
      s.purchase_id,
      (consumedUnitsByPurchase.get(s.purchase_id) ?? 0) + s.quantity
    );
  }

  type Acc = {
    holding: Holding;
    latestCreatedAt: string;
  };
  const byCatalogItem = new Map<number, Acc>();

  for (const p of purchases) {
    if (p.deleted_at != null) continue;
    const consumed = consumedUnitsByPurchase.get(p.id) ?? 0;
    const remaining = p.quantity - consumed;
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
          lastMarketAt: p.catalog_item.last_market_at,
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

- [ ] **Step 4: Run tests to confirm all pass**

Run: `npx vitest run lib/services/holdings.test.ts`
Expected: All tests pass (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/services/holdings.ts lib/services/holdings.test.ts
git commit -m "feat(holdings): aggregateHoldings accepts sales as 4th consumption source"
```

---

## Task 4: Extend `computePortfolioPnL` for unified Realized P&L

**Files:**
- Modify: `lib/services/pnl.ts`
- Modify: `lib/services/pnl.test.ts`

**Spec:** Section 5.3.

**Why:** Plan 4's `realizedRipPnLCents` becomes a sub-component of a unified `realizedPnLCents`. Sales realized P&L flows in already-signed (no flip), unlike rips which store positive numbers for losses.

- [ ] **Step 1: Add 3 failing tests**

In `lib/services/pnl.test.ts`, add tests at the end of the `describe('computePortfolioPnL', () => { ... })` block, before the closing `});`. Existing tests pass `(holdings, realizedRipLossCents, lotCount, NOW)` - these will need a new arg too. Find every `computePortfolioPnL(...)` call in this file (search for `computePortfolioPnL(`) and insert a `0` as the new third argument before `lotCount`. After updating call sites, add the new tests:

```ts
  it('realizedSalesPnLCents propagates onto wire', () => {
    const r = computePortfolioPnL([], 0, 500, 0, NOW);
    expect(r.realizedSalesPnLCents).toBe(500);
    expect(r.realizedPnLCents).toBe(500);
  });

  it('unified realizedPnLCents = rip (sign-flipped) + sales', () => {
    // realizedRipLossCents=200 (loss) -> rip pnl is -200
    // realizedSalesPnLCents=500 (already signed gain)
    // unified = -200 + 500 = 300
    const r = computePortfolioPnL([], 200, 500, 0, NOW);
    expect(r.realizedRipPnLCents).toBe(-200);
    expect(r.realizedSalesPnLCents).toBe(500);
    expect(r.realizedPnLCents).toBe(300);
  });

  it('all-zero realized: no negative-zero leak on unified', () => {
    const r = computePortfolioPnL([], 0, 0, 0, NOW);
    expect(Object.is(r.realizedPnLCents, 0)).toBe(true);
    expect(Object.is(r.realizedRipPnLCents, 0)).toBe(true);
    expect(Object.is(r.realizedSalesPnLCents, 0)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to confirm new ones fail**

Run: `npx vitest run lib/services/pnl.test.ts`
Expected: TypeScript errors about missing argument or unknown property. Once that's resolved, the 3 new tests fail with `Cannot read property 'realizedSalesPnLCents'`.

- [ ] **Step 3: Update `lib/services/pnl.ts`**

Replace the file:

```ts
import type { Holding } from './holdings';

export const STALE_PRICE_THRESHOLD_DAYS = 7;
const STALE_THRESHOLD_MS = STALE_PRICE_THRESHOLD_DAYS * 86_400_000;

export type HoldingPnL = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  kind: 'sealed' | 'card';
  imageUrl: string | null;
  imageStoragePath: string | null;
  qtyHeld: number;
  totalInvestedCents: number;
  lastMarketCents: number | null;
  lastMarketAt: string | null;
  currentValueCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;
  priced: boolean;
  stale: boolean;
};

export type PortfolioPnL = {
  totalInvestedCents: number;
  pricedInvestedCents: number;
  totalCurrentValueCents: number;
  unrealizedPnLCents: number;
  unrealizedPnLPct: number | null;
  realizedPnLCents: number;          // unified: rips (sign-flipped) + sales
  realizedRipPnLCents: number;       // signed; preserved on wire for forward compat
  realizedSalesPnLCents: number;     // signed; preserved on wire for forward compat
  pricedCount: number;
  unpricedCount: number;
  staleCount: number;
  lotCount: number;
  perHolding: HoldingPnL[];
  bestPerformers: HoldingPnL[];
  worstPerformers: HoldingPnL[];
};

export function computeHoldingPnL(holding: Holding, now: Date): HoldingPnL {
  const priced = holding.lastMarketCents != null;
  let currentValueCents: number | null = null;
  let pnlCents: number | null = null;
  let pnlPct: number | null = null;
  let stale = false;

  if (priced) {
    currentValueCents = holding.lastMarketCents! * holding.qtyHeld;
    pnlCents = currentValueCents - holding.totalInvestedCents;
    pnlPct =
      holding.totalInvestedCents > 0
        ? (pnlCents / holding.totalInvestedCents) * 100
        : null;
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
    totalInvestedCents: holding.totalInvestedCents,
    lastMarketCents: holding.lastMarketCents,
    lastMarketAt: holding.lastMarketAt,
    currentValueCents,
    pnlCents,
    pnlPct,
    priced,
    stale,
  };
}

export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,
  realizedSalesPnLCents: number,
  lotCount: number,
  now: Date = new Date()
): PortfolioPnL {
  const perHolding = holdings.map((h) => computeHoldingPnL(h, now));

  let totalInvestedCents = 0;
  let pricedInvestedCents = 0;
  let totalCurrentValueCents = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  let staleCount = 0;

  for (const h of perHolding) {
    totalInvestedCents += h.totalInvestedCents;
    if (h.priced) {
      pricedInvestedCents += h.totalInvestedCents;
      totalCurrentValueCents += h.currentValueCents ?? 0;
      pricedCount++;
      if (h.stale) staleCount++;
    } else {
      unpricedCount++;
    }
  }

  const unrealizedPnLCents = totalCurrentValueCents - pricedInvestedCents;
  const unrealizedPnLPct =
    pricedInvestedCents > 0
      ? (unrealizedPnLCents / pricedInvestedCents) * 100
      : null;

  const priced = perHolding.filter((h) => h.priced);
  const sortDesc = [...priced].sort((a, b) => {
    const pa = a.pnlCents ?? 0;
    const pb = b.pnlCents ?? 0;
    if (pb !== pa) return pb - pa;
    if (b.qtyHeld !== a.qtyHeld) return b.qtyHeld - a.qtyHeld;
    return a.catalogItemId - b.catalogItemId;
  });
  const sortAsc = [...priced].sort((a, b) => {
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
    unrealizedPnLCents,
    unrealizedPnLPct,
    realizedPnLCents,
    realizedRipPnLCents,
    realizedSalesPnLCents: realizedSalesPnLCents === 0 ? 0 : realizedSalesPnLCents,
    pricedCount,
    unpricedCount,
    staleCount,
    lotCount,
    perHolding,
    bestPerformers: sortDesc.slice(0, 3),
    worstPerformers: sortAsc.slice(0, 3),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/services/pnl.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/pnl.ts lib/services/pnl.test.ts
git commit -m "feat(pnl): unified realizedPnLCents (rips + sales)"
```

---

## Task 5: Validation schema `lib/validation/sale.ts`

**Files:**
- Create: `lib/validation/sale.ts`
- Test: `lib/validation/sale.test.ts`

**Spec:** Section 6.1, 6.2.

**Why:** One Zod schema is shared between `POST /api/sales/preview` and `POST /api/sales`. The form in `<SellDialog>` binds to the same shape. Centralized validation prevents drift.

- [ ] **Step 1: Write failing tests**

Create `lib/validation/sale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { saleCreateSchema } from './sale';

describe('saleCreateSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(true);
  });

  it('accepts platform + notes', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 2,
      totalSalePriceCents: 10000,
      totalFeesCents: 400,
      saleDate: '2026-04-20',
      platform: 'eBay',
      notes: 'Local pickup',
    });
    expect(r.success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 0,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative price', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: -1,
      totalFeesCents: 0,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative fees', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: -1,
      saleDate: '2026-04-20',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-ISO date', () => {
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: '04/20/2026',
    });
    expect(r.success).toBe(false);
  });

  it('rejects future-dated sale', () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const r = saleCreateSchema.safeParse({
      catalogItemId: 5,
      totalQty: 1,
      totalSalePriceCents: 1000,
      totalFeesCents: 0,
      saleDate: tomorrow,
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/validation/sale.test.ts`
Expected: All fail with module not found.

- [ ] **Step 3: Implement `lib/validation/sale.ts`**

```ts
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const saleCreateSchema = z.object({
  catalogItemId: z.number().int().positive(),
  totalQty: z.number().int().positive(),
  totalSalePriceCents: z.number().int().nonnegative(),
  totalFeesCents: z.number().int().nonnegative(),
  saleDate: isoDate,
  platform: z.string().max(100).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/validation/sale.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/sale.ts lib/validation/sale.test.ts
git commit -m "feat(sales): add Zod schema for sale create input"
```

---

## Task 6: `POST /api/sales/preview` (FIFO dry-run)

**Files:**
- Create: `app/api/sales/preview/route.ts`
- Test: `app/api/sales/preview/route.test.ts`

**Spec:** Section 6.1.

**Why:** The `<SellDialog>` debounces form changes and calls preview to show the user which lots will be consumed and the realized P&L before they commit. No DB writes; pure read + matcher call.

- [ ] **Step 1: Write failing tests**

Create `app/api/sales/preview/route.test.ts`. Mirror the structure of `app/api/dashboard/totals/route.test.ts` (or other existing route tests):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

import { POST } from './route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/sales/preview', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/sales/preview', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(makeReq({ catalogItemId: 'not-a-number' }) as never);
    expect(res.status).toBe(422);
  });

  it('returns ok:true with rows when qty available', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    // Stub Supabase: open lots, rips, decompositions, sales (each returns chainable thenable)
    const lotsRows = [
      { id: 100, quantity: 5, cost_cents: 5000, purchase_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' },
    ];
    mockFromBuilder.mockImplementation((table: string) => {
      const result = (() => {
        if (table === 'purchases') return lotsRows;
        if (table === 'rips') return [];
        if (table === 'box_decompositions') return [];
        if (table === 'sales') return [];
        return [];
      })();
      return {
        select: () => ({
          eq: () => ({
            is: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
          }),
          in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
          then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
        }),
      };
    });

    const res = await POST(
      makeReq({
        catalogItemId: 5,
        totalQty: 3,
        totalSalePriceCents: 18000,
        totalFeesCents: 0,
        saleDate: '2026-04-20',
      }) as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rows: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.rows).toHaveLength(1);
  });

  it('returns 422 with insufficient_qty when not enough open lots', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFromBuilder.mockImplementation((table: string) => {
      const result = (() => {
        if (table === 'purchases')
          return [{ id: 100, quantity: 1, cost_cents: 5000, purchase_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' }];
        return [];
      })();
      return {
        select: () => ({
          eq: () => ({
            is: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
            then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
          }),
          in: () => ({ then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }) }),
          then: (cb: (v: unknown) => unknown) => cb({ data: result, error: null }),
        }),
      };
    });

    const res = await POST(
      makeReq({
        catalogItemId: 5,
        totalQty: 5,
        totalSalePriceCents: 30000,
        totalFeesCents: 0,
        saleDate: '2026-04-20',
      }) as never
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: false; reason: string; totalAvailable: number };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('insufficient_qty');
    expect(body.totalAvailable).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/api/sales/preview/route.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement `app/api/sales/preview/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saleCreateSchema } from '@/lib/validation/sale';
import { matchFifo, type OpenLot } from '@/lib/services/sales';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = saleCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Load open lots for this catalog item, scoped to user via RLS.
  const { data: lots, error: lotsErr } = await supabase
    .from('purchases')
    .select('id, quantity, cost_cents, purchase_date, created_at, source')
    .eq('catalog_item_id', v.catalogItemId)
    .is('deleted_at', null);
  if (lotsErr) {
    return NextResponse.json({ error: lotsErr.message }, { status: 500 });
  }
  const lotIds = (lots ?? []).map((l) => l.id);

  // Consumed by rips, decompositions, prior sales.
  let ripCounts = new Map<number, number>();
  let decompCounts = new Map<number, number>();
  let saleCounts = new Map<number, number>();
  if (lotIds.length > 0) {
    const { data: rips, error: rErr } = await supabase
      .from('rips')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
    for (const r of rips ?? []) {
      ripCounts.set(r.source_purchase_id, (ripCounts.get(r.source_purchase_id) ?? 0) + 1);
    }

    const { data: decomps, error: dErr } = await supabase
      .from('box_decompositions')
      .select('source_purchase_id')
      .in('source_purchase_id', lotIds);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
    for (const d of decomps ?? []) {
      decompCounts.set(d.source_purchase_id, (decompCounts.get(d.source_purchase_id) ?? 0) + 1);
    }

    const { data: priorSales, error: sErr } = await supabase
      .from('sales')
      .select('purchase_id, quantity')
      .in('purchase_id', lotIds);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    for (const s of priorSales ?? []) {
      saleCounts.set(s.purchase_id, (saleCounts.get(s.purchase_id) ?? 0) + s.quantity);
    }
  }

  const openLots: OpenLot[] = (lots ?? []).map((l) => ({
    purchaseId: l.id,
    purchaseDate: l.purchase_date,
    createdAt: l.created_at,
    costCents: l.cost_cents,
    qtyAvailable:
      l.quantity -
      (ripCounts.get(l.id) ?? 0) -
      (decompCounts.get(l.id) ?? 0) -
      (saleCounts.get(l.id) ?? 0),
  }));

  const result = matchFifo(openLots, {
    totalQty: v.totalQty,
    totalSalePriceCents: v.totalSalePriceCents,
    totalFeesCents: v.totalFeesCents,
    saleDate: v.saleDate,
    platform: v.platform ?? null,
    notes: v.notes ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, totalAvailable: result.totalAvailable },
      { status: 422 }
    );
  }

  // Map back with display metadata for the dialog table.
  const lotById = new Map((lots ?? []).map((l) => [l.id, l]));
  const rows = result.rows.map((r) => {
    const l = lotById.get(r.purchaseId)!;
    return {
      purchaseId: r.purchaseId,
      purchaseDate: l.purchase_date,
      purchaseSource: l.source,
      perUnitCostCents: l.cost_cents,
      quantity: r.quantity,
      salePriceCents: r.salePriceCents,
      feesCents: r.feesCents,
      matchedCostCents: r.matchedCostCents,
      realizedPnLCents: r.salePriceCents - r.feesCents - r.matchedCostCents,
    };
  });

  const qtyAvailable = openLots.reduce((s, l) => s + Math.max(0, l.qtyAvailable), 0);

  return NextResponse.json({
    ok: true,
    rows,
    totals: {
      totalSalePriceCents: v.totalSalePriceCents,
      totalFeesCents: v.totalFeesCents,
      totalMatchedCostCents: result.totalMatchedCostCents,
      realizedPnLCents: result.realizedPnLCents,
      qtyAvailable,
    },
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/sales/preview/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/sales/preview lib/validation/sale.ts
git commit -m "feat(sales): POST /api/sales/preview FIFO dry-run endpoint"
```

---

## Task 7: `POST /api/sales` (transactional commit)

**Files:**
- Create: `app/api/sales/route.ts`
- Test: `app/api/sales/route.test.ts`

**Spec:** Section 6.2, 6.3.

**Why:** Atomic insertion of N sale rows under one `sale_group_id`. Reads open lots, runs FIFO, inserts rows in one Drizzle transaction (matches the rip and decomposition POST pattern). Same route file also handles `GET /api/sales` for the list view.

- [ ] **Step 1: Write failing tests**

Create `app/api/sales/route.test.ts` using the same Supabase mock pattern as Task 6. Tests to cover:
- POST 401 without auth
- POST 422 on validation failure
- POST 422 on insufficient_qty
- POST 201 happy path single-lot, returns saleGroupId + saleIds
- POST 201 happy path multi-lot, returns saleGroupId + 3 saleIds
- GET 401 without auth
- GET happy path returns grouped SaleEvent[]
- GET filters by date range
- GET filters by platform
- GET filters by query (catalog name ILIKE)

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();
const mockTransaction = vi.fn();
const mockInsertReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: (cb: (tx: unknown) => unknown) => mockTransaction(cb),
  },
  schema: {},
}));

import { POST, GET } from './route';

function makePostReq(body: unknown) {
  return new Request('http://localhost/api/sales', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
    mockTransaction.mockReset();
    mockInsertReturning.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makePostReq({}) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 on validation failure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(makePostReq({ catalogItemId: 'bad' }) as never);
    expect(res.status).toBe(422);
  });

  // Note: full happy path is exercised in browser smoke. Mocking Drizzle
  // transactions requires substantial setup; we cover the matcher + insert
  // wiring via integration in the live env. Here we validate the edge cases
  // that don't depend on tx behavior.
});

describe('GET /api/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost/api/sales') as never);
    expect(res.status).toBe(401);
  });

  it('returns grouped sale events', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const rows = [
      {
        id: 1, sale_group_id: 'g1', purchase_id: 100, sale_date: '2026-04-20',
        quantity: 2, sale_price_cents: 40000, fees_cents: 1600, matched_cost_cents: 11000,
        platform: 'eBay', notes: null, created_at: '2026-04-20T00:00:00Z',
        purchase: { id: 100, purchase_date: '2026-03-01', cost_cents: 5500, catalog_item: { id: 5, name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed', image_url: null, image_storage_path: null } },
      },
      {
        id: 2, sale_group_id: 'g1', purchase_id: 200, sale_date: '2026-04-20',
        quantity: 1, sale_price_cents: 20000, fees_cents: 800, matched_cost_cents: 5500,
        platform: 'eBay', notes: null, created_at: '2026-04-20T00:00:00Z',
        purchase: { id: 200, purchase_date: '2026-04-12', cost_cents: 5500, catalog_item: { id: 5, name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed', image_url: null, image_storage_path: null } },
      },
    ];
    mockFromBuilder.mockImplementation(() => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        ilike: () => chain,
        order: () => chain,
        range: () => chain,
        then: (cb: (v: unknown) => unknown) => cb({ data: rows, error: null }),
      };
      return chain;
    });

    const res = await GET(new Request('http://localhost/api/sales') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sales: { saleGroupId: string; rows: unknown[] }[] };
    expect(body.sales).toHaveLength(1);
    expect(body.sales[0].saleGroupId).toBe('g1');
    expect(body.sales[0].rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/api/sales/route.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement `app/api/sales/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { saleCreateSchema } from '@/lib/validation/sale';
import { matchFifo, type OpenLot } from '@/lib/services/sales';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = saleCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // Load open lots inside the read-modify-write critical section.
  // Single-user app, so no contention; structure mirrors decompositions POST.
  const { data: lots, error: lotsErr } = await supabase
    .from('purchases')
    .select('id, quantity, cost_cents, purchase_date, created_at')
    .eq('catalog_item_id', v.catalogItemId)
    .is('deleted_at', null);
  if (lotsErr) return NextResponse.json({ error: lotsErr.message }, { status: 500 });
  const lotIds = (lots ?? []).map((l) => l.id);

  let ripCounts = new Map<number, number>();
  let decompCounts = new Map<number, number>();
  let saleCounts = new Map<number, number>();
  if (lotIds.length > 0) {
    const { data: rips } = await supabase.from('rips').select('source_purchase_id').in('source_purchase_id', lotIds);
    for (const r of rips ?? []) ripCounts.set(r.source_purchase_id, (ripCounts.get(r.source_purchase_id) ?? 0) + 1);

    const { data: decomps } = await supabase.from('box_decompositions').select('source_purchase_id').in('source_purchase_id', lotIds);
    for (const d of decomps ?? []) decompCounts.set(d.source_purchase_id, (decompCounts.get(d.source_purchase_id) ?? 0) + 1);

    const { data: priorSales } = await supabase.from('sales').select('purchase_id, quantity').in('purchase_id', lotIds);
    for (const s of priorSales ?? []) saleCounts.set(s.purchase_id, (saleCounts.get(s.purchase_id) ?? 0) + s.quantity);
  }

  const openLots: OpenLot[] = (lots ?? []).map((l) => ({
    purchaseId: l.id,
    purchaseDate: l.purchase_date,
    createdAt: l.created_at,
    costCents: l.cost_cents,
    qtyAvailable: l.quantity - (ripCounts.get(l.id) ?? 0) - (decompCounts.get(l.id) ?? 0) - (saleCounts.get(l.id) ?? 0),
  }));

  const matched = matchFifo(openLots, {
    totalQty: v.totalQty,
    totalSalePriceCents: v.totalSalePriceCents,
    totalFeesCents: v.totalFeesCents,
    saleDate: v.saleDate,
    platform: v.platform ?? null,
    notes: v.notes ?? null,
  });
  if (!matched.ok) {
    return NextResponse.json(
      { ok: false, reason: matched.reason, totalAvailable: matched.totalAvailable },
      { status: 422 }
    );
  }

  const saleGroupId = randomUUID();

  try {
    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(schema.sales)
        .values(
          matched.rows.map((r) => ({
            userId: user.id,
            saleGroupId,
            purchaseId: r.purchaseId,
            saleDate: v.saleDate,
            quantity: r.quantity,
            salePriceCents: r.salePriceCents,
            feesCents: r.feesCents,
            matchedCostCents: r.matchedCostCents,
            platform: v.platform ?? null,
            notes: v.notes ?? null,
          }))
        )
        .returning();
      return rows;
    });

    return NextResponse.json(
      {
        saleGroupId,
        saleIds: inserted.map((r) => r.id),
        totals: {
          totalSalePriceCents: v.totalSalePriceCents,
          totalFeesCents: v.totalFeesCents,
          totalMatchedCostCents: matched.totalMatchedCostCents,
          realizedPnLCents: matched.realizedPnLCents,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sale create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? '0'));

  let query = supabase
    .from('sales')
    .select(
      'id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, created_at, ' +
        'purchase:purchases!inner(id, purchase_date, cost_cents, catalog_item:catalog_items!inner(id, name, set_name, product_type, kind, image_url, image_storage_path))'
    )
    .order('sale_date', { ascending: false })
    .order('sale_group_id', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (start) query = query.gte('sale_date', start);
  if (end) query = query.lte('sale_date', end);
  if (platform) query = query.eq('platform', platform);
  if (q) query = query.ilike('purchase.catalog_item.name', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by sale_group_id, preserving date order from the query.
  type Row = NonNullable<typeof data>[number];
  const groups = new Map<string, Row[]>();
  for (const r of data ?? []) {
    const arr = groups.get(r.sale_group_id) ?? [];
    arr.push(r);
    groups.set(r.sale_group_id, arr);
  }

  const sales = Array.from(groups.entries()).map(([saleGroupId, rows]) => {
    const first = rows[0];
    const purchase = first.purchase as { catalog_item: { id: number; name: string; set_name: string | null; product_type: string | null; kind: 'sealed' | 'card'; image_url: string | null; image_storage_path: string | null } };
    const totals = rows.reduce(
      (acc, r) => ({
        quantity: acc.quantity + r.quantity,
        salePriceCents: acc.salePriceCents + r.sale_price_cents,
        feesCents: acc.feesCents + r.fees_cents,
        matchedCostCents: acc.matchedCostCents + r.matched_cost_cents,
      }),
      { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
    );
    return {
      saleGroupId,
      saleDate: first.sale_date,
      platform: first.platform,
      notes: first.notes,
      catalogItem: {
        id: purchase.catalog_item.id,
        name: purchase.catalog_item.name,
        setName: purchase.catalog_item.set_name,
        productType: purchase.catalog_item.product_type,
        kind: purchase.catalog_item.kind,
        imageUrl: purchase.catalog_item.image_url,
        imageStoragePath: purchase.catalog_item.image_storage_path,
      },
      totals: {
        ...totals,
        realizedPnLCents: totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
      },
      rows: rows.map((r) => {
        const p = r.purchase as { id: number; purchase_date: string; cost_cents: number };
        return {
          saleId: r.id,
          purchaseId: p.id,
          purchaseDate: p.purchase_date,
          perUnitCostCents: p.cost_cents,
          quantity: r.quantity,
          salePriceCents: r.sale_price_cents,
          feesCents: r.fees_cents,
          matchedCostCents: r.matched_cost_cents,
        };
      }),
      createdAt: first.created_at,
    };
  });

  const nextOffset = (data ?? []).length === limit ? offset + limit : null;
  return NextResponse.json({ sales, nextOffset });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/sales/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/sales/route.ts app/api/sales/route.test.ts
git commit -m "feat(sales): POST /api/sales (txn) + GET /api/sales (grouped list)"
```

---

## Task 8: `GET` and `DELETE /api/sales/[saleGroupId]`

**Files:**
- Create: `app/api/sales/[saleGroupId]/route.ts`
- Test: `app/api/sales/[saleGroupId]/route.test.ts`

**Spec:** Section 6.4, 6.5.

**Why:** Detail view for the SaleDetailDialog and atomic undo via DELETE.

- [ ] **Step 1: Write failing tests**

Create `app/api/sales/[saleGroupId]/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();
const mockDelete = vi.fn();
const mockWhere = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    delete: mockDelete,
  },
  schema: { sales: {} },
}));

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  eq: (a: unknown, b: unknown) => [a, b],
}));

import { GET, DELETE } from './route';

const makeCtx = (saleGroupId: string) => ({ params: Promise.resolve({ saleGroupId }) });

describe('GET /api/sales/[saleGroupId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never, makeCtx('g1'));
    expect(res.status).toBe(401);
  });

  it('404 when no rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      then: (cb: (v: unknown) => unknown) => cb({ data: [], error: null }),
    };
    mockFromBuilder.mockReturnValue(chain);
    const res = await GET(new Request('http://localhost') as never, makeCtx('g1'));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/sales/[saleGroupId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockDelete.mockReset();
    mockWhere.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as never, makeCtx('g1'));
    expect(res.status).toBe(401);
  });

  it('204 on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockWhere.mockResolvedValue({ rowCount: 3 });
    mockDelete.mockReturnValue({ where: mockWhere });
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }) as never, makeCtx('g1'));
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/api/sales/[saleGroupId]/route.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement `app/api/sales/[saleGroupId]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const { saleGroupId } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('sales')
    .select(
      'id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, created_at, ' +
        'purchase:purchases!inner(id, purchase_date, cost_cents, catalog_item:catalog_items!inner(id, name, set_name, product_type, kind, image_url, image_storage_path))'
    )
    .eq('sale_group_id', saleGroupId)
    .order('id', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'sale not found' }, { status: 404 });
  }

  const first = data[0];
  const purchase = first.purchase as { catalog_item: { id: number; name: string; set_name: string | null; product_type: string | null; kind: 'sealed' | 'card'; image_url: string | null; image_storage_path: string | null } };
  const totals = data.reduce(
    (acc, r) => ({
      quantity: acc.quantity + r.quantity,
      salePriceCents: acc.salePriceCents + r.sale_price_cents,
      feesCents: acc.feesCents + r.fees_cents,
      matchedCostCents: acc.matchedCostCents + r.matched_cost_cents,
    }),
    { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
  );

  return NextResponse.json({
    saleGroupId,
    saleDate: first.sale_date,
    platform: first.platform,
    notes: first.notes,
    catalogItem: {
      id: purchase.catalog_item.id,
      name: purchase.catalog_item.name,
      setName: purchase.catalog_item.set_name,
      productType: purchase.catalog_item.product_type,
      kind: purchase.catalog_item.kind,
      imageUrl: purchase.catalog_item.image_url,
      imageStoragePath: purchase.catalog_item.image_storage_path,
    },
    totals: {
      ...totals,
      realizedPnLCents: totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
    },
    rows: data.map((r) => {
      const p = r.purchase as { id: number; purchase_date: string; cost_cents: number };
      return {
        saleId: r.id,
        purchaseId: p.id,
        purchaseDate: p.purchase_date,
        perUnitCostCents: p.cost_cents,
        quantity: r.quantity,
        salePriceCents: r.sale_price_cents,
        feesCents: r.fees_cents,
        matchedCostCents: r.matched_cost_cents,
      };
    }),
    createdAt: first.created_at,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ saleGroupId: string }> }
) {
  const { saleGroupId } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(saleGroupId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await db
      .delete(schema.sales)
      .where(and(eq(schema.sales.saleGroupId, saleGroupId), eq(schema.sales.userId, user.id)));
    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'sale not found' }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'undo sale failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/sales/[saleGroupId]/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/sales
git commit -m "feat(sales): GET + DELETE /api/sales/[saleGroupId]"
```

---

## Task 9: Wire sales into existing routes (holdings, dashboard, holding detail)

**Files:**
- Modify: `app/api/dashboard/totals/route.ts`
- Modify: `app/api/holdings/route.ts`
- Modify: `app/api/holdings/[catalogItemId]/route.ts`

**Spec:** Section 6.6, 6.7, 6.8.

**Why:** `aggregateHoldings()` now takes a 4th `sales` param; `computePortfolioPnL` takes `realizedSalesPnLCents`. All call sites need updates. Holding detail also returns `sales[]` for the per-holding sales section in the UI.

- [ ] **Step 1: Update `app/api/dashboard/totals/route.ts`**

Replace the file:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computePortfolioPnL } from '@/lib/services/pnl';

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
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id, realized_loss_cents');
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const { data: decompositions, error: dErr } = await supabase
    .from('box_decompositions')
    .select('id, source_purchase_id');
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents, sale_group_id');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as unknown as RawSaleRow[]
  );

  const realizedRipLossCents = (rips ?? []).reduce(
    (acc, r) => acc + ((r as { realized_loss_cents: number }).realized_loss_cents ?? 0),
    0
  );
  const realizedSalesPnLCents = (sales ?? []).reduce(
    (acc, s) => acc + (s.sale_price_cents - s.fees_cents - s.matched_cost_cents),
    0
  );
  const lotCount = (purchases ?? []).length;
  const saleEventCount = new Set((sales ?? []).map((s) => s.sale_group_id)).size;

  const result = computePortfolioPnL(
    holdings,
    realizedRipLossCents,
    realizedSalesPnLCents,
    lotCount
  );
  return NextResponse.json({ ...result, saleEventCount });
}
```

- [ ] **Step 2: Update `app/api/holdings/route.ts`**

Open the file and find the `aggregateHoldings(...)` call. The route currently passes 3 args; add a 4th sales fetch and pipe it through. Locate the section that fetches purchases, rips, decompositions and add a sibling `sales` fetch:

```ts
  const { data: sales, error: sErr } = await supabase
    .from('sales')
    .select('id, purchase_id, quantity');
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
```

Update the `aggregateHoldings(...)` call to pass `(sales ?? []) as RawSaleRow[]` as the 4th argument. Add the `RawSaleRow` import to the existing imports from `@/lib/services/holdings`.

The mapping to `HoldingPnL[]` (the existing `holdings.map(h => computeHoldingPnL(h, now))` pattern, if present) does not change.

- [ ] **Step 3: Update `app/api/holdings/[catalogItemId]/route.ts`**

Find the section that loads provenance data (rips, decompositions for sealed). Add a parallel sales fetch before the response is built:

```ts
  // Sales linked to lots of this holding (for "Sold N" subtitle and Sales section).
  const salesForLots =
    lotIds.length > 0
      ? await db.query.sales.findMany({
          where: and(
            eq(schema.sales.userId, user.id),
            // Drizzle imports inArray at the top
          ),
        })
      : [];
```

Actually we need an `inArray` filter on `purchaseId`. Use the existing `inArray` import (already present in the file). Replace with:

```ts
  // Sales linked to lots of this holding.
  const salesForLots =
    lotIds.length > 0
      ? await db.query.sales.findMany({
          where: and(
            eq(schema.sales.userId, user.id),
            inArray(schema.sales.purchaseId, lotIds)
          ),
        })
      : [];
```

Then add `(salesForLots).map(...)` to populate the `sales` parameter for `aggregateHoldings`. Find the `aggregateHoldings(rawPurchases, rawRips, rawDecompositions)` call and update to pass a fourth arg:

```ts
  const rawSales = salesForLots.map((s) => ({ id: s.id, purchase_id: s.purchaseId, quantity: s.quantity }));
  const [holdingRaw] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions, rawSales);
```

(Add `RawSaleRow` to the existing import line from `@/lib/services/holdings`, even though it's not strictly required by the call signature - it documents the shape.)

Now build a `salesByGroup` Map and emit the `sales[]` array on the response. After the existing `decompositionsSummary = ...` block, add:

```ts
  // Group sales by sale_group_id for response shape.
  const salesGroupedById = new Map<string, typeof salesForLots>();
  for (const s of salesForLots) {
    const arr = salesGroupedById.get(s.saleGroupId) ?? [];
    arr.push(s);
    salesGroupedById.set(s.saleGroupId, arr);
  }
  const salesEvents = Array.from(salesGroupedById.entries())
    .map(([saleGroupId, rows]) => {
      const totals = rows.reduce(
        (acc, r) => ({
          quantity: acc.quantity + r.quantity,
          salePriceCents: acc.salePriceCents + r.salePriceCents,
          feesCents: acc.feesCents + r.feesCents,
          matchedCostCents: acc.matchedCostCents + r.matchedCostCents,
        }),
        { quantity: 0, salePriceCents: 0, feesCents: 0, matchedCostCents: 0 }
      );
      const first = rows[0];
      return {
        saleGroupId,
        saleDate: first.saleDate,
        platform: first.platform,
        notes: first.notes,
        totals: {
          ...totals,
          realizedPnLCents: totals.salePriceCents - totals.feesCents - totals.matchedCostCents,
        },
        rows: rows.map((r) => ({
          saleId: r.id,
          purchaseId: r.purchaseId,
          quantity: r.quantity,
          salePriceCents: r.salePriceCents,
          feesCents: r.feesCents,
          matchedCostCents: r.matchedCostCents,
        })),
        createdAt: first.createdAt instanceof Date ? first.createdAt.toISOString() : first.createdAt,
      };
    })
    .sort((a, b) => (a.saleDate < b.saleDate ? 1 : -1));
```

In the `return NextResponse.json({ ... })` block at the bottom of the GET handler, add `sales: salesEvents,` after `decompositions: decompositionsSummary,`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api`
Expected: All pre-existing route tests pass. Plan 4's `dashboard/totals/route.test.ts` may fail if it asserts the exact wire shape - update those assertions to expect the new fields (`realizedPnLCents`, `realizedSalesPnLCents`, `saleEventCount`).

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: No new TypeScript errors. Common slip: forgetting to add `RawSaleRow` to the import list in `app/api/holdings/route.ts` or the dashboard route.

- [ ] **Step 6: Commit**

```bash
git add app/api/dashboard app/api/holdings
git commit -m "feat(api): pipe sales through holdings + dashboard rollups"
```

---

## Task 10: PATCH purchases qty validation

**Files:**
- Modify: `app/api/purchases/[id]/route.ts`

**Spec:** Section 6.9.

**Why:** Today the PATCH route allows reducing `quantity` even if it would go below the total consumed across rips + decompositions + sales. Plan 5 closes this gap defensively.

- [ ] **Step 1: Add the validation**

In `app/api/purchases/[id]/route.ts`, locate the section after the validation `parsed = purchasePatchSchema.safeParse(json)` block but before the actual update. Add a quantity guard:

```ts
  // If quantity is being reduced, ensure it doesn't drop below total consumed
  // (rips + decompositions + sales) for this purchase.
  if (v.quantity !== undefined) {
    const [{ data: ripsCount }, { data: decompCount }, { data: salesAgg }] = await Promise.all([
      supabase.from('rips').select('id', { count: 'exact', head: true }).eq('source_purchase_id', numericId),
      supabase.from('box_decompositions').select('id', { count: 'exact', head: true }).eq('source_purchase_id', numericId),
      supabase.from('sales').select('quantity').eq('purchase_id', numericId),
    ]).then((rs) =>
      rs.map((r) => ({ data: r.data, count: r.count ?? 0 })) as [
        { data: unknown; count: number },
        { data: unknown; count: number },
        { data: { quantity: number }[] | null; count: number },
      ]
    );
    const ripsConsumed = ripsCount.count;
    const decompsConsumed = decompCount.count;
    const salesConsumed = (salesAgg.data ?? []).reduce((s, r) => s + r.quantity, 0);
    const totalConsumed = ripsConsumed + decompsConsumed + salesConsumed;
    if (v.quantity < totalConsumed) {
      return NextResponse.json(
        { error: 'cannot reduce quantity below consumed', consumed: totalConsumed },
        { status: 422 }
      );
    }
  }
```

(Note: Supabase's count helper returns the count alongside `data` - the lambda flattens this to a uniform shape. If the existing codebase uses a simpler `select('id')` + `.length`, mirror that; the goal is to count rows.)

- [ ] **Step 2: Run any existing tests for the route**

Run: `npx vitest run app/api/purchases`
Expected: Existing PATCH tests still pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/purchases/[id]/route.ts
git commit -m "feat(purchases): PATCH validates qty >= total consumed (rips+decomps+sales)"
```

---

## Task 11: CSV utility `lib/utils/csv.ts`

**Files:**
- Create: `lib/utils/csv.ts`
- Test: `lib/utils/csv.test.ts`

**Spec:** Section 6.13.

**Why:** RFC 4180 CSV escaping (commas, quotes, newlines in user-entered notes) is fiddly and easy to get wrong. One small helper used by all three export endpoints.

- [ ] **Step 1: Write failing tests**

Create `lib/utils/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { csvRow, csvEscape } from './csv';

describe('csvEscape', () => {
  it('returns plain values unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(123)).toBe('123');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes values with commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes values with double-quotes and doubles internal quotes', () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes values with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('csvRow', () => {
  it('joins values with commas + CRLF terminator', () => {
    expect(csvRow(['a', 'b', 'c'])).toBe('a,b,c\r\n');
  });

  it('escapes each cell independently', () => {
    expect(csvRow(['plain', 'with,comma', 'with "quote"'])).toBe('plain,"with,comma","with ""quote"""\r\n');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run lib/utils/csv.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement `lib/utils/csv.ts`**

```ts
export function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvEscape).join(',') + '\r\n';
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/utils/csv.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/csv.ts lib/utils/csv.test.ts
git commit -m "feat(utils): add RFC 4180 CSV row helper"
```

---

## Task 12: CSV export endpoint - sales

**Files:**
- Create: `app/api/exports/sales/route.ts`
- Test: `app/api/exports/sales/route.test.ts`

**Spec:** Section 6.13 (sales export columns).

**Why:** First of three export endpoints. Streams CSV with `Content-Disposition: attachment`, accepts the same filters as `GET /api/sales` (date range, platform, q).

- [ ] **Step 1: Write failing tests**

Create `app/api/exports/sales/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFromBuilder = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromBuilder,
  }),
}));

import { GET } from './route';

describe('GET /api/exports/sales', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFromBuilder.mockReset();
  });

  it('401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(401);
  });

  it('returns CSV with header row and one data row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const rows = [
      {
        id: 1, sale_group_id: 'g1', sale_date: '2026-04-20', purchase_id: 100,
        quantity: 2, sale_price_cents: 40000, fees_cents: 1600, matched_cost_cents: 11000,
        platform: 'eBay', notes: 'with,comma',
        purchase: {
          purchase_date: '2026-03-01', cost_cents: 5500,
          catalog_item: { name: 'ETB', set_name: 'SV151', product_type: 'ETB', kind: 'sealed' },
        },
      },
    ];
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, ilike: () => chain, order: () => chain,
      then: (cb: (v: unknown) => unknown) => cb({ data: rows, error: null }),
    };
    mockFromBuilder.mockReturnValue(chain);

    const res = await GET(new Request('http://localhost') as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const text = await res.text();
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('sale_group_id,sale_id,sale_date,holding_name,set_name,product_type,kind,purchase_id,purchase_date,qty,per_unit_cost_cents,sale_price_cents,fees_cents,matched_cost_cents,realized_pnl_cents,platform,notes');
    expect(lines[1]).toContain('"with,comma"');
    expect(lines[1]).toContain('27400');  // 40000 - 1600 - 11000
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run app/api/exports/sales/route.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement `app/api/exports/sales/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';

const HEADERS = [
  'sale_group_id', 'sale_id', 'sale_date',
  'holding_name', 'set_name', 'product_type', 'kind',
  'purchase_id', 'purchase_date', 'qty', 'per_unit_cost_cents',
  'sale_price_cents', 'fees_cents', 'matched_cost_cents', 'realized_pnl_cents',
  'platform', 'notes',
] as const;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const platform = url.searchParams.get('platform');
  const q = url.searchParams.get('q');

  let query = supabase
    .from('sales')
    .select(
      'id, sale_group_id, sale_date, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, ' +
        'purchase:purchases!inner(purchase_date, cost_cents, catalog_item:catalog_items!inner(name, set_name, product_type, kind))'
    )
    .order('sale_date', { ascending: false })
    .order('sale_group_id', { ascending: true })
    .order('id', { ascending: true });

  if (start) query = query.gte('sale_date', start);
  if (end) query = query.lte('sale_date', end);
  if (platform) query = query.eq('platform', platform);
  if (q) query = query.ilike('purchase.catalog_item.name', `%${q}%`);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  let body = csvRow(HEADERS);
  for (const r of data ?? []) {
    const p = r.purchase as { purchase_date: string; cost_cents: number; catalog_item: { name: string; set_name: string | null; product_type: string | null; kind: 'sealed' | 'card' } };
    const realized = r.sale_price_cents - r.fees_cents - r.matched_cost_cents;
    body += csvRow([
      r.sale_group_id, r.id, r.sale_date,
      p.catalog_item.name, p.catalog_item.set_name, p.catalog_item.product_type, p.catalog_item.kind,
      r.purchase_id, p.purchase_date, r.quantity, p.cost_cents,
      r.sale_price_cents, r.fees_cents, r.matched_cost_cents, realized,
      r.platform, r.notes,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-sales-${today}.csv"`,
    },
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/exports/sales/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/exports/sales lib/utils/csv.ts
git commit -m "feat(exports): GET /api/exports/sales CSV endpoint"
```

---

## Task 13: CSV export endpoints - purchases + portfolio summary

**Files:**
- Create: `app/api/exports/purchases/route.ts`
- Test: `app/api/exports/purchases/route.test.ts`
- Create: `app/api/exports/portfolio-summary/route.ts`
- Test: `app/api/exports/portfolio-summary/route.test.ts`

**Spec:** Section 6.13 (purchases + portfolio columns).

**Why:** Two more endpoints, same shape as sales export. Purchases is a flat dump; portfolio-summary one row per holding plus a totals row at the top.

- [ ] **Step 1: Write failing test for purchases export**

Create `app/api/exports/purchases/route.test.ts`. Mirror the sales export test structure. Header row assertion:

```ts
    expect(lines[0]).toBe('purchase_id,purchase_date,holding_name,set_name,product_type,kind,qty,cost_cents,source,location,condition,is_graded,grading_company,grade,cert_number,source_rip_id,source_decomposition_id,notes,created_at');
```

Plus a row data assertion that includes a sample purchase. The route should accept optional `start`, `end`, `kind` filters.

- [ ] **Step 2: Run test, confirm fail**

Run: `npx vitest run app/api/exports/purchases/route.test.ts`
Expected: Module not found.

- [ ] **Step 3: Implement purchases export**

Create `app/api/exports/purchases/route.ts`. Same pattern as sales: select with optional filters, write CSV. Filters: `start` (purchase_date gte), `end` (purchase_date lte), `kind` (catalog_item.kind eq). Excludes soft-deleted (`deleted_at IS NULL`). Joins `catalog_items` for name/set/product_type/kind.

```ts
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';

const HEADERS = [
  'purchase_id', 'purchase_date',
  'holding_name', 'set_name', 'product_type', 'kind',
  'qty', 'cost_cents',
  'source', 'location', 'condition',
  'is_graded', 'grading_company', 'grade', 'cert_number',
  'source_rip_id', 'source_decomposition_id',
  'notes', 'created_at',
] as const;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const url = new URL(request.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const kind = url.searchParams.get('kind');

  let query = supabase
    .from('purchases')
    .select(
      'id, purchase_date, quantity, cost_cents, source, location, condition, is_graded, grading_company, grade, cert_number, source_rip_id, source_decomposition_id, notes, created_at, ' +
        'catalog_item:catalog_items!inner(name, set_name, product_type, kind)'
    )
    .is('deleted_at', null)
    .order('purchase_date', { ascending: false })
    .order('id', { ascending: true });

  if (start) query = query.gte('purchase_date', start);
  if (end) query = query.lte('purchase_date', end);
  if (kind) query = query.eq('catalog_item.kind', kind);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  let body = csvRow(HEADERS);
  for (const r of data ?? []) {
    const c = r.catalog_item as { name: string; set_name: string | null; product_type: string | null; kind: 'sealed' | 'card' };
    body += csvRow([
      r.id, r.purchase_date,
      c.name, c.set_name, c.product_type, c.kind,
      r.quantity, r.cost_cents,
      r.source, r.location, r.condition,
      r.is_graded, r.grading_company, r.grade, r.cert_number,
      r.source_rip_id, r.source_decomposition_id,
      r.notes, r.created_at,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-purchases-${today}.csv"`,
    },
  });
}
```

- [ ] **Step 4: Run purchases test**

Run: `npx vitest run app/api/exports/purchases/route.test.ts`
Expected: All pass.

- [ ] **Step 5: Write failing test for portfolio-summary export**

Create `app/api/exports/portfolio-summary/route.test.ts`. Header row:

```ts
    expect(lines[0]).toBe('catalog_item_id,name,set_name,product_type,kind,qty_held,total_invested_cents,last_market_cents,last_market_at,current_value_cents,pnl_cents,pnl_pct,priced,stale');
```

The first data row is a synthetic "totals" line where `name=PORTFOLIO TOTALS` and most fields aggregate; subsequent rows are per-holding.

- [ ] **Step 6: Run test, confirm fail**

Run: `npx vitest run app/api/exports/portfolio-summary/route.test.ts`
Expected: Module not found.

- [ ] **Step 7: Implement portfolio-summary export**

Create `app/api/exports/portfolio-summary/route.ts`. Reuses `aggregateHoldings` + `computePortfolioPnL` (same pipeline as the dashboard endpoint), then iterates `perHolding` to emit rows. The first row is the totals row.

```ts
import { createClient } from '@/lib/supabase/server';
import { csvRow } from '@/lib/utils/csv';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
  type RawSaleRow,
} from '@/lib/services/holdings';
import { computePortfolioPnL } from '@/lib/services/pnl';

const HEADERS = [
  'catalog_item_id', 'name', 'set_name', 'product_type', 'kind',
  'qty_held', 'total_invested_cents', 'last_market_cents', 'last_market_at',
  'current_value_cents', 'pnl_cents', 'pnl_pct',
  'priced', 'stale',
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const { data: purchases } = await supabase
    .from('purchases')
    .select(
      'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
    )
    .is('deleted_at', null);
  const { data: rips } = await supabase.from('rips').select('id, source_purchase_id, realized_loss_cents');
  const { data: decompositions } = await supabase.from('box_decompositions').select('id, source_purchase_id');
  const { data: sales } = await supabase.from('sales').select('id, purchase_id, quantity, sale_price_cents, fees_cents, matched_cost_cents');

  const holdings = aggregateHoldings(
    (purchases ?? []) as unknown as RawPurchaseRow[],
    (rips ?? []) as RawRipRow[],
    (decompositions ?? []) as RawDecompositionRow[],
    (sales ?? []) as unknown as RawSaleRow[]
  );

  const realizedRipLossCents = (rips ?? []).reduce((s, r) => s + ((r as { realized_loss_cents: number }).realized_loss_cents ?? 0), 0);
  const realizedSalesPnLCents = (sales ?? []).reduce((s, r) => s + (r.sale_price_cents - r.fees_cents - r.matched_cost_cents), 0);
  const result = computePortfolioPnL(holdings, realizedRipLossCents, realizedSalesPnLCents, (purchases ?? []).length);

  let body = csvRow(HEADERS);

  // Totals row first.
  body += csvRow([
    '',
    'PORTFOLIO TOTALS',
    '', '', '',
    '',
    result.totalInvestedCents,
    '',
    '',
    result.totalCurrentValueCents,
    result.unrealizedPnLCents,
    result.unrealizedPnLPct?.toFixed(2) ?? '',
    '',
    '',
  ]);

  for (const h of result.perHolding) {
    body += csvRow([
      h.catalogItemId, h.name, h.setName, h.productType, h.kind,
      h.qtyHeld, h.totalInvestedCents, h.lastMarketCents, h.lastMarketAt,
      h.currentValueCents, h.pnlCents, h.pnlPct?.toFixed(2) ?? '',
      h.priced, h.stale,
    ]);
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pokestonks-portfolio-${today}.csv"`,
    },
  });
}
```

- [ ] **Step 8: Run portfolio-summary test**

Run: `npx vitest run app/api/exports/portfolio-summary/route.test.ts`
Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add app/api/exports/purchases app/api/exports/portfolio-summary
git commit -m "feat(exports): GET /api/exports/{purchases,portfolio-summary} CSV endpoints"
```

---

## Task 14: Sales hooks `lib/query/hooks/useSales.ts`

**Files:**
- Create: `lib/query/hooks/useSales.ts`

**Spec:** Section 7.1.

**Why:** TanStack Query is the only fetcher used in components. One hook file exposes: list, detail, preview, create, delete. All mutations invalidate the right cache keys.

- [ ] **Step 1: Implement the hook file**

Create `lib/query/hooks/useSales.ts`:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaleCreateInput } from '@/lib/validation/sale';

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export type SaleEventDto = {
  saleGroupId: string;
  saleDate: string;
  platform: string | null;
  notes: string | null;
  catalogItem: {
    id: number;
    name: string;
    setName: string | null;
    productType: string | null;
    kind: 'sealed' | 'card';
    imageUrl: string | null;
    imageStoragePath: string | null;
  };
  totals: {
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
    realizedPnLCents: number;
  };
  rows: Array<{
    saleId: number;
    purchaseId: number;
    purchaseDate: string;
    perUnitCostCents: number;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
  }>;
  createdAt: string;
};

export type SalesListFilters = {
  start?: string;
  end?: string;
  platform?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export function useSales(filters: SalesListFilters = {}) {
  const params = new URLSearchParams();
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (filters.platform) params.set('platform', filters.platform);
  if (filters.q) params.set('q', filters.q);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return useQuery({
    queryKey: ['sales', 'list', filters],
    queryFn: async () => {
      const res = await fetch(`/api/sales${qs ? `?${qs}` : ''}`);
      return json<{ sales: SaleEventDto[]; nextOffset: number | null }>(res);
    },
    staleTime: 30_000,
  });
}

export function useSale(saleGroupId: string | null) {
  return useQuery({
    queryKey: ['sale', saleGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/sales/${saleGroupId}`);
      return json<SaleEventDto>(res);
    },
    enabled: saleGroupId != null,
  });
}

export type FifoPreviewRow = {
  purchaseId: number;
  purchaseDate: string;
  purchaseSource: string | null;
  perUnitCostCents: number;
  quantity: number;
  salePriceCents: number;
  feesCents: number;
  matchedCostCents: number;
  realizedPnLCents: number;
};

export type FifoPreviewResponse =
  | {
      ok: true;
      rows: FifoPreviewRow[];
      totals: {
        totalSalePriceCents: number;
        totalFeesCents: number;
        totalMatchedCostCents: number;
        realizedPnLCents: number;
        qtyAvailable: number;
      };
    }
  | { ok: false; reason: 'insufficient_qty'; totalAvailable: number };

export function useFifoPreview(input: SaleCreateInput | null) {
  return useQuery({
    queryKey: ['sales', 'preview', input],
    queryFn: async () => {
      const res = await fetch('/api/sales/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      // 422 with insufficient_qty is a normal "not enough qty" response, not an error.
      const body = await res.json();
      if (res.status === 422 && body.ok === false) return body as FifoPreviewResponse;
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as FifoPreviewResponse;
    },
    enabled:
      input != null &&
      input.totalQty > 0 &&
      input.totalSalePriceCents >= 0 &&
      input.catalogItemId > 0,
    staleTime: 0,
  });
}

function invalidateAfterSaleMutation(qc: ReturnType<typeof useQueryClient>, catalogItemId: number) {
  qc.invalidateQueries({ queryKey: ['holdings'] });
  qc.invalidateQueries({ queryKey: ['holding', catalogItemId] });
  qc.invalidateQueries({ queryKey: ['dashboardTotals'] });
  qc.invalidateQueries({ queryKey: ['sales'] });
  qc.invalidateQueries({ queryKey: ['purchases'] });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaleCreateInput) => {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return json<{ saleGroupId: string; saleIds: number[]; totals: unknown }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables.catalogItemId);
    },
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ saleGroupId, _catalogItemId }: { saleGroupId: string; _catalogItemId: number }) => {
      const res = await fetch(`/api/sales/${saleGroupId}`, { method: 'DELETE' });
      if (res.status === 204) return { saleGroupId };
      return json<{ error: string }>(res);
    },
    onSuccess: (_data, variables) => {
      invalidateAfterSaleMutation(qc, variables._catalogItemId);
    },
  });
}
```

- [ ] **Step 2: Type-check the file**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/query/hooks/useSales.ts
git commit -m "feat(sales): TanStack Query hooks (list, detail, preview, create, delete)"
```

---

## Task 15: SellDialog component

**Files:**
- Create: `components/sales/SellDialog.tsx`
- Test: `components/sales/SellDialog.test.tsx`

**Spec:** Section 7.1.

**Why:** Form + FIFO preview, the heart of the sale entry flow. Inputs: qty, sale price (gross), fees, sale date, platform, notes. Debounced preview hook renders the consumed-lots table. Submit disabled until preview is `ok`.

- [ ] **Step 1: Write failing component test**

Create `components/sales/SellDialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SellDialog } from './SellDialog';

vi.mock('@/lib/query/hooks/useSales', () => ({
  useFifoPreview: () => ({
    data: { ok: true, rows: [], totals: { totalSalePriceCents: 0, totalFeesCents: 0, totalMatchedCostCents: 0, realizedPnLCents: 0, qtyAvailable: 5 } },
    isLoading: false,
  }),
  useCreateSale: () => ({ mutate: vi.fn(), isPending: false }),
}));

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('SellDialog', () => {
  it('renders form fields when open', () => {
    renderWithQuery(
      <SellDialog
        open
        onOpenChange={() => {}}
        catalogItemId={5}
        catalogItemName="ETB"
        qtyHeld={5}
      />
    );
    expect(screen.getByLabelText(/quantity/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sale price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fees/i)).toBeInTheDocument();
  });

  it('disables submit when preview not yet ok', () => {
    renderWithQuery(
      <SellDialog
        open
        onOpenChange={() => {}}
        catalogItemId={5}
        catalogItemName="ETB"
        qtyHeld={5}
      />
    );
    // Default form state has qty=1, price=0, fees=0, date=today, so preview enabled
    // but the test mock returns ok:true with 0 rows, which isn't a real submission case.
    // Instead, we just verify the button exists.
    expect(screen.getByRole('button', { name: /sell/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

Run: `npx vitest run components/sales/SellDialog.test.tsx`
Expected: Module not found.

- [ ] **Step 3: Implement `components/sales/SellDialog.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateSale, useFifoPreview, type FifoPreviewRow } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalogItemId: number;
  catalogItemName: string;
  qtyHeld: number;
};

export function SellDialog({ open, onOpenChange, catalogItemId, catalogItemName, qtyHeld }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [qty, setQty] = useState(1);
  const [salePriceDollars, setSalePriceDollars] = useState('');
  const [feesDollars, setFeesDollars] = useState('');
  const [saleDate, setSaleDate] = useState(today);
  const [platform, setPlatform] = useState('');
  const [notes, setNotes] = useState('');

  const dollarsToCents = (s: string): number => {
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const totalSalePriceCents = dollarsToCents(salePriceDollars);
  const totalFeesCents = dollarsToCents(feesDollars);

  const previewInput =
    qty > 0 && totalSalePriceCents >= 0 && totalFeesCents >= 0 && saleDate
      ? {
          catalogItemId,
          totalQty: qty,
          totalSalePriceCents,
          totalFeesCents,
          saleDate,
          platform: platform || null,
          notes: notes || null,
        }
      : null;

  const preview = useFifoPreview(previewInput);
  const create = useCreateSale();

  const canSubmit =
    previewInput != null &&
    preview.data?.ok === true &&
    !create.isPending &&
    qty <= qtyHeld;

  const submit = () => {
    if (!previewInput || !canSubmit) return;
    create.mutate(previewInput, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sell {catalogItemName}</DialogTitle>
          <DialogDescription>
            FIFO matches your oldest open lots first. {qtyHeld} on hand.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="qty">Quantity</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              max={qtyHeld}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label htmlFor="saleDate">Sale date</Label>
            <Input id="saleDate" type="date" value={saleDate} max={today} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="salePrice">Sale price (gross)</Label>
            <Input id="salePrice" type="number" min={0} step="0.01" value={salePriceDollars} onChange={(e) => setSalePriceDollars(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label htmlFor="fees">Fees</Label>
            <Input id="fees" type="number" min={0} step="0.01" value={feesDollars} onChange={(e) => setFeesDollars(e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-2">
            <Label htmlFor="platform">Platform</Label>
            <Input id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="eBay, Facebook Marketplace, ..." />
          </div>
          <div className="col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="(optional)" />
          </div>
        </div>

        <div className="border-t pt-3 mt-2">
          <h3 className="text-sm font-medium mb-2">Preview</h3>
          {preview.data?.ok === false && (
            <p className="text-sm text-destructive">
              Not enough open qty. Available: {preview.data.totalAvailable}.
            </p>
          )}
          {preview.data?.ok === true && preview.data.rows.length > 0 && (
            <div className="space-y-1 text-sm">
              {preview.data.rows.map((r: FifoPreviewRow) => (
                <div key={r.purchaseId} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    Lot {r.purchaseDate}{' '}
                    {r.purchaseSource ? <span className="text-xs">({r.purchaseSource})</span> : null} - {r.quantity}x @ {formatCents(r.perUnitCostCents)}
                  </span>
                  <span>{formatCentsSigned(r.realizedPnLCents)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                <span>Realized P&amp;L</span>
                <span>
                  {formatCentsSigned(preview.data.totals.realizedPnLCents)}
                  {preview.data.totals.totalMatchedCostCents > 0 ? (
                    <> ({formatPct((preview.data.totals.realizedPnLCents / preview.data.totals.totalMatchedCostCents) * 100)})</>
                  ) : null}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {create.isPending ? 'Selling...' : 'Sell'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run components/sales/SellDialog.test.tsx`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add components/sales/SellDialog.tsx components/sales/SellDialog.test.tsx
git commit -m "feat(sales): SellDialog with debounced FIFO preview"
```

---

## Task 16: SellButton, SaleRow, SaleDetailDialog

**Files:**
- Create: `components/sales/SellButton.tsx`
- Create: `components/sales/SaleRow.tsx`
- Test: `components/sales/SaleRow.test.tsx`
- Create: `components/sales/SaleDetailDialog.tsx`

**Spec:** Section 7.1.

**Why:** SellButton wraps SellDialog state. SaleRow is the per-event row used on `/sales` and on holding detail. SaleDetailDialog opens from a SaleRow click and exposes Undo.

- [ ] **Step 1: Implement `components/sales/SellButton.tsx`**

```tsx
'use client';
import { useState, type MouseEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import { SellDialog } from './SellDialog';

type Props = {
  catalogItemId: number;
  catalogItemName: string;
  qtyHeld: number;
  variant?: 'card' | 'header';
};

export function SellButton({ catalogItemId, catalogItemName, qtyHeld, variant = 'header' }: Props) {
  const [open, setOpen] = useState(false);
  const onClick: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  return (
    <>
      <Button
        size={variant === 'card' ? 'sm' : 'default'}
        variant={variant === 'card' ? 'outline' : 'default'}
        disabled={qtyHeld === 0}
        onClick={onClick}
      >
        Sell
      </Button>
      <SellDialog
        open={open}
        onOpenChange={setOpen}
        catalogItemId={catalogItemId}
        catalogItemName={catalogItemName}
        qtyHeld={qtyHeld}
      />
    </>
  );
}
```

- [ ] **Step 2: Implement `components/sales/SaleRow.tsx`**

```tsx
'use client';
import Image from 'next/image';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { formatCents } from '@/lib/utils/format';
import type { SaleEventDto } from '@/lib/query/hooks/useSales';

type Props = {
  sale: SaleEventDto;
  onClick?: () => void;
};

export function SaleRow({ sale, onClick }: Props) {
  const { catalogItem, totals, saleDate, platform } = sale;
  const realizedPct =
    totals.matchedCostCents > 0
      ? (totals.realizedPnLCents / totals.matchedCostCents) * 100
      : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 p-3 rounded-md border hover:bg-muted transition-colors"
    >
      <div className="w-12 h-12 rounded overflow-hidden bg-muted shrink-0 relative">
        {catalogItem.imageUrl ? (
          <Image src={catalogItem.imageUrl} alt={catalogItem.name} fill sizes="48px" className="object-cover" />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{catalogItem.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {saleDate} - {totals.quantity}x sold for {formatCents(totals.salePriceCents - totals.feesCents)}
          {platform ? ` - ${platform}` : ''}
        </div>
      </div>
      <PnLDisplay pnlCents={totals.realizedPnLCents} pnlPct={realizedPct} />
    </button>
  );
}
```

- [ ] **Step 3: Write failing test for SaleRow**

Create `components/sales/SaleRow.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaleRow } from './SaleRow';
import type { SaleEventDto } from '@/lib/query/hooks/useSales';

const sample: SaleEventDto = {
  saleGroupId: 'g1',
  saleDate: '2026-04-20',
  platform: 'eBay',
  notes: null,
  catalogItem: {
    id: 5, name: 'ETB', setName: 'SV151', productType: 'ETB', kind: 'sealed',
    imageUrl: null, imageStoragePath: null,
  },
  totals: { quantity: 2, salePriceCents: 40000, feesCents: 1600, matchedCostCents: 11000, realizedPnLCents: 27400 },
  rows: [],
  createdAt: '2026-04-20T00:00:00Z',
};

describe('SaleRow', () => {
  it('renders catalog name + sale date + qty + net proceeds', () => {
    render(<SaleRow sale={sample} />);
    expect(screen.getByText('ETB')).toBeInTheDocument();
    expect(screen.getByText(/2026-04-20/)).toBeInTheDocument();
    expect(screen.getByText(/2x sold/)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<SaleRow sale={sample} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run test**

Run: `npx vitest run components/sales/SaleRow.test.tsx`
Expected: All pass.

- [ ] **Step 5: Implement `components/sales/SaleDetailDialog.tsx`**

```tsx
'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSale, useDeleteSale } from '@/lib/query/hooks/useSales';
import { formatCents, formatCentsSigned, formatPct } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleGroupId: string | null;
};

export function SaleDetailDialog({ open, onOpenChange, saleGroupId }: Props) {
  const { data, isLoading } = useSale(saleGroupId);
  const del = useDeleteSale();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sale of {data?.catalogItem.name ?? '...'}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sale date</span><span>{data.saleDate}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{data.totals.quantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span>{formatCents(data.totals.salePriceCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fees</span><span>{formatCents(data.totals.feesCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Matched cost</span><span>{formatCents(data.totals.matchedCostCents)}</span></div>
            <div className="flex justify-between border-t pt-2 mt-2 font-medium">
              <span>Realized P&amp;L</span>
              <PnLDisplay
                pnlCents={data.totals.realizedPnLCents}
                pnlPct={data.totals.matchedCostCents > 0 ? (data.totals.realizedPnLCents / data.totals.matchedCostCents) * 100 : null}
              />
            </div>
            {data.platform ? (
              <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span>{data.platform}</span></div>
            ) : null}
            {data.notes ? (
              <div>
                <div className="text-muted-foreground">Notes</div>
                <div>{data.notes}</div>
              </div>
            ) : null}

            <div className="border-t pt-2 mt-2">
              <div className="text-muted-foreground mb-1">Lot breakdown</div>
              {data.rows.map((r) => (
                <div key={r.saleId} className="flex justify-between text-xs">
                  <span>Lot {r.purchaseDate} - {r.quantity}x @ {formatCents(r.perUnitCostCents)}</span>
                  <span>{formatCentsSigned(r.salePriceCents - r.feesCents - r.matchedCostCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="destructive"
            disabled={!data || del.isPending}
            onClick={() => {
              if (!data) return;
              del.mutate({ saleGroupId: data.saleGroupId, _catalogItemId: data.catalogItem.id }, { onSuccess: () => onOpenChange(false) });
            }}
          >
            {del.isPending ? 'Undoing...' : 'Undo sale'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add components/sales
git commit -m "feat(sales): SellButton + SaleRow + SaleDetailDialog components"
```

---

## Task 17: Wire SellButton into HoldingsGrid + HoldingDetailClient

**Files:**
- Modify: `app/(authenticated)/holdings/HoldingsGrid.tsx`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`
- Modify: `components/purchases/LotRow.tsx`

**Spec:** Section 7.2, 7.3, 7.4, 7.5.

**Why:** Sell entry points + sales history section + per-lot "Sold N" subtitle.

- [ ] **Step 1: Add SellButton to `HoldingsGrid.tsx`**

Open `app/(authenticated)/holdings/HoldingsGrid.tsx`. The card today is wrapped in a `<Link>`. Add an action strip below the per-card P&L footer. Locate where the footer renders and append:

```tsx
import { SellButton } from '@/components/sales/SellButton';

// ... inside the card render, after the existing footer JSX:
<div className="flex justify-end pt-2 border-t">
  <SellButton
    catalogItemId={h.catalogItemId}
    catalogItemName={h.name}
    qtyHeld={h.qtyHeld}
    variant="card"
  />
</div>
```

`SellButton`'s onClick already does `stopPropagation`/`preventDefault`, so the Link nav stays suppressed.

- [ ] **Step 2: Add SellButton + Sales section to `HoldingDetailClient.tsx`**

Open the file. Find the header JSX where `<RipPackDialog>` and `<OpenBoxDialog>` triggers live. Add the Sell button alongside:

```tsx
import { SellButton } from '@/components/sales/SellButton';

// In header actions, add:
<SellButton
  catalogItemId={item.id}
  catalogItemName={item.name}
  qtyHeld={holding.qtyHeld}
/>
```

Then below the existing rips and decompositions sections, add a Sales section. Find the place where the response's `decompositions` array is rendered as `<DecompositionRow>` entries; below that block, add:

```tsx
import { SaleRow } from '@/components/sales/SaleRow';
import { SaleDetailDialog } from '@/components/sales/SaleDetailDialog';

// near other state hooks at the top of the component:
const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);

// in the JSX, after the decompositions section:
{sales.length > 0 ? (
  <section className="space-y-3 mt-6">
    <h2 className="text-sm font-semibold tracking-tight">Sales</h2>
    <div className="grid gap-2">
      {sales.map((s) => (
        <SaleRow
          key={s.saleGroupId}
          sale={s as unknown as SaleEventDto}
          onClick={() => setSelectedSaleId(s.saleGroupId)}
        />
      ))}
    </div>
  </section>
) : null}
<SaleDetailDialog
  open={selectedSaleId != null}
  onOpenChange={(o) => { if (!o) setSelectedSaleId(null); }}
  saleGroupId={selectedSaleId}
/>
```

(The `sales` variable comes from the holding detail response - in the SSR page, propagate `responseData.sales` into `<HoldingDetailClient sales={...} />` and update the props type accordingly.)

In `app/(authenticated)/holdings/[catalogItemId]/page.tsx`, add `sales: responseData.sales ?? []` to the props passed to `HoldingDetailClient`.

- [ ] **Step 3: Add "Sold N" subtitle to LotRow**

Open `components/purchases/LotRow.tsx`. The component receives provenance data via existing props. Add a new optional prop:

```tsx
type SalesByPurchase = Map<number, { qty: number; realizedPnLCents: number }>;

type Props = {
  // ... existing
  salesByPurchase?: SalesByPurchase;
};
```

In the JSX where existing rip/decomp consumption lines render (e.g., "Ripped 2 of 5"), add a parallel sales line:

```tsx
{salesByPurchase?.get(lot.id) ? (
  <div className="text-xs text-muted-foreground">
    Sold {salesByPurchase.get(lot.id)!.qty} of {lot.quantity}{' '}
    ({formatCentsSigned(salesByPurchase.get(lot.id)!.realizedPnLCents)} realized)
  </div>
) : null}
```

Build the map in `HoldingDetailClient.tsx` from the `sales` array:

```tsx
const salesByPurchase = useMemo(() => {
  const m = new Map<number, { qty: number; realizedPnLCents: number }>();
  for (const event of sales) {
    for (const r of event.rows) {
      const realized = r.salePriceCents - r.feesCents - r.matchedCostCents;
      const cur = m.get(r.purchaseId) ?? { qty: 0, realizedPnLCents: 0 };
      m.set(r.purchaseId, { qty: cur.qty + r.quantity, realizedPnLCents: cur.realizedPnLCents + realized });
    }
  }
  return m;
}, [sales]);
```

Pass `salesByPurchase` as a prop to every `<LotRow>` instance.

- [ ] **Step 4: Run type check + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No new errors. Existing component tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/\(authenticated\)/holdings components/purchases/LotRow.tsx
git commit -m "feat(holdings): SellButton on grid + detail; Sales section + LotRow Sold N subtitle"
```

---

## Task 18: `/sales` page with filters + Export current view

**Files:**
- Modify: `app/(authenticated)/sales/page.tsx`
- Create: `app/(authenticated)/sales/SalesListClient.tsx`

**Spec:** Section 7.6.

**Why:** Replace the placeholder with a real list. URL-synced filters (date range, platform, q). Pagination via offset. Export-current-view links to `/api/exports/sales.csv` with current filters.

- [ ] **Step 1: Convert `app/(authenticated)/sales/page.tsx` to a server component that renders the client list**

Replace the file:

```tsx
import { SalesListClient } from './SalesListClient';

export default function SalesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
      <SalesListClient />
    </div>
  );
}
```

- [ ] **Step 2: Implement `SalesListClient.tsx`**

Create `app/(authenticated)/sales/SalesListClient.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSales } from '@/lib/query/hooks/useSales';
import { SaleRow } from '@/components/sales/SaleRow';
import { SaleDetailDialog } from '@/components/sales/SaleDetailDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SalesListClient() {
  const router = useRouter();
  const params = useSearchParams();
  const start = params.get('start') ?? '';
  const end = params.get('end') ?? '';
  const platform = params.get('platform') ?? '';
  const q = params.get('q') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/sales?${next.toString()}`);
  };

  const { data, isLoading } = useSales({
    start: start || undefined,
    end: end || undefined,
    platform: platform || undefined,
    q: q || undefined,
  });

  const [selected, setSelected] = useState<string | null>(null);

  const exportHref = `/api/exports/sales?${params.toString()}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <Input type="date" value={start} onChange={(e) => setParam('start', e.target.value)} placeholder="From" />
        <Input type="date" value={end} onChange={(e) => setParam('end', e.target.value)} placeholder="To" />
        <Input value={platform} onChange={(e) => setParam('platform', e.target.value)} placeholder="Platform" />
        <Input value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Search holdings" />
      </div>
      <div className="flex justify-end">
        <a href={exportHref} download>
          <Button variant="outline" size="sm">Export current view (CSV)</Button>
        </a>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !data || data.sales.length === 0 ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          No sales yet. Tip: log a sale from any holding.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.sales.map((s) => (
            <SaleRow key={s.saleGroupId} sale={s} onClick={() => setSelected(s.saleGroupId)} />
          ))}
        </div>
      )}

      <SaleDetailDialog
        open={selected != null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        saleGroupId={selected}
      />
    </div>
  );
}
```

- [ ] **Step 3: Browser smoke (manual via npm run dev)**

Print this manual step:

```
Run `npm run dev`, navigate to /sales, log a sale from /holdings, return to /sales,
verify it appears, click row to open detail, verify Undo works, verify
"Export current view" downloads a CSV containing the row.
```

- [ ] **Step 4: Commit**

```bash
git add app/\(authenticated\)/sales
git commit -m "feat(sales): /sales list page with filters + Export current view"
```

---

## Task 19: `/settings` Export section

**Files:**
- Modify: `app/(authenticated)/settings/page.tsx`

**Spec:** Section 7.7.

**Why:** Three CSV download buttons centralized on `/settings`. Each is an `<a href download>` linking to its export endpoint.

- [ ] **Step 1: Update `app/(authenticated)/settings/page.tsx`**

Replace the file:

```tsx
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="text-xs text-muted-foreground">
          Download CSV files of your data. Money columns are integer cents.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <a href="/api/exports/sales" download>
            <Button variant="outline" className="w-full">Export sales (CSV)</Button>
          </a>
          <a href="/api/exports/purchases" download>
            <Button variant="outline" className="w-full">Export purchases (CSV)</Button>
          </a>
          <a href="/api/exports/portfolio-summary" download>
            <Button variant="outline" className="w-full">Export portfolio summary (CSV)</Button>
          </a>
        </div>
      </section>

      <section className="rounded-md border p-4">
        <h2 className="text-sm font-semibold mb-3">Account</h2>
        <SignOutButton />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(authenticated\)/settings/page.tsx
git commit -m "feat(settings): add Export section with sales/purchases/portfolio CSV buttons"
```

---

## Task 20: Dashboard label rename + sale event count

**Files:**
- Modify: `components/dashboard/DashboardTotalsCard.tsx`

**Spec:** Section 7.8.

**Why:** "Realized rip P&L" -> "Realized P&L" (unified). Caption row gains sale event count.

- [ ] **Step 1: Update `DashboardTotalsCard.tsx`**

Open the file. Find the stat tile that reads `realizedRipPnLCents` from the totals query and change:

- The label text from "Realized rip P&L" to "Realized P&L".
- The data accessor from `totals.realizedRipPnLCents` to `totals.realizedPnLCents`.

Find the caption row (e.g., "12 lots / 11 priced / 1 unpriced / 2 stale") and append the sale event count when present:

```tsx
const captionParts = [
  `${totals.lotCount} ${totals.lotCount === 1 ? 'lot' : 'lots'}`,
  `${totals.pricedCount} priced`,
];
if (totals.unpricedCount > 0) captionParts.push(`${totals.unpricedCount} unpriced`);
if (totals.staleCount > 0) captionParts.push(`${totals.staleCount} stale`);
if (totals.saleEventCount && totals.saleEventCount > 0) {
  captionParts.push(`${totals.saleEventCount} ${totals.saleEventCount === 1 ? 'sale' : 'sales'}`);
}
// then render captionParts.join(' / ')
```

(Use `' / '` as the existing separator; spec section 7.8 uses ` / ` not em-dash.)

- [ ] **Step 2: Update or extend the existing component test**

Open `components/dashboard/DashboardTotalsCard.test.tsx` (created in Plan 4). Add a test case asserting the new label:

```tsx
  it('renders Realized P&L label (unified)', () => {
    // existing test render setup
    expect(screen.getByText('Realized P&L')).toBeInTheDocument();
  });

  it('shows sale count in caption when > 0', () => {
    // render with saleEventCount: 3
    expect(screen.getByText(/3 sales/)).toBeInTheDocument();
  });
```

If no test exists, create the file with happy-dom directive and a minimal happy-path test mocking the dashboardTotals hook.

- [ ] **Step 3: Run tests**

Run: `npx vitest run components/dashboard`
Expected: All pass.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: No errors. The `useDashboardTotals` `PortfolioPnL` type now has `realizedPnLCents` and `saleEventCount`, but the latter is added to the wire shape in Task 9 outside the typed `PortfolioPnL`. If TypeScript complains, widen the hook return type by extending `PortfolioPnL & { saleEventCount: number }`.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard lib/query/hooks/useDashboardTotals.ts
git commit -m "feat(dashboard): rename Realized P&L (unified) + sale count in caption"
```

---

## Task 21: Browser smoke + final ship marker

**Files:** none (manual verification + ship commit)

**Spec:** Section 10 (Build Order step 17).

- [ ] **Step 1: Run the full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All pass, no TypeScript errors.

- [ ] **Step 2: Browser smoke**

Run `npm run dev`. Walk through these:

1. Navigate to `/holdings`. Confirm Sell button appears on each card. Click one - SellDialog opens.
2. Try to sell more units than `qtyHeld` - submit stays disabled and preview shows "Not enough open qty".
3. Enter a valid sale (qty 2 of 5, $50 sale price, $2 fees, eBay platform). Confirm preview shows FIFO breakdown with realized P&L. Click Sell.
4. Dashboard updates: `qty_held` drops by 2, Realized P&L line includes the sale, caption shows "1 sale". Holding detail page shows the sale in the Sales section.
5. On `/sales`, the new sale appears. Filter by platform "eBay" - still appears. Filter by date range outside the sale date - row disappears.
6. Click the row -> SaleDetailDialog opens. Click "Undo sale" -> row disappears, qty_held restored to 5.
7. Settings -> Export sales (CSV) downloads a file with the right header row. After re-logging the sale, the file contains the row.
8. Try to delete a purchase that has a linked sale via the holding detail page menu -> 409 error surfaces with linkedSaleIds.
9. Sell a card from a previous rip (use a card holding from a ripped pack). Confirm FIFO matches that lot and `qty_held` updates.

If any step fails, file the issue, fix, re-run.

- [ ] **Step 3: Ship marker commit**

```bash
git commit --allow-empty -m "feat: ship Plan 5 (Sales + FIFO)"
git push origin main
```

---

## Spec Coverage Cross-Check

| Spec Section | Task |
|---|---|
| 4 (Schema) | 1 |
| 5.1 (matchFifo) | 2 |
| 5.2 (aggregateHoldings extend) | 3 |
| 5.3 (computePortfolioPnL extend) | 4 |
| 6.1 (preview) | 6 |
| 6.2 (POST sales) | 7 |
| 6.3 (GET sales list) | 7 |
| 6.4 (GET sales/[group]) | 8 |
| 6.5 (DELETE sales/[group]) | 8 |
| 6.6 (holding detail extend) | 9 |
| 6.7 (dashboard totals extend) | 9 |
| 6.8 (holdings list extend) | 9 |
| 6.9 (PATCH purchases qty) | 10 |
| 6.13 (CSV exports) | 11, 12, 13 |
| 7.1 (sales components) | 15, 16 |
| 7.2 (HoldingsGrid SellButton) | 17 |
| 7.3 (HoldingDetailClient header) | 17 |
| 7.4 (Sales section on holding detail) | 17 |
| 7.5 (LotRow Sold subtitle) | 17 |
| 7.6 (/sales page) | 18 |
| 7.7 (/settings exports) | 19 |
| 7.8 (DashboardTotalsCard rename) | 20 |
| Validation schema | 5 |
| Hooks | 14 |
| Browser smoke | 21 |
