# Plan 7 — Pricing Automation + History (Design Spec)

**Date:** 2026-04-30
**Status:** Brainstormed and approved; revised 2026-04-30 evening after discovering TCGCSV has no archive endpoint.

## 1. Goal

Replace the current on-demand-only pricing flow with a daily Vercel Cron that keeps the entire portfolio's prices < 24h fresh automatically. Build going-forward chart history per item from the day it's indexed. Surface 7d delta indicators across portfolio surfaces. Support manual price override for vending-only SKUs not covered by TCGCSV.

## 2. Scope (locked)

Five items ship together:

1. Daily price snapshot cron writing to the existing `market_prices` table via per-group ProductsAndPrices.csv iteration.
2. Price chart (1M / 3M / 6M / 12M / MAX) on holding detail page, populated going-forward (no historical backfill).
3. Delta indicators (7d window) on dashboard + holdings grid.
4. Refresh-all-held action.
5. Manual price override.

**Explicitly out of scope:** historical price backfill. TCGCSV has no archive endpoint — data exists only at "today's" price for each group. Charts populate from the day each catalog item is first snapshotted by our cron.

## 3. Architecture

Three moving parts:

1. **Daily snapshot cron** (Vercel Cron, runs `0 21 * * *` = 21:00 UTC, after TCGCSV's ~20:00 UTC publish). Iterates all groups in `categoryId in [3, 50]` via `https://tcgcsv.com/tcgplayer/{cat}/{group}/ProductsAndPrices.csv`, parses each, bulk upserts into `market_prices`, updates `catalog_items.last_market_cents` for non-overridden rows.
2. **Refresh-all-held action** (user-triggered, sync). Same per-group iteration but scoped: only fetches groups that contain catalog items the user holds. Bounded by portfolio size.
3. **Manual override** (small REST surface). Writes columns on `catalog_items` + a single `source='manual'` row in `market_prices`.

### 3.1 Boundaries

- `lib/services/tcgcsv-archive.ts` — pure CSV parser. No DB, no fetch. Used by the live-fetching service.
- `lib/services/tcgcsv-live.ts` — fetches groups list and per-group ProductsAndPrices.csv. Throttled. Returns `Map<tcgplayer_product_id, PriceRow>`.
- `lib/services/price-snapshots.ts` — DB writes (insert/upsert into `market_prices`, update `catalog_items`). No fetch.
- `lib/services/price-deltas.ts` — pure: takes `market_prices` rows + a window, returns `delta7d` summaries.
- API routes glue these together; UI consumes via TanStack Query hooks.

### 3.2 Data flow

- Cron iterates per-group CSVs → bulk upserts `market_prices` → updates `catalog_items.last_market_cents` + `last_market_at` for rows where `manual_market_cents IS NULL`.
- Manual override writes `catalog_items.manual_market_cents` + `manual_market_at` + a single row in `market_prices` with `source='manual'`. Display layer prefers `manual_market_cents` over `last_market_cents` whenever both exist.
- Chart UI reads `/api/catalog/[id]/history?range=...` from `market_prices`. Manual entries marked.
- Delta UI reads new fields on `/api/holdings` and `/api/dashboard/totals`.

## 4. Schema

`market_prices` and `refresh_runs` tables already exist in production. Plan 7 extends — does not recreate — these.

**Existing `market_prices` shape (do not change):**
```
id              bigserial pk
catalog_item_id bigint     fk → catalog_items.id ON DELETE CASCADE
snapshot_date   date
condition       text       (NULL for sealed; condition string for cards)
market_price_cents  integer
low_price_cents     integer
high_price_cents    integer
source          text default 'tcgcsv'
UNIQUE (catalog_item_id, snapshot_date, condition, source)
INDEX market_prices_catalog_date_idx (catalog_item_id, snapshot_date)
```

**Catalog items use `bigserial` (number) ids, not UUID.** All API contracts and Drizzle types reflect this.

### 4.1 Migration: `supabase/migrations/20260430000001_pricing_automation.sql`

Applied manually via Supabase SQL editor. Drizzle TS schema updated to match — no `drizzle-kit push`.

```sql
-- 1. Add created_at to market_prices for telemetry
ALTER TABLE market_prices
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Add CHECK constraint on source ('tcgcsv' | 'manual')
ALTER TABLE market_prices
  DROP CONSTRAINT IF EXISTS market_prices_source_check;
ALTER TABLE market_prices
  ADD CONSTRAINT market_prices_source_check
  CHECK (source IN ('tcgcsv', 'manual'));

-- 3. Add a snapshot_date DESC index for chart range queries
CREATE INDEX IF NOT EXISTS market_prices_catalog_date_desc_idx
  ON market_prices (catalog_item_id, snapshot_date DESC);

-- 4. Manual override columns on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS manual_market_cents INTEGER,
  ADD COLUMN IF NOT EXISTS manual_market_at TIMESTAMPTZ;
```

### 4.2 Drizzle schema changes

- `lib/db/schema/marketPrices.ts` — add `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`.
- `lib/db/schema/catalogItems.ts` — add `manualMarketCents`, `manualMarketAt`.

### 4.3 Schema notes

- `snapshot_date` is DATE. One row per product per day per (condition, source). Idempotent re-runs via `INSERT ... ON CONFLICT (catalog_item_id, snapshot_date, condition, source) DO UPDATE`.
- For sealed products, `condition` is always NULL. For cards, the existing on-demand path uses NULL too. Plan 7 also writes NULL for `condition`.
- `mid_price_cents` is NOT in the schema. The TCGCSV CSV exposes it but we don't store it. YAGNI — chart only renders market.
- `source` CHECK is added so a future `'pricecharting'` source needs a constraint replacement, not an `ALTER TYPE`.
- `manual_market_cents` is on `catalog_items` globally (single-user app).

### 4.4 Existing `prices.ts` service (`lib/services/prices.ts`)

The current service exports `getOrRefreshLatestPrice(item)` — does on-demand per-product refresh for sealed only. Plan 7 supersedes this with the daily cron model. The existing service is **kept** for now (legacy callers); its callers continue to work because they read from `catalog_items.last_market_cents` either way (which the cron now keeps fresh). Once no callers remain, the service can be deleted in a future plan.

### 4.5 Existing `refresh_runs` table (`lib/db/schema/refreshRuns.ts`)

`refresh_runs` already exists with columns `(id, started_at, finished_at, status, total_items, succeeded, failed, errors_json)`. Plan 7's daily cron writes a row per run for telemetry: `started_at = now()`, then on completion `UPDATE` with `finished_at`, `status='ok'|'partial'|'failed'`, totals, and any error payload. Refresh-all-held also writes a `refresh_runs` row.

## 5. Cron + jobs

### 5.1 Daily snapshot cron

- **Schedule:** `0 21 * * *` (21:00 UTC). TCGCSV publishes ~20:00 UTC; one hour buffer.
- **Route:** `app/api/cron/refresh-prices/route.ts` (GET).
- **Auth:** `Authorization: Bearer ${CRON_SECRET}`. Vercel injects automatically when env var is set.
- **`vercel.json`:**
  ```json
  {
    "crons": [
      { "path": "/api/cron/refresh-prices", "schedule": "0 21 * * *" }
    ]
  }
  ```
- **What it does:**
  1. Verify CRON_SECRET; return 401 otherwise.
  2. Insert a `refresh_runs` row with `status='running'`.
  3. Fetch group lists for `categoryId in [3, 50]` via `GET https://tcgcsv.com/tcgplayer/{cat}/Groups.csv`. Roughly ~220 groups for cat 3 + a small handful for cat 50.
  4. For each group, fetch `https://tcgcsv.com/tcgplayer/{cat}/{group}/ProductsAndPrices.csv`. Throttle to `pLimit(8)` — ~8 concurrent fetches. With ~220 groups and ~150ms per fetch, total wall-time ~5-6s.
  5. Parse each CSV (papaparse, handles quoted cells), build a `Map<tcgplayer_product_id, PriceRow>`.
  6. SELECT all `catalog_items` with non-null `tcgplayer_product_id`.
  7. For each catalog item with a Map match: bulk `INSERT INTO market_prices ... ON CONFLICT (catalog_item_id, snapshot_date, condition, source) DO UPDATE` for today's row. If `manual_market_cents IS NULL`: `UPDATE catalog_items SET last_market_cents = ?, last_market_at = NOW()`.
  8. Update `refresh_runs` with `finishedAt`, `status`, totals.
  9. Return `{ snapshotsWritten, itemsUpdated, itemsSkippedManual, durationMs }`.
- **Failure handling:** Group fetch errors caught individually, counted in `failed`. Whole-job fatal errors → 502 + status=`'failed'` on `refresh_runs`. Idempotent re-run safe via UNIQUE.
- **Tier consideration:** Total ~5-6s wall-time fits Hobby's 10s comfortably with margin. Pro's 60s gives much more headroom. `maxDuration = 60` set for safety.

### 5.2 Refresh-all-held

- **Route:** `POST /api/prices/refresh-held` — auth: any signed-in user.
- Looks up the user's held catalog item ids via the same shape that `/api/holdings` uses.
- Joins to `catalog_items` to find which groups need fetching (groupId stored in `catalog_items.tcgcsv_group_id`? — see 5.3).
- Same per-group fetch + upsert path as the daily cron, scoped to those groups only.
- Bounded by portfolio size; typically < 2s.
- Returns `{ itemsRefreshed, durationMs, refreshedAt }`.
- Soft debounce: client tracks `lastRefreshedAt` in localStorage; button disabled if < 60s ago. No server-side cooldown.

### 5.3 Group ID mapping

Refresh-all-held needs to know which groups contain the user's held items. Two options:

- **A.** Add `tcgcsv_group_id BIGINT` column to `catalog_items`, populated on import. Future-proof; adds a migration step.
- **B.** Always fetch all groups (same as the daily cron). Slower, but no schema change.

**Decision: B for v1.** The "refresh-held" use case is rare (mid-day; user explicitly wants fresh data) and the same fetch pipeline is already proven by the daily cron. Optimize later if it becomes painful.

### 5.4 Shared services

`lib/services/tcgcsv-live.ts`:
```typescript
export async function fetchGroupList(categoryId: number): Promise<TcgcsvGroup[]>;
export async function fetchProductsAndPrices(categoryId: number, groupId: number): Promise<Map<number, PriceRow>>;
export async function fetchAllPrices(categoryIds: number[]): Promise<Map<number, PriceRow>>;
```

Both the cron (5.1) and refresh-all-held (5.2) call `fetchAllPrices`.

`lib/services/price-snapshots.ts`:
```typescript
export async function persistSnapshot(
  date: string,
  prices: Map<number, PriceRow>,
  catalogItems: Array<{ id: number; tcgplayerProductId: number | null; manualMarketCents: number | null }>,
  options: { source: 'tcgcsv' | 'manual'; updateLastMarket: boolean }
): Promise<{ rowsWritten: number; itemsUpdated: number; itemsSkippedManual: number }>;

export async function snapshotForItems(
  catalogItemIds: number[]
): Promise<{ rowsWritten: number; itemsUpdated: number; itemsSkippedManual: number; date: string }>;
```

## 6. API surface

### 6.1 New routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/cron/refresh-prices` | GET | `CRON_SECRET` | Daily cron entry |
| `/api/prices/refresh-held` | POST | User session | Refresh-all-held action |
| `/api/catalog/[id]/history` | GET | User session | Chart data + manual override metadata |
| `/api/catalog/[id]/manual-price` | POST / DELETE | User session | Set or clear manual override |

### 6.2 Response shapes

**`GET /api/catalog/[id]/history?range=1M|3M|6M|12M|MAX`**

```typescript
{
  range: '3M',
  points: [
    { date: '2026-01-30', marketPriceCents: 4250, lowPriceCents: 4100, highPriceCents: 4400, source: 'tcgcsv' | 'manual' },
    ...
  ],
  manualOverride: { cents: 5000, setAt: '2026-04-15T...' } | null
}
```

`MAX` drops the date floor. No `backfillState` field — going-forward only.

**`POST /api/prices/refresh-held`** → `{ itemsRefreshed, durationMs, refreshedAt }`

**`POST /api/catalog/[id]/manual-price`** body `{ manualMarketCents: number }` → `{ manualMarketCents, manualMarketAt }`

**`DELETE /api/catalog/[id]/manual-price`** → `{ cleared: true }`

### 6.3 Extended responses

| Route | What's added |
|---|---|
| `GET /api/holdings` | per-row `delta7dCents`, `delta7dPct`, `manualMarketCents` |
| `GET /api/holdings/[id]` | same on `holding` summary |
| `GET /api/dashboard/totals` | portfolio-level `portfolioDelta7dCents`, `portfolioDelta7dPct`; per-row delta on `bestPerformers`/`worstPerformers` |
| `GET /api/search`, `/api/search/refresh` | `manualMarketCents` per result |

### 6.4 Delta computation

`lib/services/price-deltas.ts` (already shipped):

```typescript
export function computeDeltas(inputs: DeltaInput[]): Map<number, DeltaOutput>;
```

DB query for delta inputs: latest `market_prices` row per held item (current = `last_market_cents` or `manual_market_cents`) + subquery for the most recent row at or before `CURRENT_DATE - 7`. Returns null when `then` is null (item has < 7d of history) or zero.

For items with manual override: "now" uses `manual_market_cents`. "then" uses the most recent `market_prices` row for the item with `source IN ('tcgcsv', 'manual')` at or before `CURRENT_DATE - 7`.

## 7. Search behavior

After Plan 7, the search flow stays largely unchanged:

- Search reads from `last_market_cents` / `last_market_at` on `catalog_items`.
- The daily cron now keeps these < 24h fresh. No per-search auto-fetch.
- Search still falls through to TCGCSV when there are no local hits at all (auto-indexing path for new items, unchanged from Plan 2 capstone).
- Newly-indexed items will be picked up by the next daily cron run; their first chart point appears the day after first index.
- The existing `RefreshButton` stays — same job as today, force-fetch upstream.
- "Updated N min ago" caption now reads from the cron's freshness; will essentially always say something < 24h.

## 8. UI

### 8.1 New components

- **`<PriceChart>`** (`components/charts/PriceChart.tsx`) — custom SVG, ~250 LOC. Plan 6 visual language. Range toggle 1M / 3M / 6M / 12M / MAX (default 3M). Hover tracker line + tooltip showing date + market/low/high. Empty state for items with < 2 points: panel reading "Tracking starts soon. We snapshot daily at 21:00 UTC." Switches to `<ManualPricePanel>` if `manualOverride !== null`. **No backfill polling** — chart always renders what's available.

- **`<DeltaPill>`** (`components/prices/DeltaPill.tsx`) — atom: `{ deltaCents, deltaPct, windowLabel = '7d' }`. Variants: positive (green), negative (red), zero/null (muted). Format: `+$3.50 (+8.2%) 7d` / `−$1.20 (−2.8%) 7d` / `— 7d`.

- **`<RefreshHeldButton>`** (`components/prices/RefreshHeldButton.tsx`) — sits in DashboardTotalsCard header. Reads `lastRefreshedAt` from localStorage; disabled if < 60s ago. Click → `POST /api/prices/refresh-held` → invalidates `['holdings']`, `['dashboard']` query keys. Loading spinner + "Refreshed N min ago" caption.

- **`<SetManualPriceDialog>`** (`components/prices/SetManualPriceDialog.tsx`) — Vault chrome. Per-unit price input via `dollarsStringToCents`. Submit → `POST /api/catalog/[id]/manual-price`. "Clear override" button (calls `DELETE`) when item already has an override.

- **`<ManualPricePanel>`** (`components/prices/ManualPricePanel.tsx`) — replaces `<PriceChart>` when `manualOverride !== null`. Shows large dollar value, "Manual price · set 2026-04-15" caption, Edit + Clear buttons.

- **`<ManualPriceBadge>`** (`components/prices/ManualPriceBadge.tsx`) — tiny pill, Plan 6 muted-accent token. Shown wherever a manually-overridden price displays.

### 8.2 Extended components

| Component | Changes |
|---|---|
| `<HoldingsGrid>` card | Add `<DeltaPill>` under P&L footer. Add `<ManualPriceBadge>` next to market price. |
| `<DashboardPerformersCard>` row | Add `<DeltaPill>` (small variant). Add `<ManualPriceBadge>`. |
| `<DashboardTotalsCard>` | Add portfolio `<DeltaPill>` below "Current value". Add `<RefreshHeldButton>` in header. |
| `<HoldingDetailClient>` | Add `<DeltaPill>` to header. Add `<PriceChart>` (or `<ManualPricePanel>`) below header. Add `<SetManualPriceDialog>` launcher. |
| `/catalog/[id]` detail page | Add `<SetManualPriceDialog>` launcher. Add `<ManualPriceBadge>`. |
| Search result card | Add `<ManualPriceBadge>`. |

### 8.3 Hooks

- `useCatalogHistory(catalogItemId, range)` — query for `/api/catalog/[id]/history`. **No polling** — single-fetch.
- `useRefreshHeld()` — mutation for `/api/prices/refresh-held`, invalidates holdings + dashboard.
- `useSetManualPrice(catalogItemId)` / `useClearManualPrice(catalogItemId)` — mutations for POST/DELETE manual-price.

## 9. Edge cases (decisions locked)

1. **TCGCSV outage / per-group fetch fails.** Daily cron: per-group failures counted in `refresh_runs.failed`; whole job remains `'partial'` if ≥ 1 success, `'failed'` if zero. No automatic recovery for missed days; running the cron again the next day picks up fresh data.

2. **Manual override + cron.** Cron always inserts `source='tcgcsv'` rows when TCGCSV has data, even for overridden items (chart shows both lines). Cron does NOT update `last_market_cents` if `manual_market_cents IS NOT NULL`. Clearing manual override leaves existing `source='manual'` rows in chart history.

3. **Items never in TCGCSV.** Cron silently skips. `last_market_cents` stays NULL. User can set manual override → `<ManualPricePanel>` displays. If TCGCSV later starts covering it, both lines coexist.

4. **Sparse data + delta.** Items with < 7d history → `delta7dCents` returns null → `<DeltaPill>` shows "— 7d". Portfolio-level delta excludes null-delta items; caption notes "Based on N of M holdings."

5. **StalePill (Plan 4) still works.** Cron keeps `last_market_at` < 24h for everything TCGCSV covers — pill almost never fires for those. Discontinued SKUs age naturally past 7d and trigger StalePill. Manually-overridden items don't expire.

6. **Refresh-all-held with empty portfolio.** `{ itemsRefreshed: 0 }`, no error.

7. **Newly-indexed items.** First snapshot lands on the next 21:00 UTC cron run. Chart shows "Tracking starts soon" until then; delta7d is null until day 8.

## 10. Testing

### 10.1 Service unit tests

- `lib/services/price-deltas.ts` — 6 tests (already shipped in T3).
- `lib/services/tcgcsv-archive.ts` — 5 tests for the pure parser (already shipped in T2). Will be extended/replaced when refactored to use papaparse for quoted-cell handling.
- `lib/services/tcgcsv-live.ts` — 4-5 tests for fetch + parse aggregation (group list fetch, per-group fetch, throttle behavior, partial-failure tolerance).
- `lib/services/price-snapshots.ts` — 4 tests (insert new, ON CONFLICT update, skip-manual gate, partial-batch failure isolation).

### 10.2 Route integration tests

- `/api/cron/refresh-prices` — 4 tests (auth, happy path, partial group failures, manual-override skip).
- `/api/prices/refresh-held` — 3 tests (held-only scope, debounce ignored server-side, empty portfolio).
- `/api/catalog/[id]/history` — 3 tests (range filter, manual-override response, sparse → empty points).
- `/api/catalog/[id]/manual-price` — 4 tests (POST sets columns + market_prices row, DELETE clears columns + leaves history, validation, auth).
- Extended `/api/holdings`, `/api/dashboard/totals`, `/api/holdings/[id]` — 3 tests covering delta + manual fields.

### 10.3 Component + hook tests

- `<DeltaPill>`, `<ManualPriceBadge>`, `<ManualPricePanel>`, `<RefreshHeldButton>`, `<SetManualPriceDialog>`, `<PriceChart>` — 1 file each, ~3 tests.
- No polling-while-pending hook test; chart no longer polls.

### 10.4 Manual smoke

After cron deploy: trigger via Vercel dashboard "Run now"; verify rows in `market_prices` for ~10 random catalog items; verify dashboard delta pill renders empty (no 7d history yet); verify chart on a held item renders empty state.

After 7+ days: chart populates; delta pill shows real numbers.

**Total: ~40 new tests.** Brings total from 296 (post-Plan 6) to ~336.

## 11. Out of scope

Explicitly deferred or impossible:

- **Historical price backfill.** TCGCSV has no archive. Could be added later via:
  - Building our own daily snapshot history into a separate archive over time (we already do this from day 1; in 6 months a chart with 6 months of history exists naturally).
  - Integrating a paid historical-data provider (PriceCharting Premium, Cardmarket, etc.) — out of scope.
- Range bands (low/high shaded around market line) — schema supports it; UI is YAGNI for v1.
- Auto-recovery of missed cron days from a multi-day TCGCSV outage.
- Per-user manual price override (multi-user mode).
- Multi-source pricing (PriceCharting fallback) — schema supports it via `source` CHECK; ingestion not built.
- Sanity-check filters on TCGCSV outlier prices.
- Push notifications when a held item's price moves > N%.
- Holding-detail-page 6-query waterfall (pre-existing perf issue).

## 12. Migrations + deploy steps

1. Apply SQL migration `20260430000001_pricing_automation.sql` via Supabase SQL editor.
2. Deploy code to Vercel main branch.
3. Set `CRON_SECRET` env var in Vercel project settings.
4. Verify Vercel Cron registered: dashboard → Settings → Cron Jobs.
5. Trigger a manual cron run via "Run now" button. Verify ~10 random `market_prices` rows for today's date.
6. Open dashboard, confirm `<RefreshHeldButton>` works. Open a held item, confirm chart renders empty state ("Tracking starts soon").
7. Wait a week, verify charts populate.

## 13. Rollback

- Cron failure: disable in `vercel.json`, redeploy. `last_market_cents` stays at last successful refresh; chart history persists; nothing user-facing breaks.
- Schema rollback: drop the new columns. Application falls back to Plan 6 behavior cleanly because all new fields are additive (existing routes return them as optional).
