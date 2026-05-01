# Plan 7 — Pricing Automation + History Implementation Plan

> **STATUS NOTE (2026-04-30 evening, commit f3aea4b):** Spec was revised after T4 smoke discovered TCGCSV has no archive endpoint. Going-forward-only model. Tasks below partially superseded:
> - **T4** rewritten as per-group ProductsAndPrices.csv fetch (not zip).
> - **T9** (lazy backfill) DELETED.
> - **T14** drops `useTriggerBackfill`.
> - **T18** drops backfill polling; empty state copy = "Tracking starts soon. We snapshot daily at 21:00 UTC."
> - **T21** drops the 365-day backfill script; only `vercel.json` remains.
> - Cron schedule: 21:00 UTC (was 06:00).
>
> The implementation prompts the controller dispatches contain the corrected task text. The plan body below is left for historical reference; the spec at `docs/superpowers/specs/2026-04-30-pokestonks-pricing-automation-design.md` is the authoritative source.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace on-demand-only pricing with a daily Vercel Cron that snapshots TCGCSV archive zips into `market_prices`, gives every catalog item a multi-month chart on first view via lazy 90-day backfill, surfaces 7d delta indicators across portfolio surfaces, supports manual override for vending-only SKUs, and adds a refresh-all-held button.

**Architecture:** Daily Vercel Cron (06:00 UTC) downloads one TCGCSV archive zip, bulk upserts `market_prices` rows, updates `catalog_items.last_market_cents` for non-overridden items. Lazy per-item backfill via `waitUntil()` populates 90 days of history when chart first loads. Initial 365-day backfill runs once at deploy via `npm run backfill-prices`. Manual override sets sticky columns on `catalog_items` plus `source='manual'` rows in `market_prices`. UI: custom-SVG `<PriceChart>`, atom `<DeltaPill>`, manual `<ManualPriceBadge>` + `<ManualPricePanel>` + `<SetManualPriceDialog>`, dashboard `<RefreshHeldButton>`.

**Tech Stack:** Next.js 15 App Router (Vercel), TypeScript, Drizzle ORM + Supabase (Postgres), TanStack Query 5, vitest 4 + happy-dom, custom SVG.

**Spec:** `docs/superpowers/specs/2026-04-30-pokestonks-pricing-automation-design.md`

---

## File Structure

**New files:**
- `supabase/migrations/20260430000001_pricing_automation.sql` — schema migration
- `lib/services/tcgcsv-archive.ts` — fetch/parse archive zips, shared by all 4 fetching paths
- `lib/services/tcgcsv-archive.test.ts`
- `lib/services/price-snapshots.ts` — DB upsert + last_market sync
- `lib/services/price-snapshots.test.ts`
- `lib/services/price-deltas.ts` — pure delta computation
- `lib/services/price-deltas.test.ts`
- `app/api/cron/refresh-prices/route.ts` — daily cron entry
- `app/api/cron/refresh-prices/route.test.ts`
- `app/api/prices/refresh-held/route.ts`
- `app/api/prices/refresh-held/route.test.ts`
- `app/api/catalog/[id]/backfill/route.ts`
- `app/api/catalog/[id]/backfill/route.test.ts`
- `app/api/catalog/[id]/history/route.ts`
- `app/api/catalog/[id]/history/route.test.ts`
- `app/api/catalog/[id]/manual-price/route.ts`
- `app/api/catalog/[id]/manual-price/route.test.ts`
- `scripts/backfill-prices.ts` — initial 365-day backfill
- `vercel.json` — cron config
- `lib/query/hooks/usePriceHistory.ts` — combined `useCatalogHistory`, `useTriggerBackfill`
- `lib/query/hooks/usePriceHistory.test.ts`
- `lib/query/hooks/useRefreshHeld.ts`
- `lib/query/hooks/useManualPrice.ts`
- `components/prices/DeltaPill.tsx`
- `components/prices/DeltaPill.test.tsx`
- `components/prices/ManualPriceBadge.tsx`
- `components/prices/ManualPriceBadge.test.tsx`
- `components/prices/ManualPricePanel.tsx`
- `components/prices/ManualPricePanel.test.tsx`
- `components/prices/RefreshHeldButton.tsx`
- `components/prices/RefreshHeldButton.test.tsx`
- `components/prices/SetManualPriceDialog.tsx`
- `components/prices/SetManualPriceDialog.test.tsx`
- `components/charts/PriceChart.tsx`
- `components/charts/PriceChart.test.tsx`

**Modified files:**
- `lib/db/schema/marketPrices.ts` — add `createdAt`
- `lib/db/schema/catalogItems.ts` — add `manualMarketCents`, `manualMarketAt`, `backfillCompletedAt`
- `app/api/holdings/route.ts` — add `delta7dCents`, `delta7dPct`, `manualMarketCents` per row
- `app/api/holdings/[catalogItemId]/route.ts` — same fields on `holding` summary
- `app/api/dashboard/totals/route.ts` — portfolio + per-row delta + manual
- `app/api/search/route.ts` + `app/api/search/refresh/route.ts` — `manualMarketCents` per result
- `package.json` — add `backfill-prices` script
- `components/holdings/HoldingsGrid.tsx` — wire DeltaPill + ManualPriceBadge
- `components/dashboard/DashboardTotalsCard.tsx` — wire DeltaPill + RefreshHeldButton
- `components/dashboard/DashboardPerformersCard.tsx` — wire DeltaPill + ManualPriceBadge
- `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx` — wire DeltaPill + PriceChart launcher + SetManualPriceDialog
- `app/(authenticated)/catalog/[id]/page.tsx` (or its client component) — wire ManualPriceBadge + SetManualPriceDialog launcher

---

## Conventions reminders (from CLAUDE.md + memory)

- Money in **integer cents**. Never floats. Format only at render.
- Dates as ISO `YYYY-MM-DD` strings or `Date` objects. No datetime where time isn't meaningful.
- **No em-dashes** in user-facing copy.
- **NEVER run `drizzle-kit push`.** Schema changes go via SQL migrations applied through Supabase SQL editor; Drizzle TS schema follows the SQL.
- All P&L lives in `lib/services/pnl.ts` already; do not duplicate.
- TanStack Query for all data fetching; no raw `fetch` in components.
- Test infra uses **vitest 4** with `// @vitest-environment happy-dom` directive at the top of component test files.
- The `DrizzleDb` type is exported from `@/lib/db/client`. Service-role-bypassing writes should import `db` from there.
- Run `npm run lint && npm run typecheck && npm test && npm run build` before declaring deploy-ready (memory: build catches Next.js Suspense/prerender bugs that tsc + vitest miss).
- Push to `origin main` regularly during plan execution so Vercel actually deploys.

---

## Task 1: Schema migration + Drizzle updates

**Files:**
- Create: `supabase/migrations/20260430000001_pricing_automation.sql`
- Modify: `lib/db/schema/marketPrices.ts`
- Modify: `lib/db/schema/catalogItems.ts`

- [ ] **Step 1: Write the SQL migration**

Create `supabase/migrations/20260430000001_pricing_automation.sql`:

```sql
-- ============================================================
-- Plan 7 — Pricing automation + history
-- Adds: created_at on market_prices, source CHECK,
-- manual override columns + backfill state on catalog_items.
-- ============================================================

-- 1. created_at on market_prices for telemetry
ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. CHECK constraint on source ('tcgcsv' | 'manual')
ALTER TABLE market_prices
  DROP CONSTRAINT IF EXISTS market_prices_source_check;
ALTER TABLE market_prices
  ADD CONSTRAINT market_prices_source_check
  CHECK (source IN ('tcgcsv', 'manual'));

-- 3. snapshot_date DESC index for chart range queries
CREATE INDEX IF NOT EXISTS market_prices_catalog_date_desc_idx
  ON market_prices (catalog_item_id, snapshot_date DESC);

-- 4. Manual override columns on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS manual_market_cents INTEGER,
  ADD COLUMN IF NOT EXISTS manual_market_at TIMESTAMPTZ;

-- 5. Backfill state on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS backfill_completed_at TIMESTAMPTZ;
```

- [ ] **Step 2: Update Drizzle schema for marketPrices**

Modify `lib/db/schema/marketPrices.ts` to add `createdAt`:

```typescript
import { pgTable, bigserial, bigint, date, integer, text, unique, index, timestamp } from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqSnapshot: unique('market_prices_uniq_snapshot').on(
      t.catalogItemId,
      t.snapshotDate,
      t.condition,
      t.source
    ),
    catalogDateIdx: index('market_prices_catalog_date_idx').on(t.catalogItemId, t.snapshotDate),
    catalogDateDescIdx: index('market_prices_catalog_date_desc_idx').on(
      t.catalogItemId,
      t.snapshotDate.desc()
    ),
  })
);

export type MarketPrice = typeof marketPrices.$inferSelect;
export type NewMarketPrice = typeof marketPrices.$inferInsert;
```

- [ ] **Step 3: Update Drizzle schema for catalogItems**

Modify `lib/db/schema/catalogItems.ts` to add three columns. Insert these three lines after the existing `lastMarketAt` line (around line 26):

```typescript
    manualMarketCents: integer('manual_market_cents'),
    manualMarketAt: timestamp('manual_market_at', { withTimezone: true }),
    backfillCompletedAt: timestamp('backfill_completed_at', { withTimezone: true }),
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: no errors. The new columns are typed as `number | null` and `Date | null` respectively.

- [ ] **Step 5: Apply the SQL migration manually**

This is a manual step the implementer must do via Supabase SQL editor:
1. Open https://app.supabase.com → project → SQL Editor
2. Paste the contents of `supabase/migrations/20260430000001_pricing_automation.sql`
3. Run; expect no errors
4. Verify in Table Editor that `market_prices` has `created_at` and `catalog_items` has `manual_market_cents`, `manual_market_at`, `backfill_completed_at`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260430000001_pricing_automation.sql lib/db/schema/marketPrices.ts lib/db/schema/catalogItems.ts
git commit -m "feat(plan-7): schema for market_prices.created_at + catalog_items manual override + backfill state"
git push origin main
```

---

## Task 2: Pure CSV row parser (`lib/services/tcgcsv-archive.ts` — parsing layer only)

This task adds the parsing layer with no HTTP/DB. Tests use static CSV strings. HTTP fetch is added in Task 4.

**Files:**
- Create: `lib/services/tcgcsv-archive.ts`
- Test: `lib/services/tcgcsv-archive.test.ts`

- [ ] **Step 1: Write failing tests for `parseArchiveCsv`**

Create `lib/services/tcgcsv-archive.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseArchiveCsv, type ArchivePriceRow } from './tcgcsv-archive';

describe('parseArchiveCsv', () => {
  it('returns a Map keyed by tcgplayer_product_id with parsed cents', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      '12345,4.25,4.10,4.40,Normal',
      '67890,99.99,95.00,110.50,',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.size).toBe(2);
    expect(result.get(12345)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 12345,
      marketPriceCents: 425,
      lowPriceCents: 410,
      highPriceCents: 440,
      subTypeName: 'Normal',
    });
    expect(result.get(67890)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 67890,
      marketPriceCents: 9999,
      lowPriceCents: 9500,
      highPriceCents: 11050,
      subTypeName: null,
    });
  });

  it('skips rows with non-numeric productId', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      'abc,4.25,4.10,4.40,Normal',
      '12345,4.25,4.10,4.40,Normal',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.size).toBe(1);
    expect(result.has(12345)).toBe(true);
  });

  it('preserves null prices when columns are blank or non-numeric', () => {
    const csv = [
      'productId,marketPrice,lowPrice,highPrice,subTypeName',
      '12345,,4.10,,Normal',
    ].join('\n');
    const result = parseArchiveCsv(csv);
    expect(result.get(12345)).toEqual<ArchivePriceRow>({
      tcgplayerProductId: 12345,
      marketPriceCents: null,
      lowPriceCents: 410,
      highPriceCents: null,
      subTypeName: 'Normal',
    });
  });

  it('handles BOM and trailing whitespace', () => {
    const csv = '﻿productId,marketPrice,lowPrice,highPrice,subTypeName\r\n12345,4.25,4.10,4.40,Normal\r\n';
    const result = parseArchiveCsv(csv);
    expect(result.get(12345)?.marketPriceCents).toBe(425);
  });

  it('returns empty Map for empty CSV', () => {
    expect(parseArchiveCsv('').size).toBe(0);
    expect(parseArchiveCsv('productId,marketPrice,lowPrice,highPrice,subTypeName\n').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/tcgcsv-archive.test.ts`
Expected: FAIL with "Cannot find module" for `./tcgcsv-archive`.

- [ ] **Step 3: Implement `parseArchiveCsv`**

Create `lib/services/tcgcsv-archive.ts`:

```typescript
export type ArchivePriceRow = {
  tcgplayerProductId: number;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  highPriceCents: number | null;
  subTypeName: string | null;
};

function dollarsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function parseArchiveCsv(csv: string): Map<number, ArchivePriceRow> {
  const result = new Map<number, ArchivePriceRow>();
  if (!csv) return result;

  // Strip BOM if present
  const normalized = csv.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) return result;

  const header = lines[0].split(',').map((h) => h.trim());
  const idx = {
    productId: header.indexOf('productId'),
    marketPrice: header.indexOf('marketPrice'),
    lowPrice: header.indexOf('lowPrice'),
    highPrice: header.indexOf('highPrice'),
    subTypeName: header.indexOf('subTypeName'),
  };

  if (idx.productId < 0) return result;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const productIdRaw = cols[idx.productId]?.trim();
    if (!productIdRaw) continue;
    const productId = Number(productIdRaw);
    if (!Number.isFinite(productId) || !Number.isInteger(productId)) continue;

    result.set(productId, {
      tcgplayerProductId: productId,
      marketPriceCents: idx.marketPrice >= 0 ? dollarsToCents(cols[idx.marketPrice] ?? '') : null,
      lowPriceCents: idx.lowPrice >= 0 ? dollarsToCents(cols[idx.lowPrice] ?? '') : null,
      highPriceCents: idx.highPrice >= 0 ? dollarsToCents(cols[idx.highPrice] ?? '') : null,
      subTypeName: idx.subTypeName >= 0 ? (cols[idx.subTypeName]?.trim() || null) : null,
    });
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/tcgcsv-archive.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/tcgcsv-archive.ts lib/services/tcgcsv-archive.test.ts
git commit -m "feat(plan-7): tcgcsv-archive CSV parser (parsing layer only)"
git push origin main
```

---

## Task 3: Pure delta computation service

**Files:**
- Create: `lib/services/price-deltas.ts`
- Test: `lib/services/price-deltas.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/services/price-deltas.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeDeltas, type DeltaInput } from './price-deltas';

describe('computeDeltas', () => {
  it('returns null delta for items with no "then" point', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1000, thenCents: null },
    ];
    const result = computeDeltas(inputs);
    expect(result.get(1)).toEqual({ deltaCents: null, deltaPct: null });
  });

  it('computes positive delta with cents and pct', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1100, thenCents: 1000 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: 100, deltaPct: 10 });
  });

  it('computes negative delta', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 900, thenCents: 1000 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: -100, deltaPct: -10 });
  });

  it('returns deltaPct null when thenCents is zero (avoids divide-by-zero)', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 500, thenCents: 0 },
    ];
    expect(computeDeltas(inputs).get(1)).toEqual({ deltaCents: 500, deltaPct: null });
  });

  it('handles multiple items independently', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1100, thenCents: 1000 },
      { catalogItemId: 2, nowCents: 200, thenCents: null },
      { catalogItemId: 3, nowCents: 800, thenCents: 1000 },
    ];
    const result = computeDeltas(inputs);
    expect(result.get(1)).toEqual({ deltaCents: 100, deltaPct: 10 });
    expect(result.get(2)).toEqual({ deltaCents: null, deltaPct: null });
    expect(result.get(3)).toEqual({ deltaCents: -200, deltaPct: -20 });
  });

  it('rounds deltaPct to 2 decimal places', () => {
    const inputs: DeltaInput[] = [
      { catalogItemId: 1, nowCents: 1234, thenCents: 1111 },
    ];
    const out = computeDeltas(inputs).get(1);
    expect(out?.deltaCents).toBe(123);
    expect(out?.deltaPct).toBeCloseTo(11.07, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/services/price-deltas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `computeDeltas`**

Create `lib/services/price-deltas.ts`:

```typescript
export type DeltaInput = {
  catalogItemId: number;
  nowCents: number | null;
  thenCents: number | null;
};

export type DeltaOutput = {
  deltaCents: number | null;
  deltaPct: number | null;
};

export function computeDeltas(inputs: DeltaInput[]): Map<number, DeltaOutput> {
  const result = new Map<number, DeltaOutput>();
  for (const { catalogItemId, nowCents, thenCents } of inputs) {
    if (nowCents == null || thenCents == null) {
      result.set(catalogItemId, { deltaCents: null, deltaPct: null });
      continue;
    }
    const deltaCents = nowCents - thenCents;
    if (thenCents === 0) {
      result.set(catalogItemId, { deltaCents, deltaPct: null });
      continue;
    }
    const deltaPct = Math.round(((deltaCents / thenCents) * 100) * 100) / 100;
    result.set(catalogItemId, { deltaCents, deltaPct });
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/price-deltas.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/price-deltas.ts lib/services/price-deltas.test.ts
git commit -m "feat(plan-7): pure delta computation service"
git push origin main
```

---

## Task 4: HTTP fetch + zip extraction in `tcgcsv-archive.ts`

Adds `fetchArchiveSnapshot(date)` on top of the parser from Task 2.

**Files:**
- Modify: `lib/services/tcgcsv-archive.ts`
- Modify: `lib/services/tcgcsv-archive.test.ts`
- Modify: `package.json` (add `jszip` if not present)

- [ ] **Step 1: Verify or install `jszip`**

Run: `npm ls jszip`
If missing: `npm install jszip` and `npm install -D @types/jszip` (jszip ships its own types in newer versions; if so skip the dev dep).

- [ ] **Step 2: Write failing test for `fetchArchiveSnapshot`**

Append to `lib/services/tcgcsv-archive.test.ts`:

```typescript
import { fetchArchiveSnapshot } from './tcgcsv-archive';

describe('fetchArchiveSnapshot', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('throws on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchArchiveSnapshot(new Date('2026-04-29'))).rejects.toThrow(/404/);
  });

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(fetchArchiveSnapshot(new Date('2026-04-29'))).rejects.toThrow(/archive/);
  });

  it('formats the date as YYYY-MM-DD in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    global.fetch = fetchMock;
    await fetchArchiveSnapshot(new Date('2026-04-29T15:00:00Z')).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('2026-04-29'),
      expect.any(Object)
    );
  });
});
```

(Add `import { vi, afterEach } from 'vitest';` at the top of the file alongside the existing imports.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/services/tcgcsv-archive.test.ts`
Expected: FAIL — `fetchArchiveSnapshot` not exported.

- [ ] **Step 4: Implement `fetchArchiveSnapshot`**

Append to `lib/services/tcgcsv-archive.ts`:

```typescript
import JSZip from 'jszip';

const TCGCSV_ARCHIVE_BASE = 'https://tcgcsv.com/archive/tcgcsv';
const POKEMON_CATEGORY_IDS = [3, 50] as const;

function formatYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type ArchiveSnapshot = {
  date: string;
  prices: Map<number, ArchivePriceRow>;
};

export async function fetchArchiveSnapshot(date: Date): Promise<ArchiveSnapshot> {
  const ymd = formatYmd(date);
  const url = `${TCGCSV_ARCHIVE_BASE}/prices-${ymd}.zip`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`tcgcsv archive fetch failed for ${ymd}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);

  const prices = new Map<number, ArchivePriceRow>();
  for (const categoryId of POKEMON_CATEGORY_IDS) {
    const entries = Object.values(zip.files).filter(
      (f) => !f.dir && f.name.includes(`/${categoryId}/`) && f.name.endsWith('prices.csv')
    );
    for (const entry of entries) {
      const csv = await entry.async('string');
      const parsed = parseArchiveCsv(csv);
      for (const [k, v] of parsed) prices.set(k, v);
    }
  }

  return { date: ymd, prices };
}
```

**Note on URL shape:** TCGCSV's archive URL pattern as of 2026 is `https://tcgcsv.com/archive/tcgcsv/prices-YYYY-MM-DD.zip` containing `tcgcsv/{categoryId}/{groupId}/prices.csv` entries. If the implementer finds a different shape on their first manual fetch (`curl https://tcgcsv.com/archive/tcgcsv/prices-2026-04-29.zip -I`), adjust both the URL template and the file-filter accordingly. Update the test that asserts URL contents to match.

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/services/tcgcsv-archive.test.ts`
Expected: PASS, 8 tests total.

- [ ] **Step 6: Manual smoke test**

Run a small one-off script to verify the live archive endpoint works (this is for the implementer's confidence; not committed):

```bash
node -e "
import('./lib/services/tcgcsv-archive.js').then(async ({ fetchArchiveSnapshot }) => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snap = await fetchArchiveSnapshot(yesterday);
  console.log('date:', snap.date, 'rows:', snap.prices.size);
  const sample = Array.from(snap.prices.entries()).slice(0, 3);
  console.log(sample);
});
"
```

Expected: prints the date and a non-zero row count, with a few sample entries showing real prices. If row count is 0, the URL/file-filter is wrong; adjust per the note in step 4 and re-test.

- [ ] **Step 7: Commit**

```bash
git add lib/services/tcgcsv-archive.ts lib/services/tcgcsv-archive.test.ts package.json package-lock.json
git commit -m "feat(plan-7): tcgcsv-archive zip fetch + multi-category CSV merge"
git push origin main
```

---

## Task 5: DB-writes service `lib/services/price-snapshots.ts`

**Files:**
- Create: `lib/services/price-snapshots.ts`
- Test: `lib/services/price-snapshots.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/services/price-snapshots.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ArchivePriceRow } from './tcgcsv-archive';
import { persistSnapshot } from './price-snapshots';

// Minimal in-memory db mock — we test the SQL shape, not real Postgres
type FakeDb = {
  insertedRows: Array<Record<string, unknown>>;
  conflictUpdates: Array<Record<string, unknown>>;
  catalogUpdates: Array<{ id: number; lastMarketCents: number; lastMarketAt: Date }>;
  manualSkippedIds: number[];
};

function buildFakeDb(catalogItems: Array<{ id: number; tcgplayerProductId: number; manualMarketCents: number | null }>): {
  fake: FakeDb;
  drizzleHandle: any;
} {
  const fake: FakeDb = {
    insertedRows: [],
    conflictUpdates: [],
    catalogUpdates: [],
    manualSkippedIds: [],
  };
  const drizzleHandle = {
    // Replace with the actual interface persistSnapshot expects.
    // The implementer should pass a real Drizzle handle; this fake mirrors only the methods used.
    __isFake: true,
    catalog: catalogItems,
    fake,
  };
  return { fake, drizzleHandle };
}

// Implementer note: these tests illustrate intent. The actual implementation
// should accept a Drizzle handle and these tests should be rewritten against
// vitest mocks of `db.insert(...).values(...).onConflictDoUpdate(...)`.
// For Plan 7 we keep the test as a contract describing required behavior:

describe('persistSnapshot', () => {
  const today = '2026-04-30';
  const prices = new Map<number, ArchivePriceRow>([
    [101, { tcgplayerProductId: 101, marketPriceCents: 4250, lowPriceCents: 4100, highPriceCents: 4400, subTypeName: null }],
    [202, { tcgplayerProductId: 202, marketPriceCents: 9999, lowPriceCents: 9500, highPriceCents: 11050, subTypeName: null }],
  ]);

  it('inserts one market_prices row per matched catalog item', async () => {
    // Implemented against mocked db; full version uses vi.spyOn(db, 'insert')
    // to assert the values passed include catalogItemId 1 and 2 with today's date.
    expect(true).toBe(true);
  });

  it('skips items not present in the prices Map', async () => {
    expect(true).toBe(true);
  });

  it('ON CONFLICT DO UPDATE upserts when a row exists for same (catalog_item_id, snapshot_date, condition, source)', async () => {
    expect(true).toBe(true);
  });

  it('does NOT update last_market_cents when manual_market_cents is non-null', async () => {
    expect(true).toBe(true);
  });

  it('updates last_market_cents + last_market_at when manual_market_cents is null', async () => {
    expect(true).toBe(true);
  });

  it('returns rowsWritten count from successful upserts', async () => {
    expect(true).toBe(true);
  });
});
```

**Implementer note:** the placeholders above are the contract. Replace each with a real test against `vi.mock('@/lib/db/client')` once the implementation exists. The test file in this plan is a scaffold; the implementer wires real assertions in step 4 below.

- [ ] **Step 2: Implement `persistSnapshot` and `snapshotForItems`**

Create `lib/services/price-snapshots.ts`:

```typescript
import 'server-only';
import { db, schema } from '@/lib/db/client';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { ArchivePriceRow } from './tcgcsv-archive';

export type PersistOptions = {
  source: 'tcgcsv' | 'manual';
  updateLastMarket: boolean;
};

export type PersistResult = {
  rowsWritten: number;
  itemsUpdated: number;
  itemsSkippedManual: number;
};

export async function persistSnapshot(
  date: string,
  prices: Map<number, ArchivePriceRow>,
  catalogItems: Array<{ id: number; tcgplayerProductId: number | null; manualMarketCents: number | null }>,
  options: PersistOptions
): Promise<PersistResult> {
  let rowsWritten = 0;
  let itemsUpdated = 0;
  let itemsSkippedManual = 0;

  const valuesToInsert: Array<typeof schema.marketPrices.$inferInsert> = [];
  const idsToUpdateLastMarket: Array<{ id: number; cents: number }> = [];

  for (const item of catalogItems) {
    if (item.tcgplayerProductId == null) continue;
    const row = prices.get(item.tcgplayerProductId);
    if (!row) continue;

    valuesToInsert.push({
      catalogItemId: item.id,
      snapshotDate: date,
      condition: null,
      marketPriceCents: row.marketPriceCents,
      lowPriceCents: row.lowPriceCents,
      highPriceCents: row.highPriceCents,
      source: options.source,
    });

    if (options.updateLastMarket && row.marketPriceCents != null) {
      if (item.manualMarketCents != null) {
        itemsSkippedManual++;
      } else {
        idsToUpdateLastMarket.push({ id: item.id, cents: row.marketPriceCents });
      }
    }
  }

  if (valuesToInsert.length > 0) {
    const inserted = await db
      .insert(schema.marketPrices)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: [
          schema.marketPrices.catalogItemId,
          schema.marketPrices.snapshotDate,
          schema.marketPrices.condition,
          schema.marketPrices.source,
        ],
        set: {
          marketPriceCents: schema.marketPrices.marketPriceCents,
          lowPriceCents: schema.marketPrices.lowPriceCents,
          highPriceCents: schema.marketPrices.highPriceCents,
        },
      })
      .returning({ id: schema.marketPrices.id });
    rowsWritten = inserted.length;
  }

  for (const { id, cents } of idsToUpdateLastMarket) {
    await db
      .update(schema.catalogItems)
      .set({ lastMarketCents: cents, lastMarketAt: new Date() })
      .where(and(eq(schema.catalogItems.id, id), isNull(schema.catalogItems.manualMarketCents)));
    itemsUpdated++;
  }

  return { rowsWritten, itemsUpdated, itemsSkippedManual };
}

export type SnapshotResult = PersistResult & { date: string };

export async function snapshotForItems(
  catalogItemIds: number[],
  options?: { date?: Date }
): Promise<SnapshotResult> {
  if (catalogItemIds.length === 0) {
    return { rowsWritten: 0, itemsUpdated: 0, itemsSkippedManual: 0, date: '' };
  }
  const targetDate = options?.date ?? new Date();
  // dynamic import to avoid pulling jszip into edge bundles that don't need it
  const { fetchArchiveSnapshot } = await import('./tcgcsv-archive');
  const snap = await fetchArchiveSnapshot(targetDate);

  const items = await db.query.catalogItems.findMany({
    where: inArray(schema.catalogItems.id, catalogItemIds),
    columns: { id: true, tcgplayerProductId: true, manualMarketCents: true },
  });

  const result = await persistSnapshot(snap.date, snap.prices, items, {
    source: 'tcgcsv',
    updateLastMarket: true,
  });

  return { ...result, date: snap.date };
}
```

- [ ] **Step 3: Rewrite the test file with real Drizzle mocks**

Rewrite `lib/services/price-snapshots.test.ts` to mock `@/lib/db/client`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock('@/lib/db/client', () => ({
  db: { insert: mockInsert, update: mockUpdate, query: { catalogItems: { findMany: vi.fn() } } },
  schema: {
    marketPrices: {
      catalogItemId: 'cat',
      snapshotDate: 'date',
      condition: 'cond',
      source: 'src',
      marketPriceCents: 'mkt',
      lowPriceCents: 'low',
      highPriceCents: 'high',
    },
    catalogItems: { id: 'id', manualMarketCents: 'manual' },
  },
}));

import type { ArchivePriceRow } from './tcgcsv-archive';
import { persistSnapshot } from './price-snapshots';

describe('persistSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    mockUpdateWhere.mockResolvedValue(undefined);
  });

  const sample: Map<number, ArchivePriceRow> = new Map([
    [101, { tcgplayerProductId: 101, marketPriceCents: 4250, lowPriceCents: 4100, highPriceCents: 4400, subTypeName: null }],
    [202, { tcgplayerProductId: 202, marketPriceCents: 9999, lowPriceCents: 9500, highPriceCents: 11050, subTypeName: null }],
  ]);

  it('inserts one row per matched catalog item with source tcgcsv', async () => {
    const items = [
      { id: 1, tcgplayerProductId: 101, manualMarketCents: null },
      { id: 2, tcgplayerProductId: 202, manualMarketCents: null },
    ];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockValues).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ catalogItemId: 1, marketPriceCents: 4250, source: 'tcgcsv' }),
      expect.objectContaining({ catalogItemId: 2, marketPriceCents: 9999, source: 'tcgcsv' }),
    ]));
    expect(result.rowsWritten).toBe(2);
  });

  it('skips items not in the prices Map', async () => {
    const items = [
      { id: 1, tcgplayerProductId: 999, manualMarketCents: null },
    ];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result.rowsWritten).toBe(0);
  });

  it('does NOT update last_market_cents when manual_market_cents is set', async () => {
    const items = [
      { id: 1, tcgplayerProductId: 101, manualMarketCents: 5000 },
    ];
    const result = await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.itemsSkippedManual).toBe(1);
    expect(result.itemsUpdated).toBe(0);
  });

  it('updates last_market_cents when manual is null', async () => {
    const items = [
      { id: 1, tcgplayerProductId: 101, manualMarketCents: null },
    ];
    await persistSnapshot('2026-04-30', sample, items, { source: 'tcgcsv', updateLastMarket: true });
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ lastMarketCents: 4250 }));
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/services/price-snapshots.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/services/price-snapshots.ts lib/services/price-snapshots.test.ts
git commit -m "feat(plan-7): price-snapshots persist + snapshotForItems"
git push origin main
```

---

## Task 6: Daily cron route `/api/cron/refresh-prices`

**Files:**
- Create: `app/api/cron/refresh-prices/route.ts`
- Test: `app/api/cron/refresh-prices/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/cron/refresh-prices/route.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/services/price-snapshots', () => ({
  snapshotForItems: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { catalogItems: { findMany: vi.fn() } },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 999 }]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
  schema: { catalogItems: { id: 'id', tcgplayerProductId: 'tpid' }, refreshRuns: { id: 'rid' } },
}));

import * as snapshotsModule from '@/lib/services/price-snapshots';
import * as dbModule from '@/lib/db/client';

describe('GET /api/cron/refresh-prices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
  });

  function makeReq(authHeader: string | null) {
    return new Request('https://example.com/api/cron/refresh-prices', {
      headers: authHeader ? { authorization: authHeader } : {},
    });
  }

  it('returns 401 without correct CRON_SECRET', async () => {
    const res = await GET(makeReq('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 401 with no auth header', async () => {
    const res = await GET(makeReq(null));
    expect(res.status).toBe(401);
  });

  it('happy path: returns 200 with snapshot stats', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    vi.mocked(snapshotsModule.snapshotForItems).mockResolvedValue({
      date: '2026-04-30',
      rowsWritten: 2,
      itemsUpdated: 2,
      itemsSkippedManual: 0,
    });
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshotsWritten).toBe(2);
  });

  it('returns 502 on TCGCSV outage', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findMany).mockResolvedValue([{ id: 1 }] as any);
    vi.mocked(snapshotsModule.snapshotForItems).mockRejectedValue(new Error('archive 404'));
    const res = await GET(makeReq('Bearer test-secret'));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cron/refresh-prices/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/cron/refresh-prices/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { snapshotForItems } from '@/lib/services/price-snapshots';
import { eq } from 'drizzle-orm';

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = new Date();
  const [run] = await db
    .insert(schema.refreshRuns)
    .values({ startedAt, status: 'running' })
    .returning({ id: schema.refreshRuns.id });

  try {
    const items = await db.query.catalogItems.findMany({
      columns: { id: true, tcgplayerProductId: true },
    });
    const ids = items.filter((i) => i.tcgplayerProductId != null).map((i) => i.id);
    const result = await snapshotForItems(ids);

    await db
      .update(schema.refreshRuns)
      .set({
        finishedAt: new Date(),
        status: 'ok',
        totalItems: ids.length,
        succeeded: result.rowsWritten,
        failed: ids.length - result.rowsWritten,
      })
      .where(eq(schema.refreshRuns.id, run.id));

    return NextResponse.json({
      snapshotsWritten: result.rowsWritten,
      itemsUpdated: result.itemsUpdated,
      itemsSkippedManual: result.itemsSkippedManual,
      durationMs: Date.now() - startedAt.getTime(),
      date: result.date,
    });
  } catch (err) {
    await db
      .update(schema.refreshRuns)
      .set({
        finishedAt: new Date(),
        status: 'failed',
        errorsJson: { message: err instanceof Error ? err.message : String(err) } as any,
      })
      .where(eq(schema.refreshRuns.id, run.id));
    return new NextResponse(`refresh-prices failed: ${err instanceof Error ? err.message : 'unknown'}`, {
      status: 502,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/cron/refresh-prices/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/refresh-prices
git commit -m "feat(plan-7): /api/cron/refresh-prices daily snapshot route"
git push origin main
```

---

## Task 7: History route `/api/catalog/[id]/history`

**Files:**
- Create: `app/api/catalog/[id]/history/route.ts`
- Test: `app/api/catalog/[id]/history/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/catalog/[id]/history/route.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: { findFirst: vi.fn() },
      marketPrices: { findMany: vi.fn() },
    },
  },
  schema: {
    catalogItems: { id: 'id' },
    marketPrices: { catalogItemId: 'cat', snapshotDate: 'date', source: 'src' },
  },
}));

import * as dbModule from '@/lib/db/client';

describe('GET /api/catalog/[id]/history', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeReq(range: string) {
    return new Request(`https://example.com/api/catalog/1/history?range=${range}`);
  }
  const ctx = { params: Promise.resolve({ id: '1' }) };

  it('returns 404 when catalog item does not exist', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue(undefined);
    const res = await GET(makeReq('3M'), ctx);
    expect(res.status).toBe(404);
  });

  it('returns points filtered by range', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({
      id: 1,
      manualMarketCents: null,
      manualMarketAt: null,
      backfillCompletedAt: new Date(),
    } as any);
    vi.mocked(dbModule.db.query.marketPrices.findMany).mockResolvedValue([
      { snapshotDate: '2026-02-01', marketPriceCents: 1000, lowPriceCents: 950, highPriceCents: 1050, source: 'tcgcsv' },
      { snapshotDate: '2026-04-30', marketPriceCents: 1100, lowPriceCents: 1050, highPriceCents: 1150, source: 'tcgcsv' },
    ] as any);
    const res = await GET(makeReq('3M'), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe('3M');
    expect(body.points).toHaveLength(2);
    expect(body.points[0]).toMatchObject({ date: '2026-02-01', marketPriceCents: 1000 });
  });

  it('reports backfillState=pending when backfill_completed_at is null', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({
      id: 1, manualMarketCents: null, manualMarketAt: null, backfillCompletedAt: null,
    } as any);
    vi.mocked(dbModule.db.query.marketPrices.findMany).mockResolvedValue([] as any);
    const res = await GET(makeReq('3M'), ctx);
    const body = await res.json();
    expect(body.backfillState).toBe('pending');
  });

  it('returns manualOverride when set', async () => {
    const setAt = new Date('2026-04-15T12:00:00Z');
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({
      id: 1, manualMarketCents: 5000, manualMarketAt: setAt, backfillCompletedAt: setAt,
    } as any);
    vi.mocked(dbModule.db.query.marketPrices.findMany).mockResolvedValue([] as any);
    const res = await GET(makeReq('MAX'), ctx);
    const body = await res.json();
    expect(body.manualOverride).toEqual({ cents: 5000, setAt: setAt.toISOString() });
  });
});
```

- [ ] **Step 2: Implement the route**

Create `app/api/catalog/[id]/history/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { and, eq, gte } from 'drizzle-orm';

const RANGE_DAYS: Record<string, number | null> = {
  '1M': 31,
  '3M': 92,
  '6M': 183,
  '12M': 366,
  MAX: null,
};

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const catalogItemId = Number(id);
  if (!Number.isFinite(catalogItemId)) {
    return new NextResponse('Bad id', { status: 400 });
  }

  const rangeKey = new URL(req.url).searchParams.get('range') ?? '3M';
  if (!(rangeKey in RANGE_DAYS)) {
    return new NextResponse(`Unknown range: ${rangeKey}`, { status: 400 });
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true, manualMarketCents: true, manualMarketAt: true, backfillCompletedAt: true },
  });
  if (!item) return new NextResponse('Not found', { status: 404 });

  const days = RANGE_DAYS[rangeKey];
  let where = eq(schema.marketPrices.catalogItemId, catalogItemId);
  if (days != null) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    where = and(where, gte(schema.marketPrices.snapshotDate, cutoff))!;
  }

  const rows = await db.query.marketPrices.findMany({
    where,
    columns: {
      snapshotDate: true,
      marketPriceCents: true,
      lowPriceCents: true,
      highPriceCents: true,
      source: true,
    },
    orderBy: (mp, { asc }) => [asc(mp.snapshotDate)],
  });

  const points = rows.map((r) => ({
    date: r.snapshotDate,
    marketPriceCents: r.marketPriceCents,
    lowPriceCents: r.lowPriceCents,
    highPriceCents: r.highPriceCents,
    source: r.source,
  }));

  const backfillState: 'pending' | 'completed' | 'not-needed' =
    item.backfillCompletedAt != null ? 'completed' : (points.length === 0 ? 'pending' : 'pending');

  const manualOverride =
    item.manualMarketCents != null && item.manualMarketAt != null
      ? { cents: item.manualMarketCents, setAt: item.manualMarketAt.toISOString() }
      : null;

  return NextResponse.json({ range: rangeKey, points, backfillState, manualOverride });
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/catalog/[id]/history/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add app/api/catalog/[id]/history
git commit -m "feat(plan-7): /api/catalog/[id]/history route with range + manual override"
git push origin main
```

---

## Task 8: Manual price route `/api/catalog/[id]/manual-price` (POST + DELETE)

**Files:**
- Create: `app/api/catalog/[id]/manual-price/route.ts`
- Test: `app/api/catalog/[id]/manual-price/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/catalog/[id]/manual-price/route.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST, DELETE } from './route';

vi.mock('@/lib/auth/getServerUser', () => ({
  getServerUser: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    transaction: vi.fn(),
    query: { catalogItems: { findFirst: vi.fn() } },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
  },
  schema: {
    catalogItems: { id: 'id', manualMarketCents: 'mmc', manualMarketAt: 'mma' },
    marketPrices: {},
  },
}));

import * as authModule from '@/lib/auth/getServerUser';
import * as dbModule from '@/lib/db/client';

describe('POST /api/catalog/[id]/manual-price', () => {
  const ctx = { params: Promise.resolve({ id: '1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.getServerUser).mockResolvedValue({ id: 'user-1' } as any);
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({ id: 1 } as any);
  });

  it('rejects non-authenticated request with 401', async () => {
    vi.mocked(authModule.getServerUser).mockResolvedValue(null);
    const req = new Request('https://example.com/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 5000 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it('rejects negative or non-integer prices with 400', async () => {
    const req = new Request('https://example.com/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: -100 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it('happy path: returns manual cents + setAt', async () => {
    const req = new Request('https://example.com/api/catalog/1/manual-price', {
      method: 'POST',
      body: JSON.stringify({ manualMarketCents: 5000 }),
    });
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manualMarketCents).toBe(5000);
    expect(body.manualMarketAt).toEqual(expect.any(String));
  });
});

describe('DELETE /api/catalog/[id]/manual-price', () => {
  const ctx = { params: Promise.resolve({ id: '1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.getServerUser).mockResolvedValue({ id: 'user-1' } as any);
  });

  it('clears columns and returns { cleared: true }', async () => {
    const res = await DELETE(new Request('https://example.com/api/catalog/1/manual-price', { method: 'DELETE' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cleared).toBe(true);
    expect(dbModule.db.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement the route**

Create `app/api/catalog/[id]/manual-price/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { getServerUser } from '@/lib/auth/getServerUser';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await getServerUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = Number(id);
  if (!Number.isFinite(catalogItemId)) return new NextResponse('Bad id', { status: 400 });

  let body: { manualMarketCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  const cents = body.manualMarketCents;
  if (typeof cents !== 'number' || !Number.isInteger(cents) || cents < 0 || cents > 100_000_00) {
    return new NextResponse('manualMarketCents must be an integer between 0 and 10000000', { status: 400 });
  }

  const exists = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true },
  });
  if (!exists) return new NextResponse('Not found', { status: 404 });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  await db
    .update(schema.catalogItems)
    .set({ manualMarketCents: cents, manualMarketAt: now })
    .where(eq(schema.catalogItems.id, catalogItemId));

  await db
    .insert(schema.marketPrices)
    .values({
      catalogItemId,
      snapshotDate: today,
      condition: null,
      marketPriceCents: cents,
      lowPriceCents: cents,
      highPriceCents: cents,
      source: 'manual',
    })
    .onConflictDoUpdate({
      target: [
        schema.marketPrices.catalogItemId,
        schema.marketPrices.snapshotDate,
        schema.marketPrices.condition,
        schema.marketPrices.source,
      ],
      set: {
        marketPriceCents: cents,
        lowPriceCents: cents,
        highPriceCents: cents,
      },
    });

  return NextResponse.json({ manualMarketCents: cents, manualMarketAt: now.toISOString() });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getServerUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = Number(id);
  if (!Number.isFinite(catalogItemId)) return new NextResponse('Bad id', { status: 400 });

  await db
    .update(schema.catalogItems)
    .set({ manualMarketCents: null, manualMarketAt: null })
    .where(eq(schema.catalogItems.id, catalogItemId));

  return NextResponse.json({ cleared: true });
}
```

**If `@/lib/auth/getServerUser` doesn't exist:** find the existing auth helper used by other routes (e.g., `app/api/purchases/route.ts`) and follow the same pattern. Update the import accordingly.

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/catalog/[id]/manual-price/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Commit**

```bash
git add app/api/catalog/[id]/manual-price
git commit -m "feat(plan-7): /api/catalog/[id]/manual-price POST + DELETE"
git push origin main
```

---

## Task 9: Lazy backfill route `/api/catalog/[id]/backfill`

**Files:**
- Create: `app/api/catalog/[id]/backfill/route.ts`
- Test: `app/api/catalog/[id]/backfill/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/catalog/[id]/backfill/route.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/auth/getServerUser', () => ({ getServerUser: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  db: { query: { catalogItems: { findFirst: vi.fn() } } },
  schema: { catalogItems: { id: 'id' } },
}));
vi.mock('@/lib/services/price-backfill', () => ({
  enqueueBackfill: vi.fn().mockResolvedValue(undefined),
}));

const waitUntilSpy = vi.fn();
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: (fn: () => Promise<void>) => waitUntilSpy(fn),
  };
});

import * as authModule from '@/lib/auth/getServerUser';
import * as dbModule from '@/lib/db/client';

describe('POST /api/catalog/[id]/backfill', () => {
  const ctx = { params: Promise.resolve({ id: '1' }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.getServerUser).mockResolvedValue({ id: 'user-1' } as any);
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(authModule.getServerUser).mockResolvedValue(null);
    const res = await POST(new Request('http://x/api/catalog/1/backfill', { method: 'POST' }), ctx);
    expect(res.status).toBe(401);
  });

  it('returns not-needed when backfillCompletedAt is set', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({
      id: 1, backfillCompletedAt: new Date(), tcgplayerProductId: 100,
    } as any);
    const res = await POST(new Request('http://x/api/catalog/1/backfill', { method: 'POST' }), ctx);
    const body = await res.json();
    expect(body.status).toBe('not-needed');
    expect(waitUntilSpy).not.toHaveBeenCalled();
  });

  it('returns queued and schedules background work when backfill not done', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue({
      id: 1, backfillCompletedAt: null, tcgplayerProductId: 100,
    } as any);
    const res = await POST(new Request('http://x/api/catalog/1/backfill', { method: 'POST' }), ctx);
    const body = await res.json();
    expect(body.status).toBe('queued');
    expect(waitUntilSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when catalog item does not exist', async () => {
    vi.mocked(dbModule.db.query.catalogItems.findFirst).mockResolvedValue(undefined);
    const res = await POST(new Request('http://x/api/catalog/1/backfill', { method: 'POST' }), ctx);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Create the backfill service**

Create `lib/services/price-backfill.ts`:

```typescript
import 'server-only';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { fetchArchiveSnapshot } from './tcgcsv-archive';
import { persistSnapshot } from './price-snapshots';

const BACKFILL_DAYS = 90;
const PARALLEL = 4;

export async function enqueueBackfill(catalogItemId: number): Promise<void> {
  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true, tcgplayerProductId: true, manualMarketCents: true },
  });
  if (!item || item.tcgplayerProductId == null) return;

  const items = [{ id: item.id, tcgplayerProductId: item.tcgplayerProductId, manualMarketCents: item.manualMarketCents }];

  const dates: Date[] = [];
  for (let i = 1; i <= BACKFILL_DAYS; i++) {
    dates.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
  }

  // Throttle to PARALLEL concurrent fetches
  const queue = dates.slice();
  const workers = Array.from({ length: PARALLEL }, async () => {
    while (queue.length > 0) {
      const date = queue.shift();
      if (!date) return;
      try {
        const snap = await fetchArchiveSnapshot(date);
        await persistSnapshot(snap.date, snap.prices, items, { source: 'tcgcsv', updateLastMarket: false });
      } catch (err) {
        console.error('[backfill] day failed', date.toISOString().slice(0, 10), err);
      }
    }
  });
  await Promise.all(workers);

  await db
    .update(schema.catalogItems)
    .set({ backfillCompletedAt: new Date() })
    .where(eq(schema.catalogItems.id, catalogItemId));
}
```

- [ ] **Step 3: Implement the route**

Create `app/api/catalog/[id]/backfill/route.ts`:

```typescript
import 'server-only';
import { NextResponse, after } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { getServerUser } from '@/lib/auth/getServerUser';
import { enqueueBackfill } from '@/lib/services/price-backfill';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await getServerUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id } = await ctx.params;
  const catalogItemId = Number(id);
  if (!Number.isFinite(catalogItemId)) return new NextResponse('Bad id', { status: 400 });

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, catalogItemId),
    columns: { id: true, backfillCompletedAt: true, tcgplayerProductId: true },
  });
  if (!item) return new NextResponse('Not found', { status: 404 });

  if (item.backfillCompletedAt != null) {
    return NextResponse.json({ status: 'not-needed' });
  }

  after(async () => {
    await enqueueBackfill(catalogItemId);
  });

  return NextResponse.json({ status: 'queued' });
}
```

**Note on `after`:** Next.js 15 introduces `import { after } from 'next/server'` for post-response work. If the project runs an older Next that doesn't have `after`, swap to `import { unstable_after as after } from 'next/server'` or fall back to `void enqueueBackfill(catalogItemId)` (fire and forget; less robust but works).

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/catalog/[id]/backfill/route.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/catalog/[id]/backfill lib/services/price-backfill.ts
git commit -m "feat(plan-7): /api/catalog/[id]/backfill lazy backfill route + service"
git push origin main
```

---

## Task 10: Refresh-all-held route `/api/prices/refresh-held`

**Files:**
- Create: `app/api/prices/refresh-held/route.ts`
- Test: `app/api/prices/refresh-held/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `app/api/prices/refresh-held/route.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST } from './route';

vi.mock('@/lib/auth/getServerUser', () => ({ getServerUser: vi.fn() }));
vi.mock('@/lib/services/price-snapshots', () => ({ snapshotForItems: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  db: { execute: vi.fn() },
  schema: {},
}));

import * as authModule from '@/lib/auth/getServerUser';
import * as snapshotsModule from '@/lib/services/price-snapshots';
import * as dbModule from '@/lib/db/client';

describe('POST /api/prices/refresh-held', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authModule.getServerUser).mockResolvedValue({ id: 'user-1' } as any);
  });

  it('returns 401 for unauthenticated', async () => {
    vi.mocked(authModule.getServerUser).mockResolvedValue(null);
    const res = await POST(new Request('http://x/api/prices/refresh-held', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('returns { itemsRefreshed: 0 } when no held items', async () => {
    vi.mocked(dbModule.db.execute).mockResolvedValue({ rows: [] } as any);
    const res = await POST(new Request('http://x/api/prices/refresh-held', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.itemsRefreshed).toBe(0);
  });

  it('calls snapshotForItems with held catalog item ids', async () => {
    vi.mocked(dbModule.db.execute).mockResolvedValue({ rows: [{ catalog_item_id: 1 }, { catalog_item_id: 2 }] } as any);
    vi.mocked(snapshotsModule.snapshotForItems).mockResolvedValue({
      date: '2026-04-30', rowsWritten: 2, itemsUpdated: 2, itemsSkippedManual: 0,
    });
    const res = await POST(new Request('http://x/api/prices/refresh-held', { method: 'POST' }));
    expect(snapshotsModule.snapshotForItems).toHaveBeenCalledWith([1, 2], expect.any(Object));
    const body = await res.json();
    expect(body.itemsRefreshed).toBe(2);
  });
});
```

- [ ] **Step 2: Implement the route**

Create `app/api/prices/refresh-held/route.ts`:

```typescript
import 'server-only';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { getServerUser } from '@/lib/auth/getServerUser';
import { snapshotForItems } from '@/lib/services/price-snapshots';

export const maxDuration = 30;

export async function POST() {
  const user = await getServerUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const startedAt = Date.now();

  // Held items: distinct catalog_item_id from purchases where qty_remaining > 0.
  // Cross-check with the existing /api/holdings query if its qty-remaining
  // SQL has changed in Plan 5/6.
  const result = await db.execute(sql`
    SELECT DISTINCT p.catalog_item_id
    FROM purchases p
    WHERE p.user_id = ${user.id}
      AND p.deleted_at IS NULL
      AND COALESCE(
        (SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id = p.id),
        0
      ) < p.quantity
  `);
  const ids = (result.rows as Array<{ catalog_item_id: number }>).map((r) => r.catalog_item_id);

  if (ids.length === 0) {
    return NextResponse.json({
      itemsRefreshed: 0,
      durationMs: Date.now() - startedAt,
      refreshedAt: new Date().toISOString(),
    });
  }

  const snap = await snapshotForItems(ids);
  return NextResponse.json({
    itemsRefreshed: snap.itemsUpdated,
    rowsWritten: snap.rowsWritten,
    itemsSkippedManual: snap.itemsSkippedManual,
    durationMs: Date.now() - startedAt,
    refreshedAt: new Date().toISOString(),
  });
}
```

**Implementer note:** the held-items SQL above is a starting point. Cross-reference `app/api/holdings/route.ts` to use the same qty-remaining computation that page already uses (rip + decomposition consumption is also subtracted there). Keep them consistent.

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/prices/refresh-held/route.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add app/api/prices/refresh-held
git commit -m "feat(plan-7): /api/prices/refresh-held route"
git push origin main
```

---

## Task 11: Extend `/api/holdings` response with delta + manual fields

**Files:**
- Modify: `app/api/holdings/route.ts`

- [ ] **Step 1: Read existing route to understand the response shape**

Run: `cat app/api/holdings/route.ts`

Identify the SELECT/aggregation that builds each holding row. Note the column names in the response (e.g., `catalogItemId`, `lastMarketCents`).

- [ ] **Step 2: Add `delta7dCents`, `delta7dPct`, `manualMarketCents` per row**

Modify the route to:
1. After computing the existing holding rows, run a follow-up query against `market_prices` to fetch each item's market_price_cents at `CURRENT_DATE - 7` (or the most recent before that date).
2. Use `computeDeltas` from `lib/services/price-deltas` to compute deltas.
3. Read `catalogItems.manualMarketCents` already in scope from existing joins, or add it to the SELECT if missing.
4. Merge `delta7dCents`, `delta7dPct`, and `manualMarketCents` into each row.

The query template (Drizzle):
```typescript
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const thenRows = await db.execute(sql`
  SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents
  FROM market_prices
  WHERE catalog_item_id = ANY(${sql`ARRAY[${sql.join(catalogItemIds, sql`, `)}]::bigint[]`})
    AND snapshot_date <= ${sevenDaysAgo}
    AND source = 'tcgcsv'
  ORDER BY catalog_item_id, snapshot_date DESC
`);
```

Then build `DeltaInput[]` from `(catalogItemId, currentMarketCents, thenCents)` and pass to `computeDeltas`.

- [ ] **Step 3: Update or add a route test**

Add a new test in the existing `app/api/holdings/route.test.ts` (or create one if absent):

```typescript
it('includes delta7dCents and manualMarketCents on each holding', async () => {
  // Mock db.execute to return a "then" row for each catalogItemId
  // Assert response rows include delta7dCents, delta7dPct, manualMarketCents
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/holdings/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings
git commit -m "feat(plan-7): /api/holdings adds 7d delta + manual override fields"
git push origin main
```

---

## Task 12: Extend `/api/holdings/[catalogItemId]` and `/api/dashboard/totals` responses

**Files:**
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Modify: `app/api/dashboard/totals/route.ts`

- [ ] **Step 1: Add delta + manual to holding-detail route**

Same pattern as Task 11 but for the single-item summary. The response already has a `holding` object — add `delta7dCents`, `delta7dPct`, `manualMarketCents`, `manualMarketAt` fields to that object.

- [ ] **Step 2: Add portfolio-level + per-row deltas to dashboard totals**

Modify `app/api/dashboard/totals/route.ts`:

1. Compute portfolio current value as today (existing) and 7d-ago value (sum of `qty × market_price_cents` at the most-recent snapshot ≤ 7 days ago for each held item).
2. Add `portfolioDelta7dCents`, `portfolioDelta7dPct` to the response.
3. For `bestPerformers` / `worstPerformers` arrays, attach per-row `delta7dCents`, `delta7dPct`, `manualMarketCents`.
4. If any held item has null delta (sparse history), include `deltaCoverage: { covered: N, total: M }` so the UI can render the "Based on N of M" caption.

- [ ] **Step 3: Add tests**

Add tests verifying:
- portfolio fields present
- bestPerformers rows include delta + manual fields
- deltaCoverage reflects counts correctly

- [ ] **Step 4: Run tests**

Run: `npx vitest run app/api/holdings app/api/dashboard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/holdings/[catalogItemId] app/api/dashboard
git commit -m "feat(plan-7): /api/holdings/[id] + /api/dashboard/totals add delta + manual fields"
git push origin main
```

---

## Task 13: Add `manualMarketCents` to search routes

**Files:**
- Modify: `app/api/search/route.ts`
- Modify: `app/api/search/refresh/route.ts`

- [ ] **Step 1: Add the field to both routes**

For each search result row, include `manualMarketCents: catalog_items.manual_market_cents`. The existing SELECT just needs that column added; the result mapper passes it through.

- [ ] **Step 2: Update or add a route test**

Append a test to each route's existing test file asserting the field is present in result rows.

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/search`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/search
git commit -m "feat(plan-7): search routes return manualMarketCents per result"
git push origin main
```

---

## Task 14: TanStack Query hooks for new endpoints

**Files:**
- Create: `lib/query/hooks/usePriceHistory.ts`
- Create: `lib/query/hooks/usePriceHistory.test.ts`
- Create: `lib/query/hooks/useRefreshHeld.ts`
- Create: `lib/query/hooks/useManualPrice.ts`

- [ ] **Step 1: Write failing test for `useCatalogHistory` polling-while-pending**

Create `lib/query/hooks/usePriceHistory.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCatalogHistory } from './usePriceHistory';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useCatalogHistory', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns history points and stops polling when backfill is completed', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      range: '3M',
      points: [{ date: '2026-04-30', marketPriceCents: 1000, lowPriceCents: 950, highPriceCents: 1050, source: 'tcgcsv' }],
      backfillState: 'completed',
      manualOverride: null,
    })));
    const { result } = renderHook(() => useCatalogHistory(1, '3M'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.points).toHaveLength(1));
    expect(result.current.isFetching).toBe(false);
  });

  it('keeps polling while backfillState is pending', async () => {
    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify({
        range: '3M',
        points: callCount > 2 ? [{ date: '2026-04-30', marketPriceCents: 1000, lowPriceCents: 950, highPriceCents: 1050, source: 'tcgcsv' }] : [],
        backfillState: callCount > 2 ? 'completed' : 'pending',
        manualOverride: null,
      }));
    });
    const { result } = renderHook(() => useCatalogHistory(1, '3M'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data?.backfillState).toBe('completed'), { timeout: 30_000 });
    expect(callCount).toBeGreaterThanOrEqual(3);
  }, 30_000);
});
```

- [ ] **Step 2: Implement the hook**

Create `lib/query/hooks/usePriceHistory.ts`:

```typescript
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type ChartRange = '1M' | '3M' | '6M' | '12M' | 'MAX';

export type PricePoint = {
  date: string;
  marketPriceCents: number | null;
  lowPriceCents: number | null;
  highPriceCents: number | null;
  source: 'tcgcsv' | 'manual';
};

export type HistoryResponse = {
  range: ChartRange;
  points: PricePoint[];
  backfillState: 'pending' | 'completed' | 'not-needed';
  manualOverride: { cents: number; setAt: string } | null;
};

export function useCatalogHistory(catalogItemId: number, range: ChartRange) {
  return useQuery<HistoryResponse>({
    queryKey: ['catalog', catalogItemId, 'history', range],
    queryFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/history?range=${range}`);
      if (!res.ok) throw new Error('history fetch failed');
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as HistoryResponse | undefined;
      return data?.backfillState === 'pending' ? 10_000 : false;
    },
  });
}

export function useTriggerBackfill(catalogItemId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/backfill`, { method: 'POST' });
      if (!res.ok) throw new Error('backfill request failed');
      return (await res.json()) as { status: 'queued' | 'completed' | 'not-needed' };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', catalogItemId, 'history'] });
    },
  });
}
```

- [ ] **Step 3: Implement `useRefreshHeld`**

Create `lib/query/hooks/useRefreshHeld.ts`:

```typescript
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type RefreshHeldResult = {
  itemsRefreshed: number;
  rowsWritten: number;
  durationMs: number;
  refreshedAt: string;
};

const LS_KEY = 'pokestonks.lastRefreshHeldAt';

export function useRefreshHeld() {
  const qc = useQueryClient();
  return useMutation<RefreshHeldResult>({
    mutationFn: async () => {
      const res = await fetch('/api/prices/refresh-held', { method: 'POST' });
      if (!res.ok) throw new Error('refresh-held failed');
      return res.json();
    },
    onSuccess: (data) => {
      try {
        localStorage.setItem(LS_KEY, data.refreshedAt);
      } catch {
        // ignore
      }
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function getLastRefreshHeldAt(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement `useManualPrice`**

Create `lib/query/hooks/useManualPrice.ts`:

```typescript
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useSetManualPrice(catalogItemId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (manualMarketCents: number) => {
      const res = await fetch(`/api/catalog/${catalogItemId}/manual-price`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manualMarketCents }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['catalog', catalogItemId] });
    },
  });
}

export function useClearManualPrice(catalogItemId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/catalog/${catalogItemId}/manual-price`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['catalog', catalogItemId] });
    },
  });
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/query/hooks/usePriceHistory.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/query/hooks
git commit -m "feat(plan-7): TanStack Query hooks for history, backfill, refresh-held, manual price"
git push origin main
```

---

## Task 15: Atom components — `<DeltaPill>` and `<ManualPriceBadge>`

**Files:**
- Create: `components/prices/DeltaPill.tsx`
- Create: `components/prices/DeltaPill.test.tsx`
- Create: `components/prices/ManualPriceBadge.tsx`
- Create: `components/prices/ManualPriceBadge.test.tsx`

- [ ] **Step 1: Write failing tests for `<DeltaPill>`**

Create `components/prices/DeltaPill.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeltaPill } from './DeltaPill';

describe('<DeltaPill>', () => {
  it('renders positive delta with + sign and green variant', () => {
    render(<DeltaPill deltaCents={350} deltaPct={8.2} />);
    expect(screen.getByText(/\+\$3\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+8\.2%/)).toBeInTheDocument();
    expect(screen.getByText(/7d/)).toBeInTheDocument();
  });

  it('renders negative delta with − sign and red variant', () => {
    render(<DeltaPill deltaCents={-120} deltaPct={-2.8} />);
    expect(screen.getByText(/−\$1\.20/)).toBeInTheDocument();
    expect(screen.getByText(/−2\.8%/)).toBeInTheDocument();
  });

  it('renders muted "—" when deltaCents is null', () => {
    render(<DeltaPill deltaCents={null} deltaPct={null} />);
    expect(screen.getByText(/—/)).toBeInTheDocument();
  });

  it('respects windowLabel prop', () => {
    render(<DeltaPill deltaCents={100} deltaPct={5} windowLabel="30d" />);
    expect(screen.getByText(/30d/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement `<DeltaPill>`**

Create `components/prices/DeltaPill.tsx`:

```tsx
import { formatCents, formatCentsSigned } from '@/lib/utils/format';

export type DeltaPillProps = {
  deltaCents: number | null;
  deltaPct: number | null;
  windowLabel?: string;
  size?: 'sm' | 'md';
};

export function DeltaPill({ deltaCents, deltaPct, windowLabel = '7d', size = 'md' }: DeltaPillProps) {
  if (deltaCents == null) {
    return (
      <span className={`inline-flex items-center gap-1 text-muted-foreground ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
        <span>—</span>
        <span className="text-xs opacity-70">{windowLabel}</span>
      </span>
    );
  }
  const positive = deltaCents > 0;
  const negative = deltaCents < 0;
  const colorClass = positive
    ? 'text-emerald-500'
    : negative
    ? 'text-rose-500'
    : 'text-muted-foreground';

  // formatCentsSigned uses '+' / '−'; abs the cents so the leading sign is consistent.
  const centsLabel = formatCentsSigned(deltaCents);
  const pctLabel = deltaPct == null
    ? null
    : `${deltaPct > 0 ? '+' : deltaPct < 0 ? '−' : ''}${Math.abs(deltaPct).toFixed(1)}%`;

  return (
    <span className={`inline-flex items-center gap-1 ${colorClass} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <span>{centsLabel}</span>
      {pctLabel != null && <span>({pctLabel})</span>}
      <span className="text-xs opacity-70">{windowLabel}</span>
    </span>
  );
}
```

**Note:** `formatCentsSigned` already exists from Plan 4 (`lib/utils/format.ts`) and emits a leading `+` for positive and `−` for negative. Verify by reading that file before relying on it; if its sign convention differs, format inline here.

- [ ] **Step 3: Run DeltaPill tests**

Run: `npx vitest run components/prices/DeltaPill.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 4: Write failing tests for `<ManualPriceBadge>`**

Create `components/prices/ManualPriceBadge.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManualPriceBadge } from './ManualPriceBadge';

describe('<ManualPriceBadge>', () => {
  it('renders a "Manual" pill', () => {
    render(<ManualPriceBadge setAt={new Date('2026-04-15T12:00:00Z')} />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('exposes the setAt date in the title for hover', () => {
    render(<ManualPriceBadge setAt={new Date('2026-04-15T12:00:00Z')} />);
    const el = screen.getByText('Manual');
    expect(el.title).toMatch(/2026-04-15/);
  });
});
```

- [ ] **Step 5: Implement `<ManualPriceBadge>`**

Create `components/prices/ManualPriceBadge.tsx`:

```tsx
export type ManualPriceBadgeProps = {
  setAt: Date | string | null;
};

export function ManualPriceBadge({ setAt }: ManualPriceBadgeProps) {
  const date = setAt == null ? null : (setAt instanceof Date ? setAt : new Date(setAt));
  const ymd = date == null ? '' : date.toISOString().slice(0, 10);
  const title = ymd ? `Manual price · set ${ymd}` : 'Manual price';
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
      title={title}
    >
      Manual
    </span>
  );
}
```

- [ ] **Step 6: Run ManualPriceBadge tests**

Run: `npx vitest run components/prices/ManualPriceBadge.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
git add components/prices/DeltaPill.tsx components/prices/DeltaPill.test.tsx components/prices/ManualPriceBadge.tsx components/prices/ManualPriceBadge.test.tsx
git commit -m "feat(plan-7): DeltaPill + ManualPriceBadge atoms"
git push origin main
```

---

## Task 16: `<ManualPricePanel>` and `<RefreshHeldButton>` compound components

**Files:**
- Create: `components/prices/ManualPricePanel.tsx`
- Create: `components/prices/ManualPricePanel.test.tsx`
- Create: `components/prices/RefreshHeldButton.tsx`
- Create: `components/prices/RefreshHeldButton.test.tsx`

- [ ] **Step 1: Implement `<ManualPricePanel>`**

Create `components/prices/ManualPricePanel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { formatCents } from '@/lib/utils/format';
import { ManualPriceBadge } from './ManualPriceBadge';
import { SetManualPriceDialog } from './SetManualPriceDialog';
import { useClearManualPrice } from '@/lib/query/hooks/useManualPrice';

export type ManualPricePanelProps = {
  catalogItemId: number;
  manualMarketCents: number;
  manualMarketAt: string;
};

export function ManualPricePanel({ catalogItemId, manualMarketCents, manualMarketAt }: ManualPricePanelProps) {
  const [open, setOpen] = useState(false);
  const clearMutation = useClearManualPrice(catalogItemId);

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold">{formatCents(manualMarketCents)}</span>
          <ManualPriceBadge setAt={manualMarketAt} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-border/40 px-3 py-1.5 text-sm hover:bg-accent"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="rounded-md border border-border/40 px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Manual price set {new Date(manualMarketAt).toISOString().slice(0, 10)}. Daily TCGCSV cron does not overwrite this value.
      </p>
      <SetManualPriceDialog
        catalogItemId={catalogItemId}
        open={open}
        onOpenChange={setOpen}
        initialCents={manualMarketCents}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write a smoke test for `<ManualPricePanel>`**

Create `components/prices/ManualPricePanel.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualPricePanel } from './ManualPricePanel';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('<ManualPricePanel>', () => {
  it('renders the manual price + Manual badge', () => {
    render(
      withQuery(
        <ManualPricePanel
          catalogItemId={1}
          manualMarketCents={5000}
          manualMarketAt="2026-04-15T12:00:00Z"
        />
      )
    );
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Implement `<RefreshHeldButton>`**

Create `components/prices/RefreshHeldButton.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRefreshHeld, getLastRefreshHeldAt } from '@/lib/query/hooks/useRefreshHeld';

const DEBOUNCE_MS = 60_000;

function formatRefreshedAgo(iso: string | null): string {
  if (!iso) return 'Never refreshed';
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return 'Refreshed just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Refreshed ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `Refreshed ${hours}h ago`;
}

export function RefreshHeldButton() {
  const refresh = useRefreshHeld();
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setLastAt(getLastRefreshHeldAt());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (refresh.data?.refreshedAt) setLastAt(refresh.data.refreshedAt);
  }, [refresh.data]);

  const debounced = lastAt != null && now - Date.parse(lastAt) < DEBOUNCE_MS;
  const disabled = refresh.isPending || debounced;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{formatRefreshedAgo(lastAt)}</span>
      <button
        type="button"
        onClick={() => refresh.mutate()}
        disabled={disabled}
        className="rounded-md border border-border/40 bg-card px-2 py-1 hover:bg-accent disabled:opacity-40"
      >
        {refresh.isPending ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Test `<RefreshHeldButton>`**

Create `components/prices/RefreshHeldButton.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefreshHeldButton } from './RefreshHeldButton';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('<RefreshHeldButton>', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        itemsRefreshed: 5, rowsWritten: 5, durationMs: 1000,
        refreshedAt: new Date().toISOString(),
      }))
    );
  });

  it('renders refresh button enabled when no recent refresh', () => {
    render(withQuery(<RefreshHeldButton />));
    expect(screen.getByRole('button')).not.toBeDisabled();
    expect(screen.getByText('Never refreshed')).toBeInTheDocument();
  });

  it('disables after click for the debounce window', async () => {
    render(withQuery(<RefreshHeldButton />));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled());
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/prices/ManualPricePanel.test.tsx components/prices/RefreshHeldButton.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add components/prices/ManualPricePanel.tsx components/prices/ManualPricePanel.test.tsx components/prices/RefreshHeldButton.tsx components/prices/RefreshHeldButton.test.tsx
git commit -m "feat(plan-7): ManualPricePanel + RefreshHeldButton compound components"
git push origin main
```

---

## Task 17: `<SetManualPriceDialog>`

**Files:**
- Create: `components/prices/SetManualPriceDialog.tsx`
- Create: `components/prices/SetManualPriceDialog.test.tsx`

Read existing Vault dialog chrome usage in `components/sales/SellDialog.tsx` (or similar Plan 5/6 dialog) before writing — match the same import paths and component composition.

- [ ] **Step 1: Implement the dialog**

Create `components/prices/SetManualPriceDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Dialog } from '@base-ui-components/react';
import { VaultDialogHeader } from '@/components/ui/dialog/VaultDialogHeader';
import { FormSection, FormRow, FormLabel, FormHint } from '@/components/ui/form';
import { DialogActions } from '@/components/ui/dialog/DialogActions';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { useSetManualPrice } from '@/lib/query/hooks/useManualPrice';
import { formatCents } from '@/lib/utils/format';

export type SetManualPriceDialogProps = {
  catalogItemId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCents?: number | null;
};

export function SetManualPriceDialog({ catalogItemId, open, onOpenChange, initialCents }: SetManualPriceDialogProps) {
  const [dollars, setDollars] = useState<string>(initialCents != null ? (initialCents / 100).toFixed(2) : '');
  const [error, setError] = useState<string | null>(null);
  const mutation = useSetManualPrice(catalogItemId);

  async function submit() {
    setError(null);
    const cents = dollarsStringToCents(dollars);
    if (cents == null || cents < 0) {
      setError('Enter a valid price like 12.34');
      return;
    }
    try {
      await mutation.mutateAsync(cents);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set price');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] rounded-2xl border border-border/40 bg-card">
          <VaultDialogHeader title="Set manual price" subtitle="Use for vending-only SKUs not covered by TCGCSV." />
          <FormSection>
            <FormRow>
              <FormLabel htmlFor="manual-price">Market price (per unit)</FormLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  id="manual-price"
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  className="w-full rounded-md border border-border bg-background py-2 pl-7 pr-3"
                  placeholder="0.00"
                />
              </div>
              <FormHint>
                Stored as integer cents. The daily TCGCSV cron will not overwrite this value while set.
              </FormHint>
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </FormRow>
          </FormSection>
          <DialogActions>
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-md border border-border/40 px-4 py-2 text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={mutation.isPending}
              className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </DialogActions>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**If any imported chrome path doesn't exist:** read another Plan 6 dialog (`SaleDetailDialog.tsx`, `EditPurchaseDialog.tsx`, etc.) and match its imports exactly.

- [ ] **Step 2: Write a smoke test**

Create `components/prices/SetManualPriceDialog.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SetManualPriceDialog } from './SetManualPriceDialog';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('<SetManualPriceDialog>', () => {
  const originalFetch = global.fetch;

  it('submits cents derived from the dollar input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ manualMarketCents: 1234, manualMarketAt: new Date().toISOString() }))
    );
    global.fetch = fetchMock;
    const onOpen = vi.fn();
    render(
      withQuery(
        <SetManualPriceDialog catalogItemId={1} open={true} onOpenChange={onOpen} />
      )
    );
    const input = await screen.findByLabelText(/Market price/);
    fireEvent.change(input, { target: { value: '12.34' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/catalog/1/manual-price',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ manualMarketCents: 1234 }),
      })
    ));
    global.fetch = originalFetch;
  });

  it('shows validation error for invalid input', async () => {
    render(
      withQuery(
        <SetManualPriceDialog catalogItemId={1} open={true} onOpenChange={vi.fn()} />
      )
    );
    const input = await screen.findByLabelText(/Market price/);
    fireEvent.change(input, { target: { value: 'not a number' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(await screen.findByText(/valid price/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run components/prices/SetManualPriceDialog.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 4: Commit**

```bash
git add components/prices/SetManualPriceDialog.tsx components/prices/SetManualPriceDialog.test.tsx
git commit -m "feat(plan-7): SetManualPriceDialog with Vault chrome"
git push origin main
```

---

## Task 18: `<PriceChart>` custom-SVG component

**Files:**
- Create: `components/charts/PriceChart.tsx`
- Create: `components/charts/PriceChart.test.tsx`

This is the largest single component in the plan (~250-300 LOC). It's a single task because the parts (SVG line, range toggle, tooltip, empty state, manual override branch, polling-while-pending) are tightly coupled.

- [ ] **Step 1: Implement the chart**

Create `components/charts/PriceChart.tsx`:

```tsx
'use client';
import { useMemo, useState, useRef, useEffect } from 'react';
import { useCatalogHistory, useTriggerBackfill, type ChartRange, type PricePoint } from '@/lib/query/hooks/usePriceHistory';
import { ManualPricePanel } from '@/components/prices/ManualPricePanel';
import { formatCents } from '@/lib/utils/format';

export type PriceChartProps = {
  catalogItemId: number;
};

const RANGES: ChartRange[] = ['1M', '3M', '6M', '12M', 'MAX'];

export function PriceChart({ catalogItemId }: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>('3M');
  const history = useCatalogHistory(catalogItemId, range);
  const triggerBackfill = useTriggerBackfill(catalogItemId);

  // Trigger lazy backfill once per mount when state is pending and no points yet
  const triggeredRef = useRef(false);
  useEffect(() => {
    if (
      !triggeredRef.current &&
      history.data?.backfillState === 'pending' &&
      (history.data?.points.length ?? 0) < 7
    ) {
      triggeredRef.current = true;
      triggerBackfill.mutate();
    }
  }, [history.data, triggerBackfill]);

  if (history.isLoading) {
    return <div className="rounded-2xl border border-border/40 bg-card p-6 h-72 animate-pulse" />;
  }

  if (history.data?.manualOverride != null) {
    return (
      <ManualPricePanel
        catalogItemId={catalogItemId}
        manualMarketCents={history.data.manualOverride.cents}
        manualMarketAt={history.data.manualOverride.setAt}
      />
    );
  }

  const points = history.data?.points ?? [];
  if (points.length < 2) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-6">
        <RangeToggle range={range} onChange={setRange} />
        <div className="mt-6 flex h-56 flex-col items-center justify-center text-sm text-muted-foreground">
          <p>Tracking starts soon.</p>
          {history.data?.backfillState === 'pending' && (
            <p className="mt-2 text-xs">Pulling 90 days of history…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/40 bg-card p-6">
      <RangeToggle range={range} onChange={setRange} />
      <ChartCanvas points={points} />
    </div>
  );
}

function RangeToggle({ range, onChange }: { range: ChartRange; onChange: (r: ChartRange) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-background p-1 text-xs">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-3 py-1 transition ${
            r === range ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const PADDING = { top: 16, right: 16, bottom: 24, left: 56 };

function ChartCanvas({ points }: { points: PricePoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const height = 240;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const usable = useMemo(
    () => points.filter((p): p is PricePoint & { marketPriceCents: number } => p.marketPriceCents != null),
    [points]
  );

  const { dPath, xs, ys, minY, maxY } = useMemo(() => {
    const innerW = width - PADDING.left - PADDING.right;
    const innerH = height - PADDING.top - PADDING.bottom;
    if (usable.length === 0) {
      return { dPath: '', xs: [] as number[], ys: [] as number[], minY: 0, maxY: 0 };
    }
    const cents = usable.map((p) => p.marketPriceCents);
    const minY = Math.min(...cents);
    const maxY = Math.max(...cents);
    const yRange = Math.max(maxY - minY, 1);

    const xs = usable.map((_, i) => PADDING.left + (i / Math.max(usable.length - 1, 1)) * innerW);
    const ys = usable.map((p) => PADDING.top + innerH - ((p.marketPriceCents - minY) / yRange) * innerH);

    const dPath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${ys[i].toFixed(2)}`).join(' ');
    return { dPath, xs, ys, minY, maxY };
  }, [usable, width]);

  const hoverPoint = hoverIdx != null ? usable[hoverIdx] : null;
  const hoverX = hoverIdx != null ? xs[hoverIdx] : null;
  const hoverY = hoverIdx != null ? ys[hoverIdx] : null;

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  return (
    <div ref={wrapRef} className="mt-4 relative">
      <svg width={width} height={height} onMouseMove={onMouseMove} onMouseLeave={() => setHoverIdx(null)} role="img" aria-label="Price history chart">
        {/* Y-axis labels (min/max) */}
        <text x={PADDING.left - 8} y={PADDING.top + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {formatCents(maxY)}
        </text>
        <text x={PADDING.left - 8} y={height - PADDING.bottom + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
          {formatCents(minY)}
        </text>
        {/* The line */}
        <path d={dPath} fill="none" stroke="currentColor" strokeWidth={2} className="text-emerald-400" />
        {/* Hover tracker */}
        {hoverX != null && hoverY != null && hoverPoint != null && (
          <g>
            <line x1={hoverX} y1={PADDING.top} x2={hoverX} y2={height - PADDING.bottom} stroke="currentColor" strokeOpacity={0.2} />
            <circle cx={hoverX} cy={hoverY} r={4} className="fill-emerald-400" />
          </g>
        )}
      </svg>
      {hoverPoint != null && hoverX != null && (
        <div
          className="pointer-events-none absolute rounded-md border border-border/40 bg-popover px-3 py-2 text-xs shadow"
          style={{ left: Math.min(width - 160, Math.max(0, hoverX + 8)), top: 8 }}
        >
          <div className="font-medium">{hoverPoint.date}</div>
          <div className="mt-1 flex justify-between gap-4">
            <span className="text-muted-foreground">Market</span>
            <span>{formatCents(hoverPoint.marketPriceCents!)}</span>
          </div>
          {hoverPoint.lowPriceCents != null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Low</span>
              <span>{formatCents(hoverPoint.lowPriceCents)}</span>
            </div>
          )}
          {hoverPoint.highPriceCents != null && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">High</span>
              <span>{formatCents(hoverPoint.highPriceCents)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write a smoke test**

Create `components/charts/PriceChart.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PriceChart } from './PriceChart';

function withQuery(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

describe('<PriceChart>', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('shows empty state when fewer than 2 points', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      range: '3M', points: [], backfillState: 'pending', manualOverride: null,
    })));
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() => expect(screen.getByText(/Tracking starts soon/)).toBeInTheDocument());
  });

  it('renders ManualPricePanel when manualOverride present', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      range: '3M', points: [], backfillState: 'completed',
      manualOverride: { cents: 5000, setAt: '2026-04-15T12:00:00Z' },
    })));
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() => expect(screen.getByText('Manual')).toBeInTheDocument());
  });

  it('renders SVG chart when there are >= 2 points', async () => {
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      range: '3M',
      points: [
        { date: '2026-04-29', marketPriceCents: 1000, lowPriceCents: 950, highPriceCents: 1050, source: 'tcgcsv' },
        { date: '2026-04-30', marketPriceCents: 1100, lowPriceCents: 1050, highPriceCents: 1150, source: 'tcgcsv' },
      ],
      backfillState: 'completed',
      manualOverride: null,
    })));
    render(withQuery(<PriceChart catalogItemId={1} />));
    await waitFor(() => expect(screen.getByRole('img', { name: /Price history/ })).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run components/charts/PriceChart.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 4: Commit**

```bash
git add components/charts
git commit -m "feat(plan-7): PriceChart custom-SVG component with range toggle + hover"
git push origin main
```

---

## Task 19: Wire components into HoldingsGrid + Dashboard cards

**Files:**
- Modify: `components/holdings/HoldingsGrid.tsx`
- Modify: `components/dashboard/DashboardTotalsCard.tsx`
- Modify: `components/dashboard/DashboardPerformersCard.tsx`

- [ ] **Step 1: Read each existing component**

Quickly familiarize: `cat components/holdings/HoldingsGrid.tsx components/dashboard/DashboardTotalsCard.tsx components/dashboard/DashboardPerformersCard.tsx`. Note where the price + P&L footer lives in each.

- [ ] **Step 2: HoldingsGrid card additions**

In `components/holdings/HoldingsGrid.tsx`:
- Below the existing P&L footer block on each card, add `<DeltaPill deltaCents={h.delta7dCents} deltaPct={h.delta7dPct} />`.
- Next to the market-price label, conditionally render `{h.manualMarketCents != null && <ManualPriceBadge setAt={h.manualMarketAt ?? null} />}`.
- Imports at top: `import { DeltaPill } from '@/components/prices/DeltaPill';` and `import { ManualPriceBadge } from '@/components/prices/ManualPriceBadge';`.
- The Holding type imported for the rows needs `delta7dCents`, `delta7dPct`, `manualMarketCents`, `manualMarketAt` — verify types match the route response.

- [ ] **Step 3: DashboardTotalsCard additions**

In `components/dashboard/DashboardTotalsCard.tsx`:
- Below the "Current value" stat, add `<DeltaPill deltaCents={portfolio.portfolioDelta7dCents} deltaPct={portfolio.portfolioDelta7dPct} />`.
- If the response includes `deltaCoverage` and `covered < total`, render a small caption: `"Based on N of M holdings"`.
- Add `<RefreshHeldButton />` in the card header (top right).

- [ ] **Step 4: DashboardPerformersCard additions**

In `components/dashboard/DashboardPerformersCard.tsx`:
- Each performer row gets `<DeltaPill size="sm" ... />` and conditionally `<ManualPriceBadge ... />` near the price.

- [ ] **Step 5: Run typecheck + relevant tests**

Run:
```
npm run typecheck
npx vitest run components/holdings components/dashboard
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/holdings components/dashboard
git commit -m "feat(plan-7): wire DeltaPill + ManualPriceBadge + RefreshHeldButton into holdings grid + dashboard cards"
git push origin main
```

---

## Task 20: Wire components into HoldingDetailClient + catalog detail + search results

**Files:**
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`
- Modify: catalog detail page client component (find via `grep -r "useCatalog\|catalog/\[id\]" app/`)
- Modify: search result card component (find under `components/catalog/` or wherever search results render)

- [ ] **Step 1: HoldingDetailClient additions**

- Add `<DeltaPill ... />` inline in the header next to current value.
- Below the header, add `<PriceChart catalogItemId={item.id} />`. The chart already handles the manual-override branch internally.
- Add a "Set price" / "Edit price" button somewhere in the header that opens `<SetManualPriceDialog>`. Visibility: always show "Edit price" if `manualMarketCents != null`; show "Set price" if `lastMarketCents == null`. Hide if priced via TCGCSV (the chart's own panel handles override edits).
- Wire `<SetManualPriceDialog catalogItemId={item.id} open={open} onOpenChange={setOpen} />` state.

- [ ] **Step 2: Catalog detail page additions**

- Add `<ManualPriceBadge setAt={...} />` next to the market price when `manualMarketCents` is set.
- Add a "Set manual price" button that opens `<SetManualPriceDialog>`.

- [ ] **Step 3: Search result card additions**

- Add `<ManualPriceBadge ... />` next to the price label when present.
- (No chart in search results — kept lightweight.)

- [ ] **Step 4: Run typecheck + tests**

Run:
```
npm run typecheck
npx vitest run app/\(authenticated\)/holdings app/\(authenticated\)/catalog components/catalog
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/\(authenticated\)/holdings app/\(authenticated\)/catalog components/catalog 2>/dev/null
git commit -m "feat(plan-7): wire PriceChart + DeltaPill + ManualPriceBadge into holding detail / catalog / search"
git push origin main
```

---

## Task 21: Vercel cron config + initial backfill script

**Files:**
- Create: `vercel.json`
- Create: `scripts/backfill-prices.ts`
- Modify: `package.json` (add `backfill-prices` script)

- [ ] **Step 1: Write `vercel.json`**

Create `vercel.json` at the repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/refresh-prices",
      "schedule": "0 6 * * *"
    }
  ]
}
```

If a `vercel.json` already exists (verify with `ls vercel.json`), merge the `crons` array into it.

- [ ] **Step 2: Write `scripts/backfill-prices.ts`**

Create `scripts/backfill-prices.ts`:

```typescript
import 'dotenv/config';
import { db, schema } from '../lib/db/client';
import { fetchArchiveSnapshot } from '../lib/services/tcgcsv-archive';
import { persistSnapshot } from '../lib/services/price-snapshots';
import { isNotNull } from 'drizzle-orm';

const DAYS = 365;
const PARALLEL = 4;

async function main() {
  console.log(`[backfill] Starting ${DAYS}-day backfill against production Supabase`);

  const items = await db.query.catalogItems.findMany({
    where: isNotNull(schema.catalogItems.tcgplayerProductId),
    columns: { id: true, tcgplayerProductId: true, manualMarketCents: true },
  });
  console.log(`[backfill] ${items.length} catalog items have a tcgplayer_product_id`);

  if (items.length === 0) {
    console.log('[backfill] No items to backfill; exiting');
    return;
  }

  const dates: Date[] = [];
  for (let i = 1; i <= DAYS; i++) {
    dates.push(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
  }

  let completed = 0;
  let failed = 0;
  const queue = dates.slice();
  const workers = Array.from({ length: PARALLEL }, async () => {
    while (queue.length > 0) {
      const date = queue.shift();
      if (!date) return;
      try {
        const snap = await fetchArchiveSnapshot(date);
        const result = await persistSnapshot(snap.date, snap.prices, items as any, {
          source: 'tcgcsv',
          updateLastMarket: false,
        });
        completed++;
        if (completed % 10 === 0) {
          console.log(`[backfill] ${completed}/${DAYS} days done · last ${snap.date} · rows ${result.rowsWritten}`);
        }
      } catch (err) {
        failed++;
        console.error(`[backfill] day ${date.toISOString().slice(0, 10)} FAILED:`, err instanceof Error ? err.message : err);
      }
    }
  });
  await Promise.all(workers);

  console.log(`[backfill] Completed: ${completed} ok, ${failed} failed`);

  console.log('[backfill] Marking all catalog_items as backfill_completed_at = NOW()');
  await db
    .update(schema.catalogItems)
    .set({ backfillCompletedAt: new Date() })
    .where(isNotNull(schema.catalogItems.tcgplayerProductId));

  console.log('[backfill] Done');
}

main().catch((err) => {
  console.error('[backfill] FATAL', err);
  process.exit(1);
});
```

- [ ] **Step 3: Add npm script**

Modify `package.json`:

Add to `"scripts"`:
```json
"backfill-prices": "tsx scripts/backfill-prices.ts"
```

(Verify `tsx` is in devDependencies; the existing `migrate-rls.ts` script setup should already use it.)

- [ ] **Step 4: Commit**

```bash
git add vercel.json scripts/backfill-prices.ts package.json
git commit -m "feat(plan-7): vercel.json cron config + backfill-prices script"
git push origin main
```

---

## Task 22: Final verification + ship marker

**Files:** none new.

- [ ] **Step 1: Full quality gate**

Run:
```
npm run lint
npm run typecheck
npm test
npm run build
```
Expected: all four pass. If `npm run build` reports any Suspense or prerender error (per memory's lesson), fix inline before marking the task done.

- [ ] **Step 2: Manual deploy verification**

The implementer must do these manually:
1. Confirm `CRON_SECRET` is set in Vercel project env vars (Settings → Environment Variables).
2. Open Vercel dashboard → Crons; confirm `/api/cron/refresh-prices` is registered with `0 6 * * *`.
3. Click "Run now" once. Verify the response status and check Vercel function logs for `snapshotsWritten > 0`.
4. Run `npm run backfill-prices` from the local machine against production Supabase service-role to populate 365 days of history. This may take 5-10 minutes.
5. Open the live site:
   - Dashboard: `<RefreshHeldButton>` visible; portfolio `<DeltaPill>` renders a real number.
   - Holdings grid: each card shows `<DeltaPill>` (and `<ManualPriceBadge>` for any manually-overridden item).
   - Click into a held item: `<PriceChart>` renders a chart with multiple data points.
   - For an unpriced item: confirm the "Set price" button works end-to-end and the chart switches to `<ManualPricePanel>` afterwards.

- [ ] **Step 3: Empty ship marker commit**

```bash
git commit --allow-empty -m "feat: ship Plan 7 (Pricing automation + history)"
git push origin main
```

- [ ] **Step 4: Update memory**

Update `C:\Users\Michael\.claude\projects\C--Users-Michael-Documents-Claude-Pokemon-Portfolio\memory\project_state.md`:
- Mark Plan 7 as ✅ shipped with the empty-commit SHA.
- Roll forward: Plan 8 (Collection-tracking mode) is next.
- Add any new test-count delta or deferred items discovered during execution.

---

## Self-Review (run before handoff)

**Spec coverage:**
- ✅ Daily snapshot cron → Task 1 (schema), 4-6 (archive + snapshots + cron route)
- ✅ Price chart on holding detail → Task 18 (PriceChart), 20 (wiring)
- ✅ 7d delta indicators → Task 3 (deltas service), 11-12 (route extensions), 15 (DeltaPill), 19-20 (wiring)
- ✅ Refresh-all-held → Task 10 (route), 14 (hook), 16 (button), 19 (wiring)
- ✅ Manual override → Task 1 (schema), 8 (route), 14 (hook), 15 (badge), 16 (panel), 17 (dialog), 19-20 (wiring)
- ✅ Initial archive backfill → Task 21 (script)
- ✅ Lazy per-item backfill → Task 9 (route + service)
- ✅ Search behavior preservation → Task 13 (manual field on search routes); search auto-fetch unchanged (no task needed)
- ✅ refresh_runs telemetry → Task 6 (cron route writes rows)
- ✅ Migration applied manually via Supabase SQL editor → Task 1 step 5

**Type/name consistency check:**
- `marketPriceCents`/`lowPriceCents`/`highPriceCents` (camelCase Drizzle reads) used throughout API responses ✅
- `manualMarketCents`/`manualMarketAt`/`backfillCompletedAt` consistent across schema + routes + types ✅
- `delta7dCents`/`delta7dPct` consistent in `/api/holdings`, `/api/dashboard/totals`, `<DeltaPill>` props ✅
- Chart polling driven by `backfillState` enum `'pending' | 'completed' | 'not-needed'` consistent in route + hook + chart ✅
- `useCatalogHistory`/`useTriggerBackfill` exported from `usePriceHistory.ts` (one file, two hooks) ✅
- `useSetManualPrice`/`useClearManualPrice` exported from `useManualPrice.ts` ✅
- `formatCentsSigned` from `lib/utils/format.ts` (Plan 4) — verify sign convention before reuse in DeltaPill ⚠️

**Placeholder scan:** No "TBD", "TODO", "implement later", or "Add appropriate error handling" patterns. The few "implementer note" blocks all contain concrete fallback instructions.

**Test count check:** Plan adds ~50 tests:
- Pure services: 5 (archive parsing) + 6 (deltas) + 4 (snapshots) = 15
- Routes: 4 (cron) + 4 (history) + 4 (manual) + 4 (backfill) + 3 (refresh-held) + extended-route tests = ~22
- Components: 4 (DeltaPill) + 2 (ManualPriceBadge) + 1 (ManualPricePanel) + 2 (RefreshHeldButton) + 2 (SetManualPriceDialog) + 3 (PriceChart) = 14
- Hooks: 2 (useCatalogHistory polling)
- **Total ≈ 53 new tests.** Brings ≈296 → ≈349 total.

---

## Done

This plan is ready for execution. Use `subagent-driven-development` (recommended for this size) or `executing-plans` for inline execution.
