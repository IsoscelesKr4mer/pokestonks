# Pokestonks Plan 4 — P&L + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface unrealized P&L (current value vs cost basis) on dashboard, holdings grid, and holding detail. Pure derivation from `catalog_items.last_market_cents` already populated by Plan 2 capstone. Add Best/Worst performers card. Show "Stale" pill for prices older than 7 days; "Unpriced" badge for null `last_market_cents`.

**Architecture:** New pure service `lib/services/pnl.ts` (`computeHoldingPnL`, `computePortfolioPnL`) over the existing `Holding[]` shape. `aggregateHoldings()` extends with one new `lastMarketAt` field. API routes return render-ready `HoldingPnL` / `PortfolioPnL` shapes. New shared display components: `<PnLDisplay>`, `<StalePill>`, `<UnpricedBadge>`. `formatCents` / `formatCentsSigned` / `formatPct` extracted to `lib/utils/format.ts` and used in place of 7 inline copies. **No DB migrations.** **No new endpoints.**

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM (service-role + manual auth), Supabase Postgres + Auth, TanStack Query 5, shadcn/ui 4.x base-ui, Vitest 4 with per-file `// @vitest-environment happy-dom` directive for component tests.

**Spec reference:** `docs/superpowers/specs/2026-04-28-pokestonks-pnl-dashboard-design.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
lib/
├── services/
│   ├── holdings.ts                    # MODIFIED: add lastMarketAt to RawCatalogItem + Holding types
│   ├── holdings.test.ts               # MODIFIED: extend fixtures with last_market_at
│   ├── pnl.ts                         # CREATED
│   └── pnl.test.ts                    # CREATED
├── utils/
│   ├── format.ts                      # CREATED (extracted formatCents/Signed/Pct)
│   └── format.test.ts                 # CREATED
└── query/hooks/
    ├── useDashboardTotals.ts          # MODIFIED: type changes to PortfolioPnL
    └── useHoldings.ts                 # MODIFIED: type changes to HoldingPnL[] + HoldingDetailDto.holding -> HoldingPnL + item.lastMarketAt

app/
├── api/
│   ├── dashboard/
│   │   └── totals/
│   │       ├── route.ts               # MODIFIED: rewrite using aggregateHoldings + computePortfolioPnL
│   │       └── route.test.ts          # CREATED
│   └── holdings/
│       ├── route.ts                   # MODIFIED: return HoldingPnL[]
│       └── [catalogItemId]/
│           └── route.ts               # MODIFIED: holding -> HoldingPnL; item gains lastMarketAt
└── (authenticated)/
    ├── page.tsx                       # MODIFIED: render <DashboardPerformersCard>
    └── holdings/
        ├── page.tsx                   # MODIFIED: select last_market_at; widen DTO
        ├── HoldingsGrid.tsx           # MODIFIED: per-card P&L footer + Unpriced/Stale
        └── [catalogItemId]/
            ├── page.tsx               # MODIFIED: select last_market_at; widen DTO
            └── HoldingDetailClient.tsx# MODIFIED: P&L header + per-lot P&L via consumed map

components/
├── dashboard/
│   ├── DashboardTotalsCard.tsx        # MODIFIED: 4-stat layout, signed P&L, captions
│   ├── DashboardTotalsCard.test.tsx   # CREATED (happy-dom)
│   ├── DashboardPerformersCard.tsx    # CREATED
│   ├── DashboardPerformersCard.test.tsx # CREATED (happy-dom)
│   └── DashboardPerformersWrapper.tsx # CREATED (client wrapper sharing the dashboardTotals query)
├── holdings/
│   ├── PnLDisplay.tsx                 # CREATED
│   ├── PnLDisplay.test.tsx            # CREATED (happy-dom)
│   ├── StalePill.tsx                  # CREATED
│   └── UnpricedBadge.tsx              # CREATED
└── purchases/
    └── LotRow.tsx                     # MODIFIED: currentUnitMarketCents prop + per-lot P&L lines
```

**Boundaries enforced:**

- `lib/services/pnl.ts` — pure functions, no DB, no fetch, no React. Tests are isolated.
- `lib/utils/format.ts` — pure formatting helpers. No domain logic. Used everywhere.
- API routes — auth → service-role read → call pure services → return DTO. No math in the route.
- `useDashboardTotals` / `useHoldings` — TanStack hooks. No raw `fetch` in components.
- `<PnLDisplay>` / `<StalePill>` / `<UnpricedBadge>` — presentational. No mutations, no queries.

---

## Task 1: Plumb `last_market_at` through `holdings.ts` types

**Files:**
- Modify: `lib/services/holdings.ts`
- Modify: `lib/services/holdings.test.ts`

**Spec:** Section 4.

**Why:** P&L staleness needs `last_market_at` on every holding. The existing `aggregateHoldings()` already carries `lastMarketCents` from `catalog_item` through to the output `Holding` — Plan 4 mirrors that for `lastMarketAt`. No business logic change.

- [ ] **Step 1: Extend `holdings.test.ts` fixture and add a test that the field passes through**

Open `lib/services/holdings.test.ts`. The existing `sealed` and `card` fixtures need an additional `last_market_at` key. Update both:

```ts
const sealed = { kind: 'sealed' as const, name: 'ETB', set_name: 'SV151', product_type: 'ETB', last_market_cents: 6000, last_market_at: '2026-04-26T00:00:00Z', image_url: null, image_storage_path: null };
const card = { kind: 'card' as const, name: 'Pikachu ex', set_name: 'AH', product_type: null, last_market_cents: 117087, last_market_at: '2026-04-27T00:00:00Z', image_url: null, image_storage_path: null };
```

Add a new test below the existing ones, before the closing `});`:

```ts
  it('passes lastMarketAt through to the holding', () => {
    const result = aggregateHoldings([makePurchase({ id: 1 })], [], []);
    expect(result[0].lastMarketAt).toBe('2026-04-26T00:00:00Z');
  });

  it('passes null lastMarketAt through when source is null', () => {
    const noPriceCatalog = { ...sealed, last_market_cents: null, last_market_at: null };
    const purchases = [makePurchase({ id: 1, catalog_item: noPriceCatalog })];
    const result = aggregateHoldings(purchases, [], []);
    expect(result[0].lastMarketCents).toBeNull();
    expect(result[0].lastMarketAt).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run lib/services/holdings.test.ts`
Expected: 2 new failures with `expect(result[0].lastMarketAt).toBe(...)` finding `undefined`.

- [ ] **Step 3: Add `last_market_at` to `RawCatalogItem` and `lastMarketAt` to `Holding`; thread through `aggregateHoldings`**

Open `lib/services/holdings.ts`. Modify the file:

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
  decompositions: readonly RawDecompositionRow[]
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/holdings.test.ts`
Expected: All tests pass (originals still pass + 2 new pass).

- [ ] **Step 5: Run full test suite to catch any consumer breakage**

Run: `npx vitest run`
Expected: TypeScript errors in route handlers + SSR pages that build `RawCatalogItem` literals — those are fixed in the next tasks. We will fix them in Tasks 2-3 before committing this. **Do not commit yet.**

---

## Task 2: Plumb `last_market_at` through holdings list route + SSR page

**Files:**
- Modify: `app/api/holdings/route.ts`
- Modify: `app/(authenticated)/holdings/page.tsx`

**Spec:** Section 4.

- [ ] **Step 1: Add `last_market_at` to the catalog_item select in `app/api/holdings/route.ts`**

Find this Supabase select string:

```ts
.select(
  'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents)'
)
```

Replace with:

```ts
.select(
  'id, catalog_item_id, quantity, cost_cents, deleted_at, created_at, catalog_item:catalog_items(kind, name, set_name, product_type, image_url, image_storage_path, last_market_cents, last_market_at)'
)
```

- [ ] **Step 2: Same change in `app/(authenticated)/holdings/page.tsx`**

Find and replace the same select string. (The two files have identical query shapes today.)

- [ ] **Step 3: Type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors in those two files now. The detail route still has issues (Task 3 fixes).

---

## Task 3: Plumb `last_market_at` through holding detail route + SSR page

**Files:**
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/page.tsx`
- Modify: `lib/query/hooks/useHoldings.ts`

**Spec:** Sections 4, 6.3.

- [ ] **Step 1: Add `lastMarketAt` to the item DTO in `app/api/holdings/[catalogItemId]/route.ts`**

Find the `item: { ... }` in the final `NextResponse.json({ ... })` (around the bottom of the file). Add `lastMarketAt: item.lastMarketAt,` next to `lastMarketCents`. The `item` object should look like:

```ts
item: {
  id: item.id,
  kind: item.kind,
  name: item.name,
  setName: item.setName,
  setCode: item.setCode,
  productType: item.productType,
  cardNumber: item.cardNumber,
  rarity: item.rarity,
  variant: item.variant,
  imageUrl: item.imageUrl,
  imageStoragePath: item.imageStoragePath,
  lastMarketCents: item.lastMarketCents,
  lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
  msrpCents: item.msrpCents,
  packCount: item.packCount,
},
```

- [ ] **Step 2: Same change in `app/(authenticated)/holdings/[catalogItemId]/page.tsx`**

Find the `item:` literal inside the `initial: HoldingDetailDto = { ... }` block. Add `lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,` to that literal.

- [ ] **Step 3: Add `last_market_at` to the `rawPurchases` mapping in BOTH files**

Both the route and the SSR page build a `rawPurchases: RawPurchaseRow[]` from `lots`. Each `catalog_item` literal in those mappings needs `last_market_at`. Update the mapping in both files:

```ts
catalog_item: {
  kind: item.kind as 'sealed' | 'card',
  name: item.name,
  set_name: item.setName,
  product_type: item.productType,
  image_url: item.imageUrl,
  image_storage_path: item.imageStoragePath,
  last_market_cents: item.lastMarketCents,
  last_market_at: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
},
```

- [ ] **Step 4: Update `HoldingDetailDto.item` in `lib/query/hooks/useHoldings.ts` to include `lastMarketAt`**

Find the `item:` block inside `HoldingDetailDto`. Add `lastMarketAt: string | null;` next to `lastMarketCents: number | null;`:

```ts
  item: {
    id: number;
    kind: 'sealed' | 'card';
    name: string;
    setName: string | null;
    setCode: string | null;
    productType: string | null;
    cardNumber: string | null;
    rarity: string | null;
    variant: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    lastMarketAt: string | null;
    msrpCents: number | null;
    packCount: number | null;
  };
```

- [ ] **Step 5: Type-check passes across the codebase**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: All tests still pass**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 7: Commit Tasks 1-3 together**

```bash
git add lib/services/holdings.ts lib/services/holdings.test.ts \
        app/api/holdings/route.ts app/(authenticated)/holdings/page.tsx \
        app/api/holdings/[catalogItemId]/route.ts \
        app/(authenticated)/holdings/[catalogItemId]/page.tsx \
        lib/query/hooks/useHoldings.ts
git commit -m "feat(holdings): plumb last_market_at through aggregation + DTOs"
```

---

## Task 4: Extract `formatCents` / `formatCentsSigned` / `formatPct` to `lib/utils/format.ts`

**Files:**
- Create: `lib/utils/format.ts`
- Create: `lib/utils/format.test.ts`

**Spec:** Section 7.6.

- [ ] **Step 1: Write the failing tests**

Create `lib/utils/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCents, formatCentsSigned, formatPct } from './format';

describe('formatCents', () => {
  it('formats positive cents as $X.XX', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
  });
  it('formats zero as $0.00', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
  it('formats negative cents as -$X.XX (sign before dollar sign)', () => {
    expect(formatCents(-123456)).toBe('-$1,234.56');
  });
  it('rounds half cents (sub-cent input)', () => {
    expect(formatCents(100)).toBe('$1.00');
  });
});

describe('formatCentsSigned', () => {
  it('positive gets a leading +', () => {
    expect(formatCentsSigned(12345)).toBe('+$123.45');
  });
  it('zero is unsigned', () => {
    expect(formatCentsSigned(0)).toBe('$0.00');
  });
  it('negative gets a leading -', () => {
    expect(formatCentsSigned(-12345)).toBe('-$123.45');
  });
});

describe('formatPct', () => {
  it('positive gets a leading + and one decimal by default', () => {
    expect(formatPct(12.345)).toBe('+12.3%');
  });
  it('zero is unsigned 0.0%', () => {
    expect(formatPct(0)).toBe('0.0%');
  });
  it('negative gets a leading - sign', () => {
    expect(formatPct(-7.5)).toBe('-7.5%');
  });
  it('respects custom decimals', () => {
    expect(formatPct(12.345, 2)).toBe('+12.35%');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/utils/format.test.ts`
Expected: Module not found error.

- [ ] **Step 3: Implement the helpers**

Create `lib/utils/format.ts`:

```ts
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCentsSigned(cents: number): string {
  if (cents === 0) return '$0.00';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '+';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(pct: number, decimals: number = 1): string {
  if (pct === 0) return `0.${'0'.repeat(decimals)}%`;
  const sign = pct < 0 ? '-' : '+';
  return `${sign}${Math.abs(pct).toFixed(decimals)}%`;
}
```

- [ ] **Step 4: Run tests pass**

Run: `npx vitest run lib/utils/format.test.ts`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/format.ts lib/utils/format.test.ts
git commit -m "feat(utils): add formatCents/Signed and formatPct helpers"
```

---

## Task 5: Replace inline `formatCents` copies with the shared util

**Files:**
- Modify: `components/dashboard/DashboardTotalsCard.tsx`
- Modify: `components/purchases/LotRow.tsx`
- Modify: `components/decompositions/DecompositionRow.tsx`
- Modify: `components/decompositions/OpenBoxDialog.tsx`
- Modify: `components/decompositions/OpenBoxDetailDialog.tsx`
- Modify: `components/rips/RipDetailDialog.tsx`
- Modify: `components/catalog/PriceLabel.tsx`
- Modify: `app/(authenticated)/holdings/HoldingsGrid.tsx`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

**Spec:** Section 7.6.

**Why:** Plan 4 touches all these files for P&L. Removing the duplicates first avoids a confusing "old + new" mix during the bigger renders later.

- [ ] **Step 1: Replace each inline `formatCents` with an import**

For every file in the list above, do the same surgery:

1. Remove the local `function formatCents(cents: number): string { ... }` block.
2. Add an import line at the top of the file: `import { formatCents } from '@/lib/utils/format';`

Some files use a slightly different inline implementation that produces `$-1234.56` (sign after `$`) — replacing them with the shared `formatCents` (which produces `-$1,234.56`) is an intentional improvement. Don't preserve the old behavior.

Example diff for `components/purchases/LotRow.tsx` (top of file):

Before:
```ts
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useDeletePurchase, DeletePurchaseError } from '@/lib/query/hooks/usePurchases';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

After:
```ts
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useDeletePurchase, DeletePurchaseError } from '@/lib/query/hooks/usePurchases';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';
import { formatCents } from '@/lib/utils/format';
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Tests still pass**

Run: `npx vitest run`
Expected: All passing.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/DashboardTotalsCard.tsx \
        components/purchases/LotRow.tsx \
        components/decompositions/DecompositionRow.tsx \
        components/decompositions/OpenBoxDialog.tsx \
        components/decompositions/OpenBoxDetailDialog.tsx \
        components/rips/RipDetailDialog.tsx \
        components/catalog/PriceLabel.tsx \
        app/(authenticated)/holdings/HoldingsGrid.tsx \
        app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx
git commit -m "refactor: replace inline formatCents copies with shared util"
```

---

## Task 6: Build `lib/services/pnl.ts` with TDD

**Files:**
- Create: `lib/services/pnl.ts`
- Create: `lib/services/pnl.test.ts`

**Spec:** Section 5.

- [ ] **Step 1: Write the failing tests**

Create `lib/services/pnl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePortfolioPnL, computeHoldingPnL, STALE_PRICE_THRESHOLD_DAYS } from './pnl';
import type { Holding } from './holdings';

const NOW = new Date('2026-04-28T12:00:00Z');
const RECENT = '2026-04-27T00:00:00Z';   // 1 day ago, fresh
const STALE_AT = '2026-04-15T00:00:00Z'; // 13 days ago, stale (> 7d)

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    catalogItemId: 1,
    kind: 'sealed',
    name: 'ETB',
    setName: 'SV151',
    productType: 'Elite Trainer Box',
    imageUrl: null,
    imageStoragePath: null,
    lastMarketCents: 6000,
    lastMarketAt: RECENT,
    qtyHeld: 1,
    totalInvestedCents: 5000,
    ...overrides,
  };
}

describe('computeHoldingPnL', () => {
  it('priced + fresh produces positive P&L', () => {
    const r = computeHoldingPnL(makeHolding(), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(false);
    expect(r.currentValueCents).toBe(6000);
    expect(r.pnlCents).toBe(1000);
    expect(r.pnlPct).toBeCloseTo(20.0);
  });

  it('priced + stale (lastMarketAt > 7d old) flagged stale, still counts', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: STALE_AT }), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(true);
    expect(r.pnlCents).toBe(1000);
  });

  it('priced + null lastMarketAt is treated as stale (defensive)', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: null }), NOW);
    expect(r.priced).toBe(true);
    expect(r.stale).toBe(true);
  });

  it('unpriced (lastMarketCents null) yields nulls', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketCents: null, lastMarketAt: null }), NOW);
    expect(r.priced).toBe(false);
    expect(r.stale).toBe(false);
    expect(r.currentValueCents).toBeNull();
    expect(r.pnlCents).toBeNull();
    expect(r.pnlPct).toBeNull();
  });

  it('cost basis zero yields null pct, P&L equal to current value', () => {
    const r = computeHoldingPnL(makeHolding({ totalInvestedCents: 0, lastMarketCents: 500, qtyHeld: 1 }), NOW);
    expect(r.pnlPct).toBeNull();
    expect(r.pnlCents).toBe(500);
    expect(r.currentValueCents).toBe(500);
  });

  it('negative P&L (current < cost) computed correctly', () => {
    const r = computeHoldingPnL(makeHolding({ lastMarketCents: 4000, totalInvestedCents: 5000 }), NOW);
    expect(r.pnlCents).toBe(-1000);
    expect(r.pnlPct).toBeCloseTo(-20.0);
  });

  it('exactly 7 days old is NOT stale (boundary)', () => {
    const exactly7d = new Date(NOW.getTime() - 7 * 86_400_000).toISOString();
    const r = computeHoldingPnL(makeHolding({ lastMarketAt: exactly7d }), NOW);
    expect(r.stale).toBe(false);
  });
});

describe('computePortfolioPnL', () => {
  it('empty holdings → zero totals, empty arrays, null pct', () => {
    const r = computePortfolioPnL([], 0, 0, NOW);
    expect(r.totalInvestedCents).toBe(0);
    expect(r.pricedInvestedCents).toBe(0);
    expect(r.totalCurrentValueCents).toBe(0);
    expect(r.unrealizedPnLCents).toBe(0);
    expect(r.unrealizedPnLPct).toBeNull();
    expect(r.realizedRipPnLCents).toBe(0);
    expect(r.pricedCount).toBe(0);
    expect(r.unpricedCount).toBe(0);
    expect(r.staleCount).toBe(0);
    expect(r.lotCount).toBe(0);
    expect(r.perHolding).toEqual([]);
    expect(r.bestPerformers).toEqual([]);
    expect(r.worstPerformers).toEqual([]);
  });

  it('all unpriced → cost basis but zero current value, null pct', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: null, lastMarketAt: null }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null, totalInvestedCents: 3000 }),
    ];
    const r = computePortfolioPnL(h, 0, 2, NOW);
    expect(r.totalInvestedCents).toBe(8000);
    expect(r.pricedInvestedCents).toBe(0);
    expect(r.totalCurrentValueCents).toBe(0);
    expect(r.unrealizedPnLCents).toBe(0);
    expect(r.unrealizedPnLPct).toBeNull();
    expect(r.unpricedCount).toBe(2);
    expect(r.pricedCount).toBe(0);
    expect(r.bestPerformers).toEqual([]);
    expect(r.worstPerformers).toEqual([]);
  });

  it('mixed priced + unpriced: cost basis includes both, current value excludes unpriced', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null, totalInvestedCents: 3000 }),
    ];
    const r = computePortfolioPnL(h, 0, 2, NOW);
    expect(r.totalInvestedCents).toBe(8000);
    expect(r.pricedInvestedCents).toBe(5000);
    expect(r.totalCurrentValueCents).toBe(6000);
    expect(r.unrealizedPnLCents).toBe(1000);
    expect(r.unrealizedPnLPct).toBeCloseTo(20.0);
    expect(r.pricedCount).toBe(1);
    expect(r.unpricedCount).toBe(1);
  });

  it('stale priced holding still contributes to current value + pnl, but increments staleCount', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketAt: STALE_AT }),
    ];
    const r = computePortfolioPnL(h, 0, 1, NOW);
    expect(r.staleCount).toBe(1);
    expect(r.pricedCount).toBe(1);
    expect(r.unrealizedPnLCents).toBe(1000);
  });

  it('best/worst with mixed gainers + losers, sorted correctly, slice 3 each', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }), // +1000
      makeHolding({ catalogItemId: 2, lastMarketCents: 3000, totalInvestedCents: 5000 }), // -2000
      makeHolding({ catalogItemId: 3, lastMarketCents: 7000, totalInvestedCents: 5000 }), // +2000
      makeHolding({ catalogItemId: 4, lastMarketCents: 4000, totalInvestedCents: 5000 }), // -1000
      makeHolding({ catalogItemId: 5, lastMarketCents: 8000, totalInvestedCents: 5000 }), // +3000
      makeHolding({ catalogItemId: 6, lastMarketCents: 2000, totalInvestedCents: 5000 }), // -3000
      makeHolding({ catalogItemId: 7, lastMarketCents: 5000, totalInvestedCents: 5000 }), // 0
    ];
    const r = computePortfolioPnL(h, 0, 7, NOW);
    expect(r.bestPerformers.map((b) => b.catalogItemId)).toEqual([5, 3, 1]);
    expect(r.worstPerformers.map((w) => w.catalogItemId)).toEqual([6, 2, 4]);
  });

  it('fewer than 3 priced holdings: best/worst length matches priced count', () => {
    const h = [
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000 }),
      makeHolding({ catalogItemId: 2, lastMarketCents: null, lastMarketAt: null }),
    ];
    const r = computePortfolioPnL(h, 0, 2, NOW);
    expect(r.bestPerformers).toHaveLength(1);
    expect(r.worstPerformers).toHaveLength(1);
    expect(r.bestPerformers[0].catalogItemId).toBe(1);
    expect(r.worstPerformers[0].catalogItemId).toBe(1);
  });

  it('realized rip P&L sign flip: positive loss → negative P&L, negative loss → positive P&L', () => {
    expect(computePortfolioPnL([], 500, 0, NOW).realizedRipPnLCents).toBe(-500);
    expect(computePortfolioPnL([], -200, 0, NOW).realizedRipPnLCents).toBe(200);
    expect(computePortfolioPnL([], 0, 0, NOW).realizedRipPnLCents).toBe(0);
  });

  it('tie-breaking: equal pnlCents sorted by qtyHeld desc then catalogItemId asc', () => {
    // Two holdings with identical +1000 P&L; B has larger qty, A has smaller catalogItemId
    const h = [
      makeHolding({ catalogItemId: 5, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 1 }), // pnl=1000, qty=1
      makeHolding({ catalogItemId: 9, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 1 }), // pnl=1000, qty=1
      makeHolding({ catalogItemId: 1, lastMarketCents: 6000, totalInvestedCents: 5000, qtyHeld: 3 }), // pnl=3000, qty=3 (different pnl so doesn't tie)
    ];
    const r = computePortfolioPnL(h, 0, 3, NOW);
    // Top: id=1 (pnl 3000), then ties on 1000: qtyHeld desc tied, catalogItemId asc → 5, 9
    expect(r.bestPerformers.map((b) => b.catalogItemId)).toEqual([1, 5, 9]);
  });

  it('STALE_PRICE_THRESHOLD_DAYS is exported as 7', () => {
    expect(STALE_PRICE_THRESHOLD_DAYS).toBe(7);
  });

  it('lotCount is passed through unchanged', () => {
    const r = computePortfolioPnL([], 0, 42, NOW);
    expect(r.lotCount).toBe(42);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/services/pnl.test.ts`
Expected: Module not found error.

- [ ] **Step 3: Implement `lib/services/pnl.ts`**

Create `lib/services/pnl.ts`:

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
  realizedRipPnLCents: number;
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

  return {
    totalInvestedCents,
    pricedInvestedCents,
    totalCurrentValueCents,
    unrealizedPnLCents,
    unrealizedPnLPct,
    realizedRipPnLCents: -realizedRipLossCents,
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

- [ ] **Step 4: Run tests pass**

Run: `npx vitest run lib/services/pnl.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/pnl.ts lib/services/pnl.test.ts
git commit -m "feat(pnl): add pure portfolio P&L service"
```

---

## Task 7: Rewrite `/api/dashboard/totals` to return `PortfolioPnL`

**Files:**
- Modify: `app/api/dashboard/totals/route.ts`
- Create: `app/api/dashboard/totals/route.test.ts`
- Modify: `lib/query/hooks/useDashboardTotals.ts`

**Spec:** Sections 6.1, 9.2.

- [ ] **Step 1: Update `useDashboardTotals` to import the `PortfolioPnL` type**

Open `lib/query/hooks/useDashboardTotals.ts`. Replace the inline `DashboardTotals` type with a re-export of `PortfolioPnL` so other consumers can import from one place:

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import type { PortfolioPnL } from '@/lib/services/pnl';

export type DashboardTotals = PortfolioPnL;

export function useDashboardTotals() {
  return useQuery({
    queryKey: ['dashboardTotals'],
    queryFn: async (): Promise<PortfolioPnL> => {
      const res = await fetch('/api/dashboard/totals');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body;
    },
  });
}
```

- [ ] **Step 2: Rewrite `app/api/dashboard/totals/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
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
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id, realized_loss_cents');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

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

  const realizedRipLossCents = (rips ?? []).reduce(
    (acc, r) => acc + ((r as { realized_loss_cents: number }).realized_loss_cents ?? 0),
    0
  );
  const lotCount = (purchases ?? []).length;

  const result = computePortfolioPnL(holdings, realizedRipLossCents, lotCount);
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Write the route test**

Create `app/api/dashboard/totals/route.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

type Purchase = {
  id: number;
  catalog_item_id: number;
  quantity: number;
  cost_cents: number;
  deleted_at: string | null;
  created_at: string;
  catalog_item: {
    kind: 'sealed' | 'card';
    name: string;
    set_name: string | null;
    product_type: string | null;
    image_url: string | null;
    image_storage_path: string | null;
    last_market_cents: number | null;
    last_market_at: string | null;
  };
};

function buildSupabase(opts: {
  authedUserId?: string | null;
  purchases?: Purchase[];
  rips?: Array<{ id: number; source_purchase_id: number; realized_loss_cents: number }>;
  decompositions?: Array<{ id: number; source_purchase_id: number }>;
}) {
  const fromMap: Record<string, unknown> = {
    purchases: {
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data: opts.purchases ?? [], error: null }),
      }),
    },
    rips: {
      select: vi.fn().mockResolvedValue({ data: opts.rips ?? [], error: null }),
    },
    box_decompositions: {
      select: vi.fn().mockResolvedValue({ data: opts.decompositions ?? [], error: null }),
    },
  };
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.authedUserId == null ? null : { id: opts.authedUserId } },
      }),
    },
    from: vi.fn((table: string) => fromMap[table]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/dashboard/totals', () => {
  it('returns 401 when unauthenticated', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: null })
    );
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  it('returns zeros for empty data', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases: [], rips: [], decompositions: [] })
    );
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalInvestedCents).toBe(0);
    expect(body.unrealizedPnLPct).toBeNull();
    expect(body.bestPerformers).toEqual([]);
    expect(body.worstPerformers).toEqual([]);
  });

  it('mixed priced + unpriced fixture: unrealized P&L computed correctly', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 1,
        quantity: 1,
        cost_cents: 5000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-27T00:00:00Z',
        },
      },
      {
        id: 2,
        catalog_item_id: 2,
        quantity: 1,
        cost_cents: 3000,
        deleted_at: null,
        created_at: '2026-04-26T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'Tin',
          set_name: 'SV151',
          product_type: 'Tin',
          image_url: null,
          image_storage_path: null,
          last_market_cents: null,
          last_market_at: null,
        },
      },
    ];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips: [], decompositions: [] })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.totalInvestedCents).toBe(8000);
    expect(body.pricedInvestedCents).toBe(5000);
    expect(body.totalCurrentValueCents).toBe(6000);
    expect(body.unrealizedPnLCents).toBe(1000);
    expect(body.pricedCount).toBe(1);
    expect(body.unpricedCount).toBe(1);
    expect(body.lotCount).toBe(2);
  });

  it('subtracts ripped + decomposed qty before pricing', async () => {
    const purchases: Purchase[] = [
      {
        id: 1,
        catalog_item_id: 1,
        quantity: 3,
        cost_cents: 5000,
        deleted_at: null,
        created_at: '2026-04-25T00:00:00Z',
        catalog_item: {
          kind: 'sealed',
          name: 'ETB',
          set_name: 'SV151',
          product_type: 'ETB',
          image_url: null,
          image_storage_path: null,
          last_market_cents: 6000,
          last_market_at: '2026-04-27T00:00:00Z',
        },
      },
    ];
    const rips = [{ id: 100, source_purchase_id: 1, realized_loss_cents: 500 }];
    const decompositions = [{ id: 200, source_purchase_id: 1 }];
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({ authedUserId: 'u1', purchases, rips, decompositions })
    );
    const res = await GET();
    const body = await res.json();
    // qty=3, 1 rip + 1 decomp consumed → 1 left, value = 6000, invested = 5000, pnl = 1000
    expect(body.totalCurrentValueCents).toBe(6000);
    expect(body.pricedInvestedCents).toBe(5000);
    expect(body.unrealizedPnLCents).toBe(1000);
    expect(body.realizedRipPnLCents).toBe(-500);
  });

  it('realized rip P&L sign is flipped at the boundary', async () => {
    (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildSupabase({
        authedUserId: 'u1',
        purchases: [],
        rips: [{ id: 1, source_purchase_id: 99, realized_loss_cents: 500 }],
        decompositions: [],
      })
    );
    const res = await GET();
    const body = await res.json();
    expect(body.realizedRipPnLCents).toBe(-500);
  });
});
```

- [ ] **Step 4: Run route test**

Run: `npx vitest run app/api/dashboard/totals/route.test.ts`
Expected: All 5 tests pass.

- [ ] **Step 5: Type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors. (`DashboardTotalsCard` will reference removed fields like `lotCount`/`totalInvestedCents` which still exist on `PortfolioPnL`, but other fields like `totalRipLossCents` are gone — Task 14 fixes the card.)

If `DashboardTotalsCard` errors: that's expected; it will be fully rewritten in Task 12. Step 6 below applies a small interim stub to keep tsc green so this task can commit independently.

- [ ] **Step 6: Provisionally update the existing card to satisfy tsc**

In `components/dashboard/DashboardTotalsCard.tsx`, replace the body that references `data.totalRipLossCents` (which no longer exists on the new shape) with a stub that satisfies the new type so we can run `tsc --noEmit` clean. Task 12 replaces this entirely. Concretely, replace the entire file body after the imports with:

```tsx
export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();
  if (isLoading || !data || data.lotCount === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Total invested</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCents(data.totalInvestedCents)}
        </div>
      </CardContent>
    </Card>
  );
}
```

This is a placeholder; Task 14 replaces it entirely. Make sure the imports still include `formatCents` from the shared util.

- [ ] **Step 7: All tests still pass**

Run: `npx vitest run`
Expected: All passing.

- [ ] **Step 8: Commit**

```bash
git add app/api/dashboard/totals/route.ts \
        app/api/dashboard/totals/route.test.ts \
        lib/query/hooks/useDashboardTotals.ts \
        components/dashboard/DashboardTotalsCard.tsx
git commit -m "feat(api): /api/dashboard/totals returns PortfolioPnL"
```

---

## Task 8: Update `/api/holdings` to return `HoldingPnL[]`

**Files:**
- Modify: `app/api/holdings/route.ts`
- Modify: `lib/query/hooks/useHoldings.ts`

**Spec:** Section 6.2.

- [ ] **Step 1: Update the holdings list route**

Open `app/api/holdings/route.ts`. Add the import and run each holding through `computeHoldingPnL`:

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  aggregateHoldings,
  type RawPurchaseRow,
  type RawRipRow,
  type RawDecompositionRow,
} from '@/lib/services/holdings';
import { computeHoldingPnL } from '@/lib/services/pnl';

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
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const { data: rips, error: rErr } = await supabase
    .from('rips')
    .select('id, source_purchase_id');
  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

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

  const now = new Date();
  const holdingsPnL = holdings.map((h) => computeHoldingPnL(h, now));

  return NextResponse.json({ holdings: holdingsPnL });
}
```

- [ ] **Step 2: Update `useHoldings` typing**

Open `lib/query/hooks/useHoldings.ts`. Replace the `Holding` import + return type for `useHoldings` with `HoldingPnL`:

```ts
'use client';
import { useQuery } from '@tanstack/react-query';
import type { HoldingPnL } from '@/lib/services/pnl';

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
      return json<{ holdings: HoldingPnL[] }>(res);
    },
  });
}

// HoldingDetailDto is below — leave the rest of the file untouched until Task 9.
```

(Keep the rest of the file intact; the `HoldingDetailDto` change comes in Task 9.)

- [ ] **Step 3: Update `app/(authenticated)/holdings/page.tsx` to compute P&L for SSR**

The SSR page passes `holdings: Holding[]` to `HoldingsGrid` as `initialHoldings`. The grid's prop type changes to `HoldingPnL[]`, so the SSR also needs to map. Update:

Find:

```ts
import { aggregateHoldings, type RawPurchaseRow, type RawRipRow, type RawDecompositionRow } from '@/lib/services/holdings';
```

Add:

```ts
import { computeHoldingPnL } from '@/lib/services/pnl';
```

Replace the section that does:

```ts
const holdings = aggregateHoldings(
  (purchases ?? []) as unknown as RawPurchaseRow[],
  (rips ?? []) as RawRipRow[],
  (decompositions ?? []) as RawDecompositionRow[]
);
```

with:

```ts
const holdings = aggregateHoldings(
  (purchases ?? []) as unknown as RawPurchaseRow[],
  (rips ?? []) as RawRipRow[],
  (decompositions ?? []) as RawDecompositionRow[]
);
const now = new Date();
const holdingsPnL = holdings.map((h) => computeHoldingPnL(h, now));
```

Then change:

```tsx
<HoldingsGrid initialHoldings={holdings} />
```

to:

```tsx
<HoldingsGrid initialHoldings={holdingsPnL} />
```

- [ ] **Step 4: Update `HoldingsGrid` import**

Open `app/(authenticated)/holdings/HoldingsGrid.tsx`. Change the type import:

Before:
```ts
import type { Holding } from '@/lib/services/holdings';
```

After:
```ts
import type { HoldingPnL } from '@/lib/services/pnl';
```

And update the prop type:

Before:
```ts
export function HoldingsGrid({ initialHoldings }: { initialHoldings: Holding[] }) {
```

After:
```ts
export function HoldingsGrid({ initialHoldings }: { initialHoldings: HoldingPnL[] }) {
```

(Body still references `h.totalInvestedCents`, `h.qtyHeld`, etc. — all fields exist on `HoldingPnL`. No rendering change yet; that's Task 16.)

- [ ] **Step 5: Type-check + tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No errors. All passing.

- [ ] **Step 6: Commit**

```bash
git add app/api/holdings/route.ts \
        app/(authenticated)/holdings/page.tsx \
        app/(authenticated)/holdings/HoldingsGrid.tsx \
        lib/query/hooks/useHoldings.ts
git commit -m "feat(api): /api/holdings returns HoldingPnL[]"
```

---

## Task 9: Update `/api/holdings/[catalogItemId]` to widen `holding` to `HoldingPnL`

**Files:**
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/page.tsx`
- Modify: `lib/query/hooks/useHoldings.ts`

**Spec:** Section 6.3.

- [ ] **Step 1: Update the route**

In `app/api/holdings/[catalogItemId]/route.ts`, add the import:

```ts
import { computeHoldingPnL } from '@/lib/services/pnl';
```

Find the section that produces `holding`:

```ts
const [holding] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);
```

Replace with:

```ts
const [holdingRaw] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);
const now = new Date();
const holding = holdingRaw ? computeHoldingPnL(holdingRaw, now) : null;
```

Then update the `holding` field in the final response. The fallback shape (when `holding` is null) needs to match `HoldingPnL`. Replace the existing `holding ?? { ... fallback ...}` with:

```ts
holding: holding ?? {
  catalogItemId: item.id,
  kind: item.kind as 'sealed' | 'card',
  name: item.name,
  setName: item.setName,
  productType: item.productType,
  imageUrl: item.imageUrl,
  imageStoragePath: item.imageStoragePath,
  lastMarketCents: item.lastMarketCents,
  lastMarketAt: item.lastMarketAt instanceof Date ? item.lastMarketAt.toISOString() : item.lastMarketAt,
  qtyHeld: 0,
  totalInvestedCents: 0,
  currentValueCents: null,
  pnlCents: null,
  pnlPct: null,
  priced: false,
  stale: false,
},
```

- [ ] **Step 2: Same change in the SSR page**

Open `app/(authenticated)/holdings/[catalogItemId]/page.tsx`. Add the import:

```ts
import { computeHoldingPnL } from '@/lib/services/pnl';
```

Find:

```ts
const [holding] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);
```

Replace with:

```ts
const [holdingRaw] = aggregateHoldings(rawPurchases, rawRips, rawDecompositions);
const now = new Date();
const holding = holdingRaw ? computeHoldingPnL(holdingRaw, now) : null;
```

Find the `holding: holding ?? { ... }` fallback block inside `initial: HoldingDetailDto = { ... }` and apply the same replacement as Step 1.

- [ ] **Step 3: Update `HoldingDetailDto.holding` type**

Open `lib/query/hooks/useHoldings.ts`. Find:

```ts
import type { Holding } from '@/lib/services/holdings';
```

If it's still imported elsewhere (the file no longer uses `Holding` after Task 8), either remove the import (preferred) or just keep it. Then change:

```ts
holding: Holding;
```

to:

```ts
holding: HoldingPnL;
```

The `HoldingDetailDto` file should now import `HoldingPnL` and not `Holding`:

```ts
import type { HoldingPnL } from '@/lib/services/pnl';
```

- [ ] **Step 4: Type-check + tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No errors. All passing. (HoldingDetailClient might error on `detail.holding.totalInvestedCents` — that field exists on HoldingPnL, so it's fine. P&L rendering changes happen in Task 17.)

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings/[catalogItemId]/route.ts \
        app/(authenticated)/holdings/[catalogItemId]/page.tsx \
        lib/query/hooks/useHoldings.ts
git commit -m "feat(api): widen holding detail DTO to HoldingPnL"
```

---

## Task 10: Build `<PnLDisplay>` shared component

**Files:**
- Create: `components/holdings/PnLDisplay.tsx`
- Create: `components/holdings/PnLDisplay.test.tsx`

**Spec:** Section 7.5.

- [ ] **Step 1: Write the failing tests**

Create `components/holdings/PnLDisplay.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PnLDisplay } from './PnLDisplay';

describe('PnLDisplay', () => {
  it('renders positive P&L with + sign and green class', () => {
    const { container } = render(<PnLDisplay pnlCents={12345} pnlPct={12.3} />);
    expect(container.textContent).toContain('+$123.45');
    expect(container.textContent).toContain('+12.3%');
    expect(container.querySelector('[data-pnl-sign="positive"]')).not.toBeNull();
  });

  it('renders negative P&L with - sign and destructive class', () => {
    const { container } = render(<PnLDisplay pnlCents={-12345} pnlPct={-12.3} />);
    expect(container.textContent).toContain('-$123.45');
    expect(container.textContent).toContain('-12.3%');
    expect(container.querySelector('[data-pnl-sign="negative"]')).not.toBeNull();
  });

  it('renders zero P&L unsigned', () => {
    const { container } = render(<PnLDisplay pnlCents={0} pnlPct={0} />);
    expect(container.textContent).toContain('$0.00');
    expect(container.querySelector('[data-pnl-sign="zero"]')).not.toBeNull();
  });

  it('renders em-dash when pnlCents is null', () => {
    render(<PnLDisplay pnlCents={null} pnlPct={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('shows pct only when pnlPct is non-null', () => {
    const { container } = render(<PnLDisplay pnlCents={1000} pnlPct={null} />);
    expect(container.textContent).toContain('+$10.00');
    expect(container.textContent).not.toContain('%');
  });

  it('omits pct when showPct is false', () => {
    const { container } = render(<PnLDisplay pnlCents={1000} pnlPct={20} showPct={false} />);
    expect(container.textContent).toContain('+$10.00');
    expect(container.textContent).not.toContain('%');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/holdings/PnLDisplay.test.tsx`
Expected: Module not found.

- [ ] **Step 3: Implement `<PnLDisplay>`**

Create `components/holdings/PnLDisplay.tsx`:

```tsx
import { formatCentsSigned, formatPct } from '@/lib/utils/format';

export type PnLDisplayProps = {
  pnlCents: number | null;
  pnlPct: number | null;
  showPct?: boolean;
  className?: string;
};

export function PnLDisplay({ pnlCents, pnlPct, showPct = true, className }: PnLDisplayProps) {
  if (pnlCents == null) {
    return (
      <span className={className} data-pnl-sign="null">
        —
      </span>
    );
  }
  const sign = pnlCents > 0 ? 'positive' : pnlCents < 0 ? 'negative' : 'zero';
  const colorClass =
    sign === 'positive' ? 'text-green-600' : sign === 'negative' ? 'text-destructive' : 'text-foreground';
  return (
    <span
      className={[colorClass, 'tabular-nums', className].filter(Boolean).join(' ')}
      data-pnl-sign={sign}
    >
      {formatCentsSigned(pnlCents)}
      {showPct && pnlPct != null ? <> ({formatPct(pnlPct)})</> : null}
    </span>
  );
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run components/holdings/PnLDisplay.test.tsx`
Expected: All 6 pass.

- [ ] **Step 5: Commit**

```bash
git add components/holdings/PnLDisplay.tsx components/holdings/PnLDisplay.test.tsx
git commit -m "feat(holdings): add PnLDisplay shared component"
```

---

## Task 11: Build `<StalePill>` and `<UnpricedBadge>` shared components

**Files:**
- Create: `components/holdings/StalePill.tsx`
- Create: `components/holdings/UnpricedBadge.tsx`

**Spec:** Section 7.5.

**Why:** These are tiny and highly correlated. One task. No tests — they're pure presentational with no logic worth covering separately.

- [ ] **Step 1: Create `StalePill.tsx`**

```tsx
import Link from 'next/link';

export type StalePillProps = {
  stale: boolean;
  /** Optional href to link to (e.g. catalog detail where refresh lives). */
  linkHref?: string;
  className?: string;
};

export function StalePill({ stale, linkHref, className }: StalePillProps) {
  if (!stale) return null;
  const baseClasses =
    'inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800';
  const combined = [baseClasses, className].filter(Boolean).join(' ');
  if (linkHref) {
    return (
      <Link href={linkHref} className={`${combined} hover:bg-amber-100`} aria-label="Stale price, click to refresh">
        Stale
      </Link>
    );
  }
  return (
    <span className={combined} aria-label="Stale price">
      Stale
    </span>
  );
}
```

- [ ] **Step 2: Create `UnpricedBadge.tsx`**

```tsx
export type UnpricedBadgeProps = {
  className?: string;
};

export function UnpricedBadge({ className }: UnpricedBadgeProps) {
  const baseClasses =
    'inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground';
  return (
    <span className={[baseClasses, className].filter(Boolean).join(' ')} aria-label="No price available">
      Unpriced
    </span>
  );
}
```

- [ ] **Step 3: Type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/holdings/StalePill.tsx components/holdings/UnpricedBadge.tsx
git commit -m "feat(holdings): add StalePill + UnpricedBadge components"
```

---

## Task 12: Rewrite `DashboardTotalsCard` with 4-stat layout

**Files:**
- Modify: `components/dashboard/DashboardTotalsCard.tsx`
- Create: `components/dashboard/DashboardTotalsCard.test.tsx`

**Spec:** Section 7.1.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/DashboardTotalsCard.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardTotalsCard } from './DashboardTotalsCard';
import type { PortfolioPnL } from '@/lib/services/pnl';

vi.mock('@/lib/query/hooks/useDashboardTotals', () => ({
  useDashboardTotals: vi.fn(),
}));
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const baseData: PortfolioPnL = {
  totalInvestedCents: 543210,
  pricedInvestedCents: 498765,
  totalCurrentValueCents: 610955,
  unrealizedPnLCents: 112190,
  unrealizedPnLPct: 22.49,
  realizedRipPnLCents: -2430,
  pricedCount: 11,
  unpricedCount: 1,
  staleCount: 2,
  lotCount: 12,
  perHolding: [],
  bestPerformers: [],
  worstPerformers: [],
};

describe('DashboardTotalsCard', () => {
  it('renders nothing when zero lots', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseData, lotCount: 0 },
      isLoading: false,
    });
    const { container } = render(withQuery(<DashboardTotalsCard />));
    expect(container.textContent).toBe('');
  });

  it('renders all four stats with signed P&L on happy path', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: baseData,
      isLoading: false,
    });
    render(withQuery(<DashboardTotalsCard />));
    expect(screen.getByText('Invested')).toBeTruthy();
    expect(screen.getByText('Current value')).toBeTruthy();
    expect(screen.getByText('Unrealized P&L')).toBeTruthy();
    expect(screen.getByText('Realized rip P&L')).toBeTruthy();
    expect(screen.getByText('$5,432.10')).toBeTruthy();
    expect(screen.getByText('$6,109.55')).toBeTruthy();
    // signed +$1,121.90
    expect(screen.getByText(/\+\$1,121\.90/)).toBeTruthy();
    // signed -$24.30
    expect(screen.getByText(/-\$24\.30/)).toBeTruthy();
    // caption
    expect(screen.getByText(/12 lots · 11 priced · 1 unpriced · 2 stale/)).toBeTruthy();
  });

  it('renders em-dash for current value and P&L when nothing priced', () => {
    (useDashboardTotals as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseData, pricedInvestedCents: 0, pricedCount: 0, unpricedCount: 12, totalCurrentValueCents: 0, unrealizedPnLCents: 0, unrealizedPnLPct: null, staleCount: 0 },
      isLoading: false,
    });
    render(withQuery(<DashboardTotalsCard />));
    // both current value and P&L are em-dashes
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/dashboard/DashboardTotalsCard.test.tsx`
Expected: All fail (DOM doesn't have the new structure yet).

- [ ] **Step 3: Rewrite `DashboardTotalsCard.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{children}</div>
    </div>
  );
}

export function DashboardTotalsCard() {
  const { data, isLoading } = useDashboardTotals();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 w-full animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.lotCount === 0) {
    return null;
  }

  const nothingPriced = data.pricedInvestedCents === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Invested">{formatCents(data.totalInvestedCents)}</Stat>
          <Stat label="Current value">
            {nothingPriced ? '—' : formatCents(data.totalCurrentValueCents)}
          </Stat>
          <Stat label="Unrealized P&L">
            {nothingPriced ? (
              <span>—</span>
            ) : (
              <PnLDisplay pnlCents={data.unrealizedPnLCents} pnlPct={data.unrealizedPnLPct} />
            )}
          </Stat>
          <Stat label="Realized rip P&L">
            <PnLDisplay pnlCents={data.realizedRipPnLCents} pnlPct={null} showPct={false} />
          </Stat>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.lotCount} lot{data.lotCount === 1 ? '' : 's'} · {data.pricedCount} priced · {data.unpricedCount} unpriced
          {data.staleCount > 0 ? ` · ${data.staleCount} stale` : ''}
        </div>
        <Link href="/holdings" className="text-sm underline">
          View holdings
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Tests pass**

Run: `npx vitest run components/dashboard/DashboardTotalsCard.test.tsx`
Expected: All 3 pass.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/DashboardTotalsCard.tsx components/dashboard/DashboardTotalsCard.test.tsx
git commit -m "feat(dashboard): 4-stat totals card with unrealized P&L"
```

---

## Task 13: Build `<DashboardPerformersCard>` and wire into dashboard

**Files:**
- Create: `components/dashboard/DashboardPerformersCard.tsx`
- Create: `components/dashboard/DashboardPerformersCard.test.tsx`
- Modify: `app/(authenticated)/page.tsx`

**Spec:** Section 7.2.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/DashboardPerformersCard.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardPerformersCard } from './DashboardPerformersCard';
import type { HoldingPnL } from '@/lib/services/pnl';

function makeHolding(overrides: Partial<HoldingPnL> = {}): HoldingPnL {
  return {
    catalogItemId: 1,
    name: 'ETB',
    setName: 'SV151',
    productType: 'Elite Trainer Box',
    kind: 'sealed',
    imageUrl: null,
    imageStoragePath: null,
    qtyHeld: 1,
    totalInvestedCents: 5000,
    lastMarketCents: 6000,
    lastMarketAt: '2026-04-27T00:00:00Z',
    currentValueCents: 6000,
    pnlCents: 1000,
    pnlPct: 20,
    priced: true,
    stale: false,
    ...overrides,
  };
}

describe('DashboardPerformersCard', () => {
  it('renders best and worst sections with rows', () => {
    render(
      <DashboardPerformersCard
        bestPerformers={[makeHolding({ catalogItemId: 1, name: 'Top' })]}
        worstPerformers={[makeHolding({ catalogItemId: 2, name: 'Bottom', pnlCents: -2000, pnlPct: -40 })]}
      />
    );
    expect(screen.getByText('Best performers')).toBeTruthy();
    expect(screen.getByText('Worst performers')).toBeTruthy();
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByText('Bottom')).toBeTruthy();
  });

  it('renders nothing when both arrays are empty', () => {
    const { container } = render(
      <DashboardPerformersCard bestPerformers={[]} worstPerformers={[]} />
    );
    expect(container.textContent).toBe('');
  });

  it('rows link to /holdings/[catalogItemId]', () => {
    render(
      <DashboardPerformersCard
        bestPerformers={[makeHolding({ catalogItemId: 42 })]}
        worstPerformers={[]}
      />
    );
    const link = screen.getByRole('link', { name: /ETB/ });
    expect(link.getAttribute('href')).toBe('/holdings/42');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/dashboard/DashboardPerformersCard.test.tsx`
Expected: Module not found.

- [ ] **Step 3: Implement the card**

Create `components/dashboard/DashboardPerformersCard.tsx`:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { getImageUrl } from '@/lib/utils/images';
import type { HoldingPnL } from '@/lib/services/pnl';

export type DashboardPerformersCardProps = {
  bestPerformers: HoldingPnL[];
  worstPerformers: HoldingPnL[];
};

function PerformerRow({ holding }: { holding: HoldingPnL }) {
  return (
    <Link
      href={`/holdings/${holding.catalogItemId}`}
      className="flex items-center gap-3 rounded-md p-2 transition hover:bg-muted"
    >
      <div
        className={
          holding.kind === 'sealed'
            ? 'size-12 shrink-0 overflow-hidden rounded-md bg-muted'
            : 'h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted'
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getImageUrl({ imageStoragePath: holding.imageStoragePath, imageUrl: holding.imageUrl })}
          alt={holding.name}
          loading="lazy"
          className="size-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-1 text-sm font-medium">{holding.name}</div>
        <div className="text-xs text-muted-foreground">{holding.setName ?? '—'}</div>
      </div>
      <div className="text-right text-sm">
        <PnLDisplay pnlCents={holding.pnlCents} pnlPct={holding.pnlPct} />
      </div>
    </Link>
  );
}

export function DashboardPerformersCard({ bestPerformers, worstPerformers }: DashboardPerformersCardProps) {
  if (bestPerformers.length === 0 && worstPerformers.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Best performers
            </h3>
            <div className="space-y-1">
              {bestPerformers.map((h) => (
                <PerformerRow key={`best-${h.catalogItemId}`} holding={h} />
              ))}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">
              Worst performers
            </h3>
            <div className="space-y-1">
              {worstPerformers.map((h) => (
                <PerformerRow key={`worst-${h.catalogItemId}`} holding={h} />
              ))}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Wire into the dashboard page**

Open `app/(authenticated)/page.tsx`. The current page renders only `<DashboardTotalsCard />` when `hasLots`. We add the performers card right beneath it. The performers data lives on the same `useDashboardTotals` query, but the dashboard page is a server component — easiest is to lift the rendering into a thin client wrapper, or use a separate client component that re-uses the same query.

Cleanest: render performers via a tiny client wrapper that consumes the same query (TanStack Query dedupes the request). Add to the page:

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { DashboardTotalsCard } from '@/components/dashboard/DashboardTotalsCard';
import { DashboardPerformersWrapper } from '@/components/dashboard/DashboardPerformersWrapper';

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
        <>
          <DashboardTotalsCard />
          <DashboardPerformersWrapper />
        </>
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

- [ ] **Step 5: Create the wrapper**

Create `components/dashboard/DashboardPerformersWrapper.tsx`:

```tsx
'use client';
import { useDashboardTotals } from '@/lib/query/hooks/useDashboardTotals';
import { DashboardPerformersCard } from './DashboardPerformersCard';

export function DashboardPerformersWrapper() {
  const { data } = useDashboardTotals();
  if (!data) return null;
  return (
    <DashboardPerformersCard
      bestPerformers={data.bestPerformers}
      worstPerformers={data.worstPerformers}
    />
  );
}
```

- [ ] **Step 6: Tests pass**

Run: `npx vitest run components/dashboard/`
Expected: All passing.

- [ ] **Step 7: Type-check passes**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/DashboardPerformersCard.tsx \
        components/dashboard/DashboardPerformersCard.test.tsx \
        components/dashboard/DashboardPerformersWrapper.tsx \
        app/(authenticated)/page.tsx
git commit -m "feat(dashboard): add Best/Worst performers card"
```

---

## Task 14: Update `HoldingsGrid` per-card footer with P&L

**Files:**
- Modify: `app/(authenticated)/holdings/HoldingsGrid.tsx`

**Spec:** Section 7.3.

- [ ] **Step 1: Update the grid card markup**

Open `app/(authenticated)/holdings/HoldingsGrid.tsx`. Replace the per-card footer block. Find:

```tsx
<div className="mt-3 flex items-center justify-between text-xs">
  <span className="font-medium tabular-nums">Qty: {h.qtyHeld}</span>
  <span className="text-muted-foreground tabular-nums">
    {formatCents(h.totalInvestedCents)}
  </span>
</div>
```

Replace with:

```tsx
<div className="mt-3 space-y-1 text-xs">
  <div className="flex items-center justify-between">
    <span className="font-medium tabular-nums">Qty: {h.qtyHeld}</span>
    <span className="text-muted-foreground tabular-nums">
      {formatCents(h.totalInvestedCents)}
    </span>
  </div>
  <div className="flex items-center justify-between gap-2">
    {h.priced ? (
      <>
        <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
          {formatCents(h.currentValueCents!)}
          <StalePill stale={h.stale} linkHref={`/catalog/${h.catalogItemId}`} />
        </span>
        <PnLDisplay pnlCents={h.pnlCents} pnlPct={h.pnlPct} />
      </>
    ) : (
      <UnpricedBadge />
    )}
  </div>
</div>
```

Add the imports at the top of the file:

```ts
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { StalePill } from '@/components/holdings/StalePill';
import { UnpricedBadge } from '@/components/holdings/UnpricedBadge';
```

- [ ] **Step 2: Type-check + tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No errors. All passing.

- [ ] **Step 3: Commit**

```bash
git add app/(authenticated)/holdings/HoldingsGrid.tsx
git commit -m "feat(holdings): per-card P&L footer with Stale/Unpriced badges"
```

---

## Task 15: Update `HoldingDetailClient` header with P&L

**Files:**
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

**Spec:** Section 7.4.

- [ ] **Step 1: Build a per-lot consumed map (rips + decompositions)**

In `HoldingDetailClient`, the existing `rippedUnitsByLot` map only counts rips. Plan 4 needs both rips and decompositions to compute correct per-lot remaining qty for P&L. Find:

```ts
// Build a map of source_purchase_id -> ripped_units for sealed lots.
// Used to gate the "Rip pack" menu item per lot.
const rippedUnitsByLot = new Map<number, number>();
for (const r of detail.rips) {
  rippedUnitsByLot.set(r.sourcePurchaseId, (rippedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
}
```

Replace with:

```ts
// Build a map of source_purchase_id -> consumed_units (rips + decompositions) for sealed lots.
// Used to gate the "Rip pack" / "Open box" menu items per lot AND to compute per-lot P&L.
const consumedUnitsByLot = new Map<number, number>();
for (const r of detail.rips) {
  consumedUnitsByLot.set(r.sourcePurchaseId, (consumedUnitsByLot.get(r.sourcePurchaseId) ?? 0) + 1);
}
for (const d of detail.decompositions) {
  consumedUnitsByLot.set(d.sourcePurchaseId, (consumedUnitsByLot.get(d.sourcePurchaseId) ?? 0) + 1);
}
```

Then update the inner per-lot consumption read. Find:

```ts
const ripped = rippedUnitsByLot.get(lot.id) ?? 0;
const qtyRemaining = lot.quantity - ripped;
```

Replace with:

```ts
const consumed = consumedUnitsByLot.get(lot.id) ?? 0;
const qtyRemaining = lot.quantity - consumed;
```

- [ ] **Step 2: Replace the header block with P&L**

Find the `<div className="flex items-center justify-between gap-4 border-b pb-6">` block and rebuild the left side:

```tsx
<div className="flex items-center justify-between gap-4 border-b pb-6">
  <div className="space-y-1 text-sm">
    <p className="text-muted-foreground">
      Qty held: <span className="font-semibold text-foreground tabular-nums">{detail.holding.qtyHeld}</span>
    </p>
    <p className="text-muted-foreground">
      Invested:{' '}
      <span className="font-semibold text-foreground tabular-nums">
        {formatCents(detail.holding.totalInvestedCents)}
      </span>
    </p>
    {detail.holding.priced ? (
      <>
        <p className="text-muted-foreground">
          Current value:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {formatCents(detail.holding.currentValueCents!)}
          </span>
          <StalePill stale={detail.holding.stale} linkHref={`/catalog/${detail.holding.catalogItemId}`} className="ml-2 align-middle" />
        </p>
        <p className="text-muted-foreground">
          Unrealized P&L:{' '}
          <PnLDisplay pnlCents={detail.holding.pnlCents} pnlPct={detail.holding.pnlPct} className="font-semibold" />
        </p>
      </>
    ) : (
      <p>
        <UnpricedBadge className="mr-2" />
        <span className="text-xs text-muted-foreground">Refresh on the catalog page to populate P&L.</span>
      </p>
    )}
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
```

Add the imports:

```ts
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
import { StalePill } from '@/components/holdings/StalePill';
import { UnpricedBadge } from '@/components/holdings/UnpricedBadge';
```

- [ ] **Step 3: Pass `currentUnitMarketCents` and `qtyRemaining` to LotRow**

Find the JSX where `<LotRow ...>` is rendered. Update the props passed to include `currentUnitMarketCents`:

```tsx
<LotRow
  key={lot.id}
  lot={editableLot}
  catalogItem={catalogItem}
  sourceRip={sourceRip}
  sourcePack={sourcePack}
  sourceDecomposition={sourceDecomposition}
  sourceContainer={sourceContainer}
  currentUnitMarketCents={detail.holding.lastMarketCents}
  qtyRemaining={qtyRemaining}
  onRip={canRip ? openRip : undefined}
  onOpenBox={canOpenBox ? openOpenBox : undefined}
/>
```

(LotRow's prop signature is updated in Task 16; this prop will compile-error until that lands. Acceptable to commit after Task 16.)

- [ ] **Step 4: Type-check; expect known temp error from LotRow until Task 16**

Run: `npx tsc --noEmit`
Expected: One error in this file: "currentUnitMarketCents does not exist on LotRowProps". Will resolve after Task 16. Do NOT commit yet.

---

## Task 16: Update `LotRow` with `currentUnitMarketCents` + per-lot P&L lines

**Files:**
- Modify: `components/purchases/LotRow.tsx`
- Create: `components/purchases/LotRow.test.tsx`

**Spec:** Sections 7.4, 9.4.

- [ ] **Step 1: Write the failing test**

Create `components/purchases/LotRow.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LotRow } from './LotRow';
import type { EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';

vi.mock('@/lib/query/hooks/usePurchases', () => ({
  useDeletePurchase: () => ({ mutateAsync: vi.fn(), isPending: false }),
  DeletePurchaseError: class extends Error {},
}));

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const lot: EditableLot = {
  id: 1,
  catalogItemId: 1,
  purchaseDate: '2026-04-25',
  quantity: 2,
  costCents: 5000,
  source: null,
  location: null,
  notes: null,
  condition: null,
  isGraded: false,
  gradingCompany: null,
  grade: null,
  certNumber: null,
  sourceRipId: null,
};

const catalogItem: PurchaseFormCatalogItem = {
  id: 1,
  kind: 'sealed',
  name: 'ETB',
  setName: 'SV151',
  productType: 'Elite Trainer Box',
  cardNumber: null,
  rarity: null,
  variant: null,
  imageUrl: null,
  msrpCents: null,
  lastMarketCents: 6000,
  packCount: 9,
};

describe('LotRow per-lot P&L', () => {
  it('renders Lot value + signed P&L when currentUnitMarketCents is provided', () => {
    render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={6000}
        qtyRemaining={2}
      />
    ));
    // qty=2, market=6000, cost=5000 → value=12000=$120.00, pnl=+2000=+$20.00
    expect(screen.getByText(/Lot value: \$120\.00/)).toBeTruthy();
    expect(screen.getByText(/\+\$20\.00/)).toBeTruthy();
  });

  it('omits Lot value/P&L when currentUnitMarketCents is null', () => {
    const { container } = render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={null}
        qtyRemaining={2}
      />
    ));
    expect(container.textContent).not.toMatch(/Lot value:/);
  });

  it('omits Lot value/P&L when qtyRemaining is 0', () => {
    const { container } = render(withQuery(
      <LotRow
        lot={lot}
        catalogItem={catalogItem}
        currentUnitMarketCents={6000}
        qtyRemaining={0}
      />
    ));
    expect(container.textContent).not.toMatch(/Lot value:/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run components/purchases/LotRow.test.tsx`
Expected: TypeScript / runtime errors (the props don't exist yet).

- [ ] **Step 3: Extend `LotRowProps` and render per-lot P&L**

Open `components/purchases/LotRow.tsx`. Update the imports:

```ts
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { useDeletePurchase, DeletePurchaseError } from '@/lib/query/hooks/usePurchases';
import { EditPurchaseDialog, type EditableLot } from './EditPurchaseDialog';
import type { PurchaseFormCatalogItem } from './PurchaseForm';
import { formatCents } from '@/lib/utils/format';
import { PnLDisplay } from '@/components/holdings/PnLDisplay';
```

Update the prop type:

```ts
export type LotRowProps = {
  lot: EditableLot;
  catalogItem: PurchaseFormCatalogItem;
  sourcePack?: { catalogItemId: number; name: string } | null;
  sourceRip?: { id: number; ripDate: string } | null;
  sourceContainer?: { catalogItemId: number; name: string } | null;
  sourceDecomposition?: { id: number; decomposeDate: string } | null;
  /** Current market price per unit; null if unpriced. */
  currentUnitMarketCents?: number | null;
  /** Units of this lot still held (not consumed by rips/decompositions). */
  qtyRemaining?: number;
  onRip?: (lot: EditableLot) => void;
  onOpenBox?: (lot: EditableLot) => void;
};
```

Update the component signature to receive the new props:

```ts
export function LotRow({
  lot,
  catalogItem,
  sourcePack,
  sourceRip,
  sourceContainer,
  sourceDecomposition,
  currentUnitMarketCents,
  qtyRemaining,
  onRip,
  onOpenBox,
}: LotRowProps) {
```

Inside the component, just before `return (`, compute the per-lot P&L:

```ts
const effectiveQtyRemaining = qtyRemaining ?? lot.quantity;
const lotPnL =
  currentUnitMarketCents != null && effectiveQtyRemaining > 0
    ? {
        currentValueCents: currentUnitMarketCents * effectiveQtyRemaining,
        investedRemainingCents: lot.costCents * effectiveQtyRemaining,
        pnlCents: (currentUnitMarketCents - lot.costCents) * effectiveQtyRemaining,
        pnlPct:
          lot.costCents > 0
            ? ((currentUnitMarketCents - lot.costCents) / lot.costCents) * 100
            : null,
      }
    : null;
```

Inside the `<div className="min-w-0 flex-1 space-y-0.5">` block, after the existing `{lot.isGraded && ...}` check and before the closing `</div>`, add:

```tsx
{lotPnL && (
  <div className="mt-1 flex items-center gap-2 text-xs">
    <span className="text-muted-foreground tabular-nums">
      Lot value: {formatCents(lotPnL.currentValueCents)}
    </span>
    <span className="text-muted-foreground">·</span>
    <PnLDisplay pnlCents={lotPnL.pnlCents} pnlPct={lotPnL.pnlPct} />
  </div>
)}
```

- [ ] **Step 4: Type-check + tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: No errors. All passing (LotRow test now passes).

- [ ] **Step 5: Commit Tasks 15 + 16 together**

```bash
git add app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx \
        components/purchases/LotRow.tsx \
        components/purchases/LotRow.test.tsx
git commit -m "feat(holdings): per-lot P&L on detail page + header summary"
```

---

## Task 17: Push to origin and run browser smoke test

**Files:**
- None (verification only).

- [ ] **Step 1: Push the branch so Vercel auto-deploys**

```bash
git push origin main
```

Expected: Pushed; Vercel build starts.

- [ ] **Step 2: Wait for the deploy to land**

Watch `https://vercel.com/...` (or the GitHub Action) until the new commit is live at https://pokestonks.vercel.app.

- [ ] **Step 3: Browser smoke checklist**

Navigate to https://pokestonks.vercel.app and verify:

1. **Dashboard** at `/`:
   - Portfolio card shows 4 stats: Invested, Current value, Unrealized P&L (signed, with %), Realized rip P&L.
   - Caption shows correct counts (`N lots · M priced · K unpriced[ · S stale]`).
   - Performance card appears when at least one priced holding exists.
   - Performance card hides when zero priced holdings.
   - Best/Worst rows link to `/holdings/[id]`.

2. **Holdings grid** at `/holdings`:
   - Each card shows Qty/Invested AND Value/P&L.
   - Cards with `last_market_cents = NULL` show "Unpriced" badge instead of value.
   - Cards with `last_market_at` older than 7 days show a "Stale" pill (clickable to `/catalog/[id]`).

3. **Holding detail** at `/holdings/[id]`:
   - Header shows Qty held, Invested, Current value (with optional Stale pill), Unrealized P&L.
   - Each lot row shows "Lot value: $X · +$Y (+Z%)".
   - Unpriced holdings show the "Unpriced" badge in the header instead of value/P&L.

4. **Hand-check a number:** pick one holding, multiply qty × `last_market_cents`, subtract its `total invested`. Verify the displayed P&L matches.

5. **Edge case — zero priced:** if you have only unpriced holdings, dashboard renders "—" for current value + P&L. Performance card hidden.

- [ ] **Step 4: Final empty-commit marker**

```bash
git commit --allow-empty -m "feat: ship Plan 4 (P&L + Dashboard)"
git push origin main
```

---

## Self-Review (Plan vs Spec)

- **Spec §1 Purpose** — covered by Tasks 6-16 collectively.
- **Spec §2 Non-Goals** — no work added for them; Plan 6/5 references kept.
- **Spec §3 Decisions** — every locked decision implemented:
  - `last_market_cents` as price source → Tasks 6-9.
  - Unpriced excluded → Task 6 (`computeHoldingPnL` returns nulls; portfolio rolls priced-only).
  - Stale 7d threshold → Task 6 (constant + boundary test).
  - Best/worst top 3 each by $ → Task 6 (sort/slice + tie-break test).
  - $ + % display → Task 4 (formatCentsSigned/formatPct), Task 10 (PnLDisplay).
  - Current value semantics → Task 6 (priced-only denominator).
  - Realized rip kept as-is, sign-flipped at boundary → Task 6 + Task 7.
  - Card vs sealed identical → Task 6 doesn't branch on kind.
  - Math in `pnl.ts` server-side → Tasks 6-9.
  - `aggregateHoldings` minimal change → Task 1.
- **Spec §4 Schema** — no migrations; selects updated → Tasks 2-3.
- **Spec §5 pnl.ts** — Task 6 implements every type, math rule, edge case (12 tests).
- **Spec §6.1-6.3 API** — Tasks 7, 8, 9.
- **Spec §7.1-7.6 UI** — Tasks 12 (totals), 13 (performers), 14 (grid), 15 (header), 16 (lot row), shared components Tasks 10-11, formatter consolidation Tasks 4-5.
- **Spec §8 Wire Format** — covered by route + hook updates in Tasks 7-9.
- **Spec §9 Tests** — pnl.test (Task 6), totals route test (Task 7), holdings.test extension (Task 1), PnLDisplay test (Task 10), DashboardTotalsCard test (Task 12), DashboardPerformersCard test (Task 13).
- **Spec §10 Build Order** — followed exactly.
- **Spec §11 Out-of-Scope** — none implemented.

**Type consistency:**

- `HoldingPnL` shape introduced in Task 6 is consumed unchanged in Tasks 8, 9, 10, 13, 14, 15, 16.
- `PortfolioPnL` introduced Task 6, consumed Tasks 7, 12, 13.
- `STALE_PRICE_THRESHOLD_DAYS = 7` exported and asserted in Task 6.
- `formatCents`/`formatCentsSigned`/`formatPct` introduced Task 4, consumed Tasks 5, 10, 12, 14, 15, 16.

**No placeholders. No "similar to Task N" — code is repeated where needed.**
