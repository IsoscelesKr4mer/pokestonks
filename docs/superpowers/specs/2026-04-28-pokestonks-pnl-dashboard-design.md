# Pokestonks Plan 4 — P&L + Dashboard Design Spec

**Date:** 2026-04-28
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan:** 4 (continuation of Plan 3.5 Box Decomposition; Plan 5 Sales + FIFO is the next major plan)

## 1. Purpose

Plans 1 through 3.5 built the catalog, search, purchases, rip flow, and box decomposition. The user can record what they bought, what they paid, and what they ripped. They cannot yet see whether they are up or down on it.

Plan 4 surfaces **unrealized P&L** everywhere the cost basis already shows — dashboard, holdings grid, holding detail page. It uses the `last_market_cents` column already populated on `catalog_items` (Plan 2 capstone) as the live price; no new tables, no daily cron, no time-series. Plan 6 (Polish + Automation) layers history and charts on top later.

After Plan 4 ships, the dashboard answers the questions Michael actually opens the app to ask:

- What is my portfolio worth right now?
- Am I up or down, and by how much?
- Which holdings are pulling me up the most? Down the most?
- Which prices are stale and need a refresh?

## 2. Non-Goals

- **Time-series price history.** No `market_prices` writes. The `market_prices` table stays unused until Plan 6.
- **Daily price refresh cron.** Vercel cron and idempotency tracking are Plan 6.
- **Price charts (sparkline, 1M / 3M / 6M / 12M / MAX).** Plan 6.
- **Delta indicators ("+$99.87 (9.32%) since 7 days ago").** Requires history; Plan 6.
- **Realized sales P&L.** Plan 5 ships sales + FIFO matching. Plan 4 keeps the existing realized-rip-loss line and adds nothing else to the realized side.
- **Refresh-all-held action.** Per-search refresh (Plan 2 capstone) and per-item refresh from the catalog detail page already cover the access point. If it bites in practice we add a portfolio-wide refresh in Plan 6 alongside the cron.
- **% display when cost basis is zero.** Doesn't happen in practice (every purchase has a positive `cost_cents`), so no special-case render needed.
- **Per-condition / per-grade price separation for graded cards.** Plan 4 reads the single `last_market_cents` column on the catalog item. Graded card P&L uses the same number as raw; refinement waits until graded pricing is meaningful.

## 3. Decisions Locked During Brainstorming

| Question | Decision |
|---|---|
| Pricing source for unrealized P&L? | `catalog_items.last_market_cents` already populated by Plan 2 capstone. No new fetches in the P&L path. |
| Unpriced items (`last_market_cents IS NULL`)? | Excluded from current value, P&L, and best/worst lists. Surfaced as an `unpricedCount` on the dashboard ("Unpriced: N"). Per-row "Unpriced" badge on holdings grid + holding detail. |
| Stale price threshold? | 7 days. Beyond `now - last_market_at > 7 days`, the row gets a subtle "Stale" pill that links to the catalog detail page where a refresh button already exists. Items still count toward current value and P&L while stale. |
| Best / worst performers count? | Top 3 + bottom 3 by **absolute $ P&L** (not %). Excludes unpriced items. If fewer than 3 priced holdings exist, the section just shows what's there; if zero, the section is hidden. |
| % vs $ display? | Both. Format: `+$1,234.56 (+12.3%)` with sign and color (green positive, red negative). Pure dollar P&L drives sort; percent is shown for context. |
| What counts as "current value"? | `qty_held × last_market_cents` summed across priced holdings only. Cost basis and current value are reported on different denominators (cost basis includes unpriced; current value does not). The displayed P&L uses the **priced-only cost basis** as its denominator so the percentage is honest. |
| Realized P&L line? | Keep existing rip realized loss exactly as it is (`SUM(rips.realized_loss_cents)`). Plan 5 adds sales realized P&L; this plan does not pre-shape the field for it. |
| Card vs sealed P&L treatment? | Identical. Both kinds use `last_market_cents`. Cards from rips have their cost basis already split correctly by the rip flow; sealed boxes that have been decomposed already had cost basis split to packs. Plan 4 just sums what's there. |
| Where does P&L math live? | New `lib/services/pnl.ts`, pure function over the existing `Holding[]` shape from `aggregateHoldings()`. Holdings stays focused on qty + cost; pnl handles market value + delta. Single source of truth, fully unit tested per CLAUDE.md convention. |
| Compute server-side or client-side? | Server-side in the API route, returned as a structured DTO. Reasoning: dashboard fetches a single endpoint and gets a render-ready shape; client doesn't reimplement the math; tests target one function. |
| Should `aggregateHoldings()` change? | Yes, minimally — its `Holding` type already carries `lastMarketCents`. Plan 4 adds `lastMarketAt` to the `RawCatalogItem` and `Holding` types so staleness can be computed downstream. The aggregation logic itself doesn't change. |

## 4. Schema Changes

**No migrations.** All required columns exist:

- `catalog_items.last_market_cents` (Plan 2 capstone, migration 0003)
- `catalog_items.last_market_at` (Plan 2 capstone, migration 0003)

The only schema-adjacent work is making sure every read path that already selects `last_market_cents` also selects `last_market_at`. This affects:

- `app/api/holdings/route.ts` — add `last_market_at` to the catalog_item select
- `app/(authenticated)/holdings/page.tsx` — same
- `app/api/holdings/[catalogItemId]/route.ts` — add to the item DTO
- `app/(authenticated)/holdings/[catalogItemId]/page.tsx` — same
- `app/api/dashboard/totals/route.ts` — switch from raw aggregation to using `aggregateHoldings()` + `computePortfolioPnL()`

`lib/services/holdings.ts` types extended:

```ts
export type RawCatalogItem = {
  // ...existing
  last_market_at: string | null;  // ISO timestamp
};

export type Holding = {
  // ...existing
  lastMarketAt: string | null;
};
```

`aggregateHoldings()` body change is one extra line of plumbing in two places (the existing branch and the new-acc branch).

## 5. Service Layer — `lib/services/pnl.ts`

Pure function, no DB, no fetches. Takes the holdings array and a "now" timestamp (injected for testability), returns the dashboard DTO.

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
  totalInvestedCents: number;
  // Null when unpriced.
  currentValueCents: number | null;
  pnlCents: number | null;
  pnlPct: number | null;            // null if cost basis is zero (defensive)
  priced: boolean;
  stale: boolean;                   // priced but last_market_at older than 7 days
};

export type PortfolioPnL = {
  totalInvestedCents: number;       // all holdings, priced + unpriced
  pricedInvestedCents: number;      // priced holdings only (denominator for pnlPct)
  totalCurrentValueCents: number;   // priced holdings only
  unrealizedPnLCents: number;       // priced holdings only
  unrealizedPnLPct: number | null;  // null if pricedInvestedCents === 0
  realizedRipPnLCents: number;      // signed; -SUM(rips.realized_loss_cents)
  pricedCount: number;
  unpricedCount: number;
  staleCount: number;
  perHolding: HoldingPnL[];
  bestPerformers: HoldingPnL[];     // top 3 priced by pnlCents desc
  worstPerformers: HoldingPnL[];    // bottom 3 priced by pnlCents asc
  lotCount: number;                 // existing field, preserved
};

export const STALE_PRICE_THRESHOLD_DAYS = 7;

export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,    // raw sum from rips table; we negate inside
  lotCount: number,
  now: Date = new Date()
): PortfolioPnL;
```

### 5.1 Math

Per holding:

```
currentValue = lastMarketCents == null ? null : lastMarketCents * qtyHeld
pnl          = lastMarketCents == null ? null : currentValue - totalInvestedCents
pnlPct       = (pnl != null && totalInvestedCents > 0) ? (pnl / totalInvestedCents) * 100 : null
priced       = lastMarketCents != null
stale        = priced && lastMarketAt != null && (now - lastMarketAt) > 7 * 86_400_000 ms
               (a priced holding with lastMarketAt === null is treated as stale; defensive)
```

Portfolio rollup:

```
totalInvested        = SUM(h.totalInvestedCents)                       // all
pricedInvested       = SUM(h.totalInvestedCents WHERE priced)
totalCurrentValue    = SUM(h.currentValueCents WHERE priced)
unrealizedPnL        = totalCurrentValue - pricedInvested
unrealizedPnLPct     = pricedInvested > 0 ? (unrealizedPnL / pricedInvested) * 100 : null
realizedRipPnL       = -realizedRipLossCents                           // sign flip: loss table -> P&L sign
```

Sign convention: P&L is positive when in profit. The `rips.realized_loss_cents` column stores positive numbers when there was a loss (rip yielded less than pack cost) and negative when there was a "win" — Plan 4's display flips this so positive = good across the entire UI. The existing `DashboardTotalsCard` already does this flip for a different reason; Plan 4 centralizes it in `computePortfolioPnL`.

### 5.2 Best / Worst selection

```
priced = perHolding.filter(h => h.priced)
sortedDesc = priced.sortBy(h => h.pnlCents, desc)
bestPerformers  = sortedDesc.slice(0, 3)
worstPerformers = priced.sortBy(h => h.pnlCents, asc).slice(0, 3)
```

Edge cases:
- Best and worst can overlap when fewer than 6 priced holdings exist. UI dedupes by showing best on top and worst on bottom; if there's overlap, that's just an honest reflection of a small portfolio. We do not artificially split.
- Ties broken by `qtyHeld` desc, then `catalogItemId` asc, for stable display order.

### 5.3 Tests — `lib/services/pnl.test.ts`

| Case | Assertion |
|---|---|
| Empty holdings | All totals 0; perHolding/best/worst are []; pnlPct null. |
| All unpriced | currentValue 0, pnl 0, pricedInvested 0, pnlPct null, unpricedCount > 0. |
| Mixed priced + unpriced | Cost basis includes both; current value + pnl exclude unpriced; unpricedCount accurate. |
| Negative P&L | pnlCents negative, pnlPct negative; worstPerformers correct. |
| Mix of gainers and losers | bestPerformers all positive (or zero), worstPerformers all negative (or zero), correctly sorted. |
| Fewer than 3 priced holdings | best/worst arrays length matches priced count; no padding. |
| Stale price detection | lastMarketAt > 7d old → stale=true; ≤ 7d → stale=false; null → stale=true (defensive). |
| Stale priced holding still counts | Stale items contribute to currentValue and pnl. |
| Realized rip P&L sign flip | Pass realizedRipLossCents=500 → realizedRipPnLCents=-500; pass -200 → +200. |
| Tie-breaking | Two holdings with identical pnlCents — sorted by qtyHeld desc then catalogItemId asc. |
| Cost basis zero (defensive) | Holding with cost=0, market>0 → pnlPct null, pnlCents = currentValue (positive). Doesn't crash. |

## 6. API Changes

### 6.1 `GET /api/dashboard/totals` — full rewrite

Currently returns `{ totalInvestedCents, totalRipLossCents, lotCount }`. Replaces with the full `PortfolioPnL` shape from Section 5.

Implementation:

```
1. Fetch purchases (with catalog_item including last_market_cents + last_market_at)
2. Fetch rips
3. Fetch decompositions
4. holdings = aggregateHoldings(purchases, rips, decompositions)
5. realizedRipLossCents = SUM(rips.realized_loss_cents)
6. lotCount = purchases.length (kept for parity with existing callers)
7. return computePortfolioPnL(holdings, realizedRipLossCents, lotCount, new Date())
```

The `useDashboardTotals` hook's return type changes to `PortfolioPnL`. All consumers update at the same time (only `DashboardTotalsCard` today; Plan 4 adds `DashboardPerformersCard`).

Backwards-compat: not preserved. This is a single-user app; we change the shape and the consumers in one PR.

### 6.2 `GET /api/holdings` — add per-row P&L

Currently returns `{ holdings: Holding[] }`. Plan 4 returns `{ holdings: HoldingPnL[] }` instead. Server-side: route runs `aggregateHoldings()` then maps each holding through the same per-holding math from `computePortfolioPnL` (extracted into `computeHoldingPnL(holding, now)` for reuse).

`HoldingsGrid` and `useHoldings` typings update.

### 6.3 `GET /api/holdings/[catalogItemId]` — pass through P&L on the holding summary

The existing route returns a `holding` summary block. Plan 4 widens it to a `HoldingPnL`-shaped object (same field set as the grid). Per-lot P&L is computed client-side from `lot.costCents`, `lot.quantity` minus consumed, and the holding's `lastMarketCents` (which is also what `currentValueCents / qtyHeld` resolves to, since current value is just `lastMarketCents × qtyHeld`) — see Section 7.4.

Item DTO gains `lastMarketAt` so the detail page can show staleness on the header.

### 6.4 No new endpoints

Refresh-all-held is deferred. Per-search refresh and per-item catalog refresh already exist.

## 7. UI Changes

### 7.1 `DashboardTotalsCard` — replaces 1-line layout with a 4-stat strip

Layout (top of `/`):

```
Card
├─ "Portfolio"
├─ Stat row (4 columns on md+, 2x2 on mobile):
│   ├─ Invested
│   │    $5,432.10
│   ├─ Current value
│   │    $6,109.55       <-- if pricedInvested === 0, show "—"
│   ├─ Unrealized P&L
│   │    +$677.45 (+12.5%)   <-- green, signed
│   └─ Realized rip P&L
│        -$24.30           <-- existing line, kept; red/green by sign
└─ Caption row:
    "12 lots · 11 priced · 1 unpriced · 2 stale"
    Link: "View holdings"
```

Color rules: `unrealizedPnLCents > 0` → `text-green-600`, `< 0` → `text-destructive`, `=== 0` → `text-foreground`. Same for realized rip P&L.

`pricedInvestedCents === 0` (everything unpriced) → render "—" for current value and "—" for unrealized P&L; show a small CTA "Refresh prices on the catalog page".

### 7.2 New `DashboardPerformersCard`

Sibling card under the totals card. Two-column layout (collapses to stacked on mobile):

```
Card
├─ "Performance"
├─ Two columns:
│   ├─ Best performers (top 3)
│   │   Each row: thumbnail, name, set, +$$$ (+%%)
│   └─ Worst performers (bottom 3)
│       Each row: thumbnail, name, set, -$$$ (-%%)
└─ Each row links to /holdings/[catalogItemId]
```

If `pricedCount === 0`, hide the entire card. If `pricedCount < 6`, the same holding may appear in both columns when its P&L is the single highest and the lowest in the set; this is the correct reflection of a small portfolio and is left as-is (no dedup logic).

Component: `components/dashboard/DashboardPerformersCard.tsx`. Pure presentational; takes `bestPerformers` and `worstPerformers` slices from the dashboard totals query.

Reuses thumbnail logic from `HoldingsGrid` (extract a small `<HoldingThumbnail>` component shared by grid + performers card).

### 7.3 `HoldingsGrid` — per-card P&L footer

Existing footer is one line: `Qty · Invested`. Plan 4 replaces it with a stacked footer:

```
Qty: 3                           $54.32      <-- invested
Value: $72.10                    +$17.78     <-- current value + signed P&L
                                 (+32.7%)    <-- pnlPct, smaller text
```

Unpriced holdings: bottom line shows `Unpriced` badge instead of value/P&L.

Stale priced holdings: small "Stale" pill next to the value (clickable → links to `/catalog/[id]` where refresh lives).

Color rules same as totals card.

### 7.4 `HoldingDetailClient` — header gets P&L, lots get per-lot P&L

Header block (currently `Qty held` and `Invested`) gains two new lines:

```
Qty held: 3
Invested: $54.32
Current value: $72.10            <-- new
Unrealized P&L: +$17.78 (+32.7%) <-- new, signed color
```

If unpriced: replace bottom two lines with "Unpriced — refresh on catalog page".

If stale: append "Stale" pill to "Current value" line.

`<LotRow>` gains an optional `currentUnitMarketCents: number | null` prop and renders a per-lot P&L:

```
Existing row content +
  Lot value: $24.03                    <-- (qty - ripped) × currentUnitMarketCents
  Lot P&L: +$5.92 (+32.7%)             <-- vs lot's per-unit cost basis
```

When `currentUnitMarketCents === null`, the row stays as it is today (no P&L lines).

Per-lot P&L math:

```
qtyRemaining          = lot.quantity - rippedFromThisLot - decomposedFromThisLot
lotCurrentValue       = qtyRemaining × currentUnitMarketCents
lotInvestedRemaining  = qtyRemaining × lot.costCents
lotPnL                = lotCurrentValue - lotInvestedRemaining
lotPnLPct             = lot.costCents > 0 ? (lotPnL / lotInvestedRemaining) × 100 : null
```

(For sealed lots that have been decomposed: their `qtyRemaining` already accounts for decomposition consumption, mirroring the rip subtraction. The packs that came out of decomposition are separate purchases on the pack catalog item — they show their own P&L on the pack's holding detail page.)

### 7.5 New shared components

- `components/holdings/PnLDisplay.tsx` — formats `(pnlCents, pnlPct)` with sign + color. Used by totals card, performers card, holdings grid, holding detail header, lot row. Handles null cases.
- `components/holdings/StalePill.tsx` — small "Stale" pill component. Renders nothing when `stale=false`. Optional `linkHref` prop.
- `components/holdings/UnpricedBadge.tsx` — same pattern as `StalePill`, for unpriced rows.

### 7.6 `formatCents` consolidation

Per project_state.md, `formatCents` is duplicated across 5+ components. Plan 4 extracts it to `lib/utils/format.ts` since we're touching all the same components anyway. Targeted improvement — not a separate refactor PR.

```ts
// lib/utils/format.ts
export function formatCents(cents: number): string;          // "$1,234.56" (unsigned)
export function formatCentsSigned(cents: number): string;    // "+$1,234.56" / "-$1,234.56"
export function formatPct(pct: number, decimals?: number): string;  // "+12.3%" / "-12.3%"
```

Replace the inline copies in `DashboardTotalsCard`, `LotRow`, `RipRow`, `DecompositionRow`, `HoldingsGrid`, `HoldingDetailClient`, `EditPurchaseDialog`. No behavioral change.

## 8. Wire Format

`GET /api/dashboard/totals` response (top of section 5 type):

```json
{
  "totalInvestedCents": 543210,
  "pricedInvestedCents": 498765,
  "totalCurrentValueCents": 610955,
  "unrealizedPnLCents": 112190,
  "unrealizedPnLPct": 22.49,
  "realizedRipPnLCents": -2430,
  "pricedCount": 11,
  "unpricedCount": 1,
  "staleCount": 2,
  "lotCount": 12,
  "perHolding": [ /* HoldingPnL[] */ ],
  "bestPerformers": [ /* HoldingPnL[] up to 3 */ ],
  "worstPerformers": [ /* HoldingPnL[] up to 3 */ ]
}
```

`GET /api/holdings`:

```json
{ "holdings": [ /* HoldingPnL[] */ ] }
```

`GET /api/holdings/[catalogItemId]`:

```json
{
  "item": { /* existing fields, plus lastMarketAt */ },
  "holding": { /* HoldingPnL */ },
  "lots": [ /* unchanged shape */ ],
  "rips": [ /* unchanged */ ],
  "decompositions": [ /* unchanged */ ]
}
```

## 9. Tests

### 9.1 Service-level (`lib/services/pnl.test.ts`)

Covered in Section 5.3. Pure function, no I/O, ~12 cases.

### 9.2 API route (`app/api/dashboard/totals/route.test.ts`)

- Returns 401 when unauthenticated.
- Empty data → totals are zero, arrays empty, pnlPct null.
- Mixed priced/unpriced fixture → matches expected `PortfolioPnL`.
- Includes rips and decompositions in qty consumption (regression on Plan 3.5 plumbing).
- Realized rip P&L sign flip is applied at the boundary (raw loss row 500 → wire `-500`).

### 9.3 Holdings API route

- `GET /api/holdings` returns `HoldingPnL[]` shape with priced + unpriced + stale rows correct.
- `GET /api/holdings/[catalogItemId]` `holding` block has currentValueCents and pnlCents populated.

### 9.4 Component tests

- `PnLDisplay` — renders sign, color class, % part; handles null pnl, null pct.
- `DashboardTotalsCard` — happy path, all-unpriced fallback, zero-lot fallback (renders nothing as today).
- `DashboardPerformersCard` — best + worst, hidden when pricedCount === 0.
- `HoldingsGrid` — per-card P&L footer, Unpriced badge, Stale pill.
- `LotRow` — per-lot P&L lines visible when `currentUnitMarketCents != null`, hidden when null.

### 9.5 Existing tests to update

- `holdings.test.ts` extends fixtures with `last_market_at`. Logic doesn't change but wire shape does.

## 10. Build Order

Plan 4 implementation plan (writing-plans output) will likely batch as:

1. Add `last_market_at` plumbing through `holdings.ts`, the holdings page, and the holdings API route.
2. Extract `formatCents`/`formatCentsSigned`/`formatPct` to `lib/utils/format.ts`. Replace in-place.
3. Build `lib/services/pnl.ts` + tests. Pure, no UI yet.
4. Rewrite `app/api/dashboard/totals/route.ts` to use the new service.
5. Rewrite `app/api/holdings/route.ts` to return `HoldingPnL[]`.
6. Update `app/api/holdings/[catalogItemId]/route.ts` to widen the holding block.
7. Build `<PnLDisplay>`, `<StalePill>`, `<UnpricedBadge>` shared components.
8. Update `DashboardTotalsCard` to the 4-stat layout.
9. Build `DashboardPerformersCard` and wire it into `app/(authenticated)/page.tsx`.
10. Update `HoldingsGrid` per-card footer.
11. Update `HoldingDetailClient` header + `LotRow` per-lot P&L.
12. Browser smoke test: dashboard totals match a hand-computed value, performers card sorted correctly, stale pill appears on a row whose `last_market_at` is older than 7 days, unpriced badge appears on a row whose `last_market_cents` is null.

## 11. Out of Scope / Deferred

| Feature | Plan |
|---|---|
| Daily price snapshot cron writing to `market_prices` | 6 |
| Price chart with 1M / 3M / 6M / 12M / MAX toggles | 6 |
| Delta indicator ("+$99.87 (+9.32%) since 7d") | 6 |
| Refresh-all-held action | 6 (alongside the cron) |
| Realized P&L from sales | 5 |
| FIFO lot matching | 5 |
| CSV export of P&L summary | 5 (or 6) |
| Tax-year filter on realized P&L | 5 |
| Per-condition / per-grade pricing | not yet planned |
| Manual price override | 6 (or earlier if a vending-only SKU bites) |

## 12. Open Questions

None blocking. The following are noted for future plans, not Plan 4:

- When the daily cron lands in Plan 6, the existing `last_market_cents` write path becomes redundant on a per-search basis. Plan 6 should decide whether to keep on-demand refresh as a fast-path or drop it in favor of "always read from yesterday's snapshot."
- Plan 5's sales path will need to subtract sold qty in the same way Plan 4 already subtracts ripped + decomposed qty. The pattern is established; no design pressure on Plan 4.
