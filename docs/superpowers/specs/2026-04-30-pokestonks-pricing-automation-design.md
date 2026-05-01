# Plan 7 — Pricing Automation + History (Design Spec)

**Date:** 2026-04-30
**Status:** Brainstormed and approved; ready for implementation plan.

## 1. Goal

Replace the current on-demand-only pricing flow with a system that keeps the entire portfolio's prices < 24h fresh automatically, gives every catalog item a multi-month chart on first view (Collectr-grade availability), surfaces 7d delta indicators across portfolio surfaces, and supports manual price override for vending-only SKUs not covered by TCGCSV.

## 2. Scope (locked)

All five items from the Plan 7 backlog ship together:

1. Daily price snapshot cron writing to a new `market_prices` time-series table.
2. Price chart (1M / 3M / 6M / 12M / MAX) on holding detail page.
3. Delta indicators (7d window) on dashboard + holdings grid.
4. Refresh-all-held action.
5. Manual price override.

## 3. Architecture

The system has four moving parts:

1. **Daily snapshot cron** (Vercel Cron, runs `0 6 * * *` = 06:00 UTC). Single archive zip download from TCGCSV → bulk upsert into `market_prices` → update `catalog_items.last_market_cents` for non-overridden rows.
2. **Initial archive backfill** (one-shot script, run once at Plan 7 deploy). Pulls 365 days of archive zips, populates `market_prices` for everything in `catalog_items` at deploy time. Sets `backfill_completed_at = NOW()` for those rows.
3. **Lazy per-item backfill** (async background job, triggered when a chart loads on a < 30d-history item). 90-day archive pull for one item, runs in `waitUntil()`. Chart polls history endpoint while in flight.
4. **Manual override + refresh-all-held actions** (small REST surfaces). Both write through `market_prices`.

### 3.1 Boundaries

- `lib/services/tcgcsv-archive.ts` — fetch + parse archive zips. No DB. Shared by all four TCGCSV-fetching paths (daily cron, initial backfill, lazy per-item backfill, refresh-all-held). Manual override doesn't use it.
- `lib/services/price-snapshots.ts` — DB writes (insert/upsert into `market_prices`, update `catalog_items`). No fetch.
- `lib/services/price-deltas.ts` — pure: takes `market_prices` rows + a window, returns `delta7d` summaries.
- `lib/services/prices.ts` — pure CSV row → typed price point parser. No fetch, no DB.
- API routes glue these together; UI consumes via TanStack Query hooks.

### 3.2 Data flow

- Cron reads TCGCSV archive zip → upserts `market_prices` → updates `catalog_items.last_market_cents` + `last_market_at` for rows where `manual_market_cents IS NULL`.
- Backfill scripts read TCGCSV archive → insert older `market_prices` rows. Don't touch `last_market_cents`.
- Manual override writes `catalog_items.manual_market_cents` + `manual_market_at` + a single row in `market_prices` with `source='manual'`. Display layer prefers `manual_market_cents` over `last_market_cents` whenever both exist.
- Chart UI reads `/api/catalog/[id]/history?range=...` from `market_prices`. Manual entries marked.
- Delta UI reads new fields on `/api/holdings` and `/api/dashboard/totals`.

## 4. Schema

One SQL migration: `supabase/migrations/20260430000001_pricing_automation.sql`. Applied manually via Supabase SQL editor. Drizzle TS schema updated to match for query typing — no `drizzle-kit push`.

```sql
-- 1. Time-series price snapshots
CREATE TABLE market_prices (
  id BIGSERIAL PRIMARY KEY,
  catalog_item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  market_cents INTEGER,
  low_cents INTEGER,
  mid_cents INTEGER,
  high_cents INTEGER,
  source TEXT NOT NULL DEFAULT 'tcgcsv',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_prices_source_check CHECK (source IN ('tcgcsv', 'manual')),
  CONSTRAINT market_prices_unique UNIQUE (catalog_item_id, snapshot_date, source)
);

CREATE INDEX market_prices_item_date_idx
  ON market_prices (catalog_item_id, snapshot_date DESC);

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_prices read for authenticated"
  ON market_prices FOR SELECT TO authenticated USING (true);

-- (No write policy for authenticated; service_role bypasses RLS.)

-- 2. Manual override columns on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN manual_market_cents INTEGER,
  ADD COLUMN manual_market_at TIMESTAMPTZ;

-- 3. Backfill state on catalog_items
ALTER TABLE catalog_items
  ADD COLUMN backfill_completed_at TIMESTAMPTZ;
-- NULL = backfill not done; non-NULL = lazy/initial backfill complete.
```

### 4.1 Drizzle schema

- New file `lib/db/schema/market-prices.ts` defining the table.
- `lib/db/schema/catalog-items.ts` extended with three new column definitions.
- Both wired into `lib/db/schema/index.ts`.

### 4.2 Schema notes

- `snapshot_date` is DATE (not timestamp). One row per product per day per source. Idempotent re-runs via `INSERT ... ON CONFLICT (catalog_item_id, snapshot_date, source) DO UPDATE`.
- `source` is a CHECK constraint, not a Postgres enum, so a future `'pricecharting'` source needs only a constraint replacement, not an `ALTER TYPE`.
- `ON DELETE CASCADE` on the FK because catalog items occasionally get hard-deleted (e.g., the 168-row 'normal' delete from Plan 2 capstone).
- `manual_market_cents` is on `catalog_items` globally (single-user app). Multi-user mode would need a per-user override table — out of scope.
- `backfill_completed_at` is a nullable timestamp, not an enum. Two states: needs backfill (NULL) or done.

## 5. Cron + jobs

### 5.1 Daily snapshot cron

- **Schedule:** `0 6 * * *` (06:00 UTC). TCGCSV publishes ~midnight UTC; 06:00 gives buffer for the archive zip to be packaged.
- **Route:** `app/api/cron/refresh-prices/route.ts` (GET).
- **Auth:** `Authorization: Bearer ${CRON_SECRET}`. Vercel injects this header automatically when `CRON_SECRET` is set in project env.
- **`vercel.json`:**
  ```json
  {
    "crons": [
      { "path": "/api/cron/refresh-prices", "schedule": "0 6 * * *" }
    ]
  }
  ```
- **What it does:**
  1. Verify CRON_SECRET; return 401 otherwise.
  2. `GET https://tcgcsv.com/archive/tcgcsv/{YYYY-MM-DD}.zip` for today's date.
  3. If 404, retry once with yesterday's date. If that also 404s, return 502 + log; tomorrow's run picks up.
  4. Parse zip → `Map<tcgplayer_product_id, ArchivePriceRow>`.
  5. SELECT all `catalog_items` with non-null `tcgplayer_product_id`.
  6. For each catalog item with a TCGCSV match:
     - `INSERT INTO market_prices ... ON CONFLICT (catalog_item_id, snapshot_date, source) DO UPDATE` for today's row.
     - If `manual_market_cents IS NULL`: `UPDATE catalog_items SET last_market_cents = ?, last_market_at = NOW()`.
  7. Return `{ snapshotsWritten, itemsUpdated, itemsSkippedManual, durationMs }`.
- **Failure handling:** Per-row errors caught individually, logged, batch continues. Idempotent re-run safe.

### 5.2 Initial archive backfill (`scripts/backfill-prices.ts`)

- Run once at Plan 7 deploy via `npm run backfill-prices`. Not on a cron.
- Reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.
- Iterates 365 days backwards from yesterday.
- For each date: fetch archive zip, parse, match to `catalog_items`, bulk upsert into `market_prices`.
- Throttled to 4 parallel zip downloads via `pLimit(4)`.
- After loop completes successfully: `UPDATE catalog_items SET backfill_completed_at = NOW()` for every row currently in the table.
- Resumable: re-running picks up from wherever the UNIQUE constraint says we're missing days.
- Per-date 404s are tolerated — log + skip.

### 5.3 Lazy per-item backfill

- **Route:** `POST /api/catalog/[id]/backfill` — auth: any signed-in user.
- Returns 200 immediately with `{ status: 'queued' | 'completed' | 'not-needed' }`.
- Spawns work via Vercel's `waitUntil()`. Pulls last 90 days of archive, locates the catalog item by `tcgplayer_product_id`, inserts rows.
- On completion: `UPDATE catalog_items SET backfill_completed_at = NOW() WHERE id = ?`.
- **Trigger from chart UI:** `<PriceChart>` mounts; if `backfill_completed_at IS NULL`, hook calls this route and polls `GET /api/catalog/[id]/history?range=3M` every 10s until ≥ 7 data points or 60s elapses.

### 5.4 Refresh-all-held

- **Route:** `POST /api/prices/refresh-held` — auth: any signed-in user.
- Looks up the user's held catalog item ids (anything with open lots).
- Same archive-zip + upsert path as the daily cron, scoped to those item ids only.
- Bounded by portfolio size; typically < 2s.
- Returns `{ itemsRefreshed, durationMs, refreshedAt }`.
- Soft debounce: client tracks `lastRefreshedAt` in localStorage; button disabled if < 60s ago. No server-side cooldown.

### 5.5 Shared archive service (`lib/services/tcgcsv-archive.ts`)

```typescript
export async function fetchArchiveSnapshot(date: Date): Promise<{
  date: string;
  prices: Map<number, ArchivePriceRow>;
}>;

export async function persistSnapshot(
  db: DrizzleDb,
  date: string,
  prices: Map<number, ArchivePriceRow>,
  catalogItems: { id: string; tcgplayerProductId: number }[],
  options: { source: 'tcgcsv' | 'manual'; updateLastMarket: boolean }
): Promise<{ rowsWritten: number }>;

export async function snapshotForItems(
  catalogItemIds: string[],
  options: { date?: Date }
): Promise<{ rowsWritten: number; itemsUpdated: number; itemsSkippedManual: number }>;
```

Daily cron (5.1), refresh-all-held (5.4), and the two backfill paths (5.2, 5.3) all call this service.

### 5.6 Tier consideration

Vercel Hobby = 10s function timeout; Pro = 60s. The archive zip strategy keeps the daily cron under ~5s on either tier. User-triggered routes are bounded by portfolio size and easily fit. Lazy backfill via `waitUntil()` has a ~30s ceiling; ~7s typical.

## 6. API surface

### 6.1 New routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/cron/refresh-prices` | GET | `CRON_SECRET` | Daily cron entry |
| `/api/prices/refresh-held` | POST | User session | Refresh-all-held action |
| `/api/catalog/[id]/backfill` | POST | User session | Trigger lazy 90-day backfill |
| `/api/catalog/[id]/history` | GET | User session | Chart data + manual + backfill state |
| `/api/catalog/[id]/manual-price` | POST / DELETE | User session | Set / clear manual override |

### 6.2 Response shapes

**`GET /api/catalog/[id]/history?range=1M|3M|6M|12M|MAX`**

```typescript
{
  range: '3M',
  points: [
    { date: '2026-01-30', marketCents: 4250, lowCents: 4100, highCents: 4400, source: 'tcgcsv' },
    ...
  ],
  backfillState: 'pending' | 'completed' | 'not-needed',
  manualOverride: { cents: 5000, setAt: '2026-04-15T...' } | null
}
```

`MAX` drops the date floor. `backfillState` derived from `catalog_items.backfill_completed_at` plus the count of returned points.

**`POST /api/prices/refresh-held`** → `{ itemsRefreshed, durationMs, refreshedAt }`

**`POST /api/catalog/[id]/backfill`** → `{ status: 'queued' | 'completed' | 'not-needed' }`

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

`lib/services/price-deltas.ts`:

```typescript
export async function computeDeltasForItems(
  db: DrizzleDb,
  catalogItemIds: string[],
  windowDays: number = 7
): Promise<Map<string, { deltaCents: number | null; deltaPct: number | null }>>;
```

One query: latest `market_prices` row per item + subquery for the most recent row at or before `CURRENT_DATE - windowDays`. Returns null when `then` is null (item has < windowDays of history) or zero (avoids divide-by-zero in pct).

Portfolio-level delta: same shape over portfolio value (sum of `qty × marketCents` at "now" and "then"). Caption notes "Based on N of M holdings" if any holdings have null delta.

For items with manual override: "now" uses `manual_market_cents`. "then" uses the most recent `market_prices` row for the item with `source IN ('tcgcsv', 'manual')` at or before `CURRENT_DATE - windowDays`.

## 7. Search behavior

After Plan 7, the search flow stays largely unchanged:

- Search reads from `last_market_cents` / `last_market_at` on `catalog_items`.
- The daily cron now keeps these < 24h fresh. No per-search auto-fetch.
- Search still falls through to TCGCSV when there are no local hits at all (auto-indexing path for new items, unchanged from Plan 2 capstone).
- Newly-indexed items get `backfill_completed_at = NULL`. The lazy backfill fires when the user opens that item's chart.
- The existing `RefreshButton` stays — same job as today, force-fetch upstream.
- "Updated N min ago" caption now reads from the cron's freshness; will essentially always say something < 24h.

## 8. UI

### 8.1 New components

- **`<PriceChart>`** (`components/charts/PriceChart.tsx`) — custom SVG, ~250 LOC. Plan 6 visual language. Range toggle 1M / 3M / 6M / 12M / MAX (default 3M). Hover tracker line + tooltip showing date + market/low/high. Empty state for sparse items. Switches to `<ManualPricePanel>` if `manualOverride !== null`. Polls history every 10s when `backfillState === 'pending'`, transitions to full chart when ≥ 7 points or 60s elapses.

- **`<DeltaPill>`** (`components/prices/DeltaPill.tsx`) — atom: `{ deltaCents, deltaPct, windowLabel = '7d' }`. Variants: positive (green token), negative (red), zero/null (muted). Format: `+$3.50 (+8.2%) 7d` / `−$1.20 (−2.8%) 7d` / `— 7d`.

- **`<RefreshHeldButton>`** (`components/prices/RefreshHeldButton.tsx`) — sits in DashboardTotalsCard header. Reads `lastRefreshedAt` from localStorage; disabled if < 60s ago. Click → `POST /api/prices/refresh-held` → invalidates `['holdings']`, `['dashboard']` query keys. Loading spinner + "Refreshed N min ago" caption.

- **`<SetManualPriceDialog>`** (`components/prices/SetManualPriceDialog.tsx`) — Vault chrome (`<VaultDialogHeader>`, `FormSection`, `FormRow`, `DialogActions`). Per-unit price input with FP-safe `dollarsStringToCents` from `lib/utils/cents.ts`. Submit → `POST /api/catalog/[id]/manual-price`. "Clear override" button (calls `DELETE`) when item already has an override.

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

- `useCatalogHistory(catalogItemId, range)` — query for `/api/catalog/[id]/history`, with auto-poll-while-pending semantics.
- `useTriggerBackfill(catalogItemId)` — mutation for `/api/catalog/[id]/backfill`.
- `useRefreshHeld()` — mutation for `/api/prices/refresh-held`, invalidates holdings + dashboard.
- `useSetManualPrice(catalogItemId)` — mutation for POST/DELETE manual-price, invalidates holdings + dashboard + history.

## 9. Edge cases (decisions locked)

1. **TCGCSV outage / archive 404.** Daily cron: 502 + log; tomorrow retries. Backfill: per-date 404s tolerated, skip + log + continue. No automatic recovery for missed cron days; manual `npm run backfill-prices` for the gap.

2. **Manual override + cron.** Cron always inserts `source='tcgcsv'` rows when TCGCSV has data, even for overridden items (chart shows both lines). Cron does NOT update `last_market_cents` if `manual_market_cents IS NOT NULL`. Clearing manual override leaves existing `source='manual'` rows in chart history.

3. **Backfill resumability + concurrent runs.** All backfills idempotent via UNIQUE. Concurrent backfills for same item → both run, ON CONFLICT no-ops on duplicates. Route-level guard (`backfill_completed_at IS NOT NULL → return early`) reduces likelihood of duplicate work.

4. **Items never in TCGCSV.** Cron silently skips. `last_market_cents` stays NULL. User can set manual override → `<ManualPricePanel>` displays. If TCGCSV later starts covering it, both lines coexist.

5. **Sparse data + delta.** Items with < 7d history → `delta7dCents` returns null → `<DeltaPill>` shows "— 7d". Portfolio-level delta excludes null-delta items; caption notes "Based on N of M holdings."

6. **StalePill (Plan 4) still works.** Cron keeps `last_market_at` < 24h for everything TCGCSV covers — pill almost never fires for those. Discontinued SKUs age naturally past 7d and trigger StalePill. Manually-overridden items don't expire (manual price is "current until cleared").

7. **`waitUntil()` ceiling for lazy backfill.** 90 zips × pLimit(4) ≈ 7s typical. Comfortable under 30s. Slow TCGCSV day → may timeout; idempotent retry on next chart open.

8. **Refresh-all-held with empty portfolio.** `{ itemsRefreshed: 0 }`, no error. Caption shows "Refreshed just now."

## 10. Testing

### 10.1 Service unit tests

- `lib/services/price-deltas.ts` — 6 tests (empty, full, sparse-then, zero-then, manual-override-as-now, tie-break)
- `lib/services/tcgcsv-archive.ts` — 5 tests (parse OK, malformed CSV, 404 → throws, source filter, throttle behavior)
- `lib/services/price-snapshots.ts` — 4 tests (insert new, ON CONFLICT update, skip-manual gate, partial-batch failure isolation)

### 10.2 Route integration tests

- `/api/cron/refresh-prices` — 4 tests (auth, happy path, TCGCSV outage, manual-override skip)
- `/api/prices/refresh-held` — 3 tests (held-only scope, debounce ignored server-side, empty portfolio)
- `/api/catalog/[id]/backfill` — 3 tests (queues correctly, no-op when completed, returns immediately)
- `/api/catalog/[id]/history` — 4 tests (range filter, manual-override response, backfill state, sparse → empty points)
- `/api/catalog/[id]/manual-price` — 4 tests (POST sets columns + market_prices row, DELETE clears columns + leaves history, validation, auth)
- Extended `/api/holdings`, `/api/dashboard/totals`, `/api/holdings/[id]` — 3 tests covering delta + manual fields

### 10.3 Component + hook tests

- `<PriceChart>`, `<DeltaPill>`, `<RefreshHeldButton>`, `<SetManualPriceDialog>`, `<ManualPricePanel>`, `<ManualPriceBadge>` — 1 file each, ~3-4 tests
- `useCatalogHistory` polling-while-pending — 1 file, 2 tests

### 10.4 Manual smoke

After cron deploy: trigger via Vercel dashboard "Run now"; verify rows in `market_prices` for ~10 random catalog items; verify dashboard delta pill renders; verify chart renders on a held item.

**Total: ~50 new tests.** Brings total from 296 (post-Plan 6) to ~346.

## 11. Out of scope

Explicitly deferred to later plans:

- Range bands (low/high shaded around market line) — schema supports it; UI is YAGNI for v1.
- Auto-recovery of missed cron days from a multi-day TCGCSV outage.
- Per-user manual price override (multi-user mode).
- Multi-source pricing (e.g., PriceCharting fallback) — schema supports it via `source` CHECK; ingestion not built.
- Sanity-check filters on TCGCSV outlier prices (e.g., $0 or $99999).
- Push notifications when a held item's price moves > N% — would need an alert system.
- Holding-detail-page 6-query waterfall (pre-existing perf issue, doesn't block this work).

## 12. Migrations + deploy steps

1. Apply SQL migration `20260430000001_pricing_automation.sql` via Supabase SQL editor.
2. Deploy code to Vercel main branch.
3. Set `CRON_SECRET` env var in Vercel project settings.
4. Run `npm run backfill-prices` from local against production Supabase service-role to populate 365 days of history.
5. Verify Vercel Cron registered: dashboard → Settings → Cron Jobs.
6. Trigger a manual cron run via "Run now" button. Verify ~10 random `market_prices` rows.
7. Open dashboard, confirm delta pill renders. Open a held item, confirm chart renders.

## 13. Rollback

- Cron failure: disable in `vercel.json`, redeploy. `last_market_cents` stays at last successful refresh; chart history persists; nothing user-facing breaks.
- Schema rollback: drop the new columns + table. Application falls back to Plan 6 behavior cleanly because all new fields are additive (existing routes return them as optional).
- Bad initial backfill: rerun is idempotent. To fully nuke history, `DELETE FROM market_prices` then rerun.
