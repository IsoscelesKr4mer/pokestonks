# Pokestonks Plan 5 - Sales + FIFO Design Spec

**Date:** 2026-04-28
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan:** 5 (continuation of Plan 4 P&L + Dashboard; Plan 6 Polish + Automation is the next major plan)

## 1. Purpose

Plans 1 through 4 built the catalog, search, purchases, rip flow, box decomposition, and unrealized P&L surfaces. The user can record what they bought, track what it's worth, and see whether they're up or down on it. They cannot yet record what they've sold.

Plan 5 closes the loop. Sales become a first-class event: log a sale against a holding, FIFO-match it against the open lots, snapshot cost basis at sale time, and surface realized P&L on the dashboard alongside the existing rip realized line. A new `/sales` page lists sale history with filters; a `/settings` export section provides three CSV exports (sales, purchases, portfolio summary).

After Plan 5 ships:

- The dashboard shows total Realized P&L (rips + sales) on the same 4-stat strip as Plan 4.
- Holdings reflect sold quantities (sold lots reduce `qty_held`).
- Sale history is browsable globally on `/sales` and per-holding on `/holdings/[id]`.
- The user can export all three core datasets to CSV from `/settings`.
- Undo a sale is a clean atomic action that restores the consumed lot capacity.

## 2. Non-Goals

- **Manual lot override on sale entry.** FIFO is the only match strategy in Plan 5. Manual override (pick which lot to consume first) is deferred. The user explicitly indicated tax-lot detail is not load-bearing for their use case.
- **Editing sales rows in any form.** Sales are immutable per the conventions memory. The only mutation paths are create (`POST`) and undo (`DELETE` by `sale_group_id`). There is no PATCH on sales.
- **Tax-year filter on `/sales`.** The user does not file taxes on these flips. Replaced by a generic date-range filter.
- **Realized P&L breakdown on the dashboard tooltip.** A unified `realizedPnLCents` is sufficient; the rip vs sales split lives in the wire format only as `realizedRipPnLCents` and `realizedSalesPnLCents` if a future tooltip wants it. The dashboard stat shows the unified number only.
- **Daily price snapshot cron and price chart.** Plan 6.
- **Refresh-all-held action.** Plan 6.
- **Bulk import of historical sales.** Plan 6 alongside the bulk purchase importer.
- **Per-LotRow sell affordance.** The Sell button lives on the holdings grid card and the holding detail page header. No per-`<LotRow>` Sell in Plan 5.

## 3. Decisions Locked During Brainstorming

| Question | Decision |
|---|---|
| Plan 5 scope? | Full Phase 3 from CLAUDE.md: log sale + FIFO + dashboard realized line + `/sales` page with filters + CSV export (sales, purchases, portfolio summary). |
| One sale event spanning multiple lots - schema shape? | Per-lot row, all sharing a new `sale_group_id` (uuid) column. Reuses the per-source-purchase consumption ledger pattern from rips/decompositions; explicit group id makes atomic undo and UI grouping trivial. |
| Sale price + fees split across matched rows? | Proportional by quantity, rounding residual on the last row. Same pattern as `computePerPackCost` from Plan 3.5. |
| Edit semantics? | None. DELETE by `sale_group_id` only. To fix anything (notes, qty, fees), undo + re-log. Matches rips/decompositions exactly. |
| Sell CTA placement? | Sell button on the holdings grid card and on the holding detail page header. No per-LotRow Sell. |
| Dashboard realized P&L line? | Single unified `realizedPnLCents` = rips + sales. Replaces Plan 4's `realizedRipPnLCents`. The 4-stat strip becomes Invested - Current value - Unrealized P&L - Realized P&L. |
| FIFO matcher location? | Pure function in `lib/services/sales.ts`. POST route reads open lots, calls matcher, transactionally inserts rows. Same matcher powers a `POST /api/sales/preview` dry-run for the confirm dialog. |
| FIFO ordering? | `purchase_date asc, created_at asc, purchase_id asc`. Lots that have been ripped/decomposed/previously-sold contribute their `qtyAvailable` (purchase qty minus all prior consumption); they are ordered the same as untouched lots. |
| Sale price gross or net of fees? | Gross. User enters total sale price + fees separately. Realized = (sale_price - fees) - matched_cost. Matches the `sale_price_cents` + `fees_cents` columns already on the table. |
| CSV export placement? | All three buttons on `/settings`. `/sales` page also gets a context-aware "Export current view" button that exports the currently filtered list. |
| Where does sales realized P&L live in the math? | Computed inside `computePortfolioPnL` from a `realizedSalesPnLCents` parameter (sum of `(sale_price - fees - matched_cost)` across all sale rows). Same shape as the existing `realizedRipLossCents` parameter. |

## 4. Schema Changes

One Drizzle migration: `0008_sales_sale_group_id.sql`.

```sql
ALTER TABLE sales
  ADD COLUMN sale_group_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX sales_sale_group_idx ON sales(sale_group_id);
CREATE INDEX sales_purchase_idx ON sales(purchase_id);
```

The `gen_random_uuid()` default protects any pre-existing rows (none in production today, but defensive). The application always supplies the same uuid for all rows in one sale event - never relies on the default.

The `sales_purchase_idx` index supports the consumption query in `aggregateHoldings` (group sales by `purchase_id`). Plan 1 created `sales` without it.

`lib/db/schema/sales.ts` and `drizzle/schema.ts` updated to mirror the new column. `Sale` and `NewSale` types regenerate.

No other DB changes. No new tables. Plan 1's `sales` row already has every column we need (`purchase_id`, `quantity`, `sale_price_cents`, `fees_cents`, `matched_cost_cents`, `platform`, `notes`, `sale_date`, `created_at`, `user_id`) plus the RLS policy.

## 5. Service Layer

Two new pure-function services, one extension to an existing one.

### 5.1 `lib/services/sales.ts` - FIFO matcher

```ts
export type OpenLot = {
  purchaseId: number;
  purchaseDate: string;        // YYYY-MM-DD
  createdAt: string;           // ISO timestamp
  costCents: number;           // per-unit
  qtyAvailable: number;        // purchase.quantity - rips - decomps - prior sales
};

export type SaleRequest = {
  totalQty: number;
  totalSalePriceCents: number;  // gross
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

export function matchFifo(lots: readonly OpenLot[], req: SaleRequest): FifoResult;
```

**Algorithm:**

1. Sort lots ascending by `purchaseDate`, then `createdAt`, then `purchaseId`. Stable sort.
2. Walk lots. For each lot, take `min(remainingNeed, lot.qtyAvailable)` units. Stop when `remainingNeed === 0`. Skip lots with `qtyAvailable === 0`.
3. If lots are exhausted before `remainingNeed === 0`, return `{ ok: false, reason: 'insufficient_qty', totalAvailable }`.
4. Distribute `totalSalePriceCents` proportionally: for each row, `floor(totalSalePriceCents * rowQty / totalQty)`. Compute residual (`totalSalePriceCents - sum(distributed)`) and add to the last row. Same for `totalFeesCents`.
5. `matchedCostCents` per row = `lot.costCents * rowQty`. Sum into `totalMatchedCostCents`.
6. `realizedPnLCents` = `totalSalePriceCents - totalFeesCents - totalMatchedCostCents`.

Tests (`lib/services/sales.test.ts`):

| Case | Assertion |
|---|---|
| Single lot exact | One row, no residual. |
| Multi-lot split (FIFO order) | Three lots, qty 2/2/1, prices and fees proportional, residual on last. |
| Rounding residual | totalSalePrice 1001 split across 3 rows of qty 1 each: rows [333, 333, 335]. Sum equals input. |
| Insufficient qty | Returns `{ ok: false }`. `totalAvailable` is the sum across all open lots. |
| Lots with qtyAvailable === 0 | Skipped silently. Don't count as a row. |
| Rip-child + decomp-child + plain lots mixed | Matcher does not care about provenance; orders by `purchaseDate, createdAt, purchaseId` only. |
| FIFO tiebreaker | Two lots same `purchaseDate`, different `createdAt` - earlier wins. Same `created_at`, lower `purchaseId` wins. |
| Zero fees | All rows have `feesCents: 0`; no NaN. |
| Selling at a loss | `realizedPnLCents` negative; rows still emit normally. |
| Single unit sale | `rowQty: 1`, full price + full fees on the one row. |

### 5.2 `lib/services/holdings.ts` - extend `aggregateHoldings`

Existing signature takes `purchases, rips, decompositions`. Add `sales` as a fourth parameter:

```ts
export type RawSaleRow = {
  id: number;
  purchase_id: number;
  quantity: number;
};

export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[],
  decompositions: readonly RawDecompositionRow[],
  sales: readonly RawSaleRow[]
): Holding[];
```

Implementation: extend `consumedUnitsByPurchase`. Rips and decomps each contribute 1; a sales row contributes `sale.quantity` (the per-row qty consumed from that lot). Everything else in `aggregateHoldings` is unchanged.

```ts
for (const s of sales) {
  consumedUnitsByPurchase.set(
    s.purchase_id,
    (consumedUnitsByPurchase.get(s.purchase_id) ?? 0) + s.quantity
  );
}
```

`holdings.test.ts` updated: existing fixtures pass `sales: []`, new test cases cover sales consumption (single-lot consume, multi-lot consume, sale plus rip plus decomp on same purchase).

### 5.3 `lib/services/pnl.ts` - rename + accept sales

`computePortfolioPnL` signature change:

```ts
// Before
export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,
  lotCount: number,
  now: Date = new Date()
): PortfolioPnL;

// After
export function computePortfolioPnL(
  holdings: readonly Holding[],
  realizedRipLossCents: number,
  realizedSalesPnLCents: number,   // signed; (sale_price - fees - matched_cost) summed across all sale rows
  lotCount: number,
  now: Date = new Date()
): PortfolioPnL;
```

`PortfolioPnL` shape change:

```ts
// Before
realizedRipPnLCents: number;

// After
realizedPnLCents: number;          // unified (rips + sales)
realizedRipPnLCents: number;       // kept for tooltip / future use
realizedSalesPnLCents: number;     // kept for tooltip / future use
```

Math: `realizedPnLCents = realizedRipPnLCents + realizedSalesPnLCents`. The rip sign-flip from Plan 4 stays exactly as it is (`realizedRipPnLCents = -realizedRipLossCents` with `-0` guard). Sales realized comes in already signed (no flip).

Tests added to `pnl.test.ts`:

| Case | Assertion |
|---|---|
| Sales realized propagates | `realizedSalesPnLCents: 500` -> output `realizedSalesPnLCents: 500`, `realizedPnLCents` includes it. |
| Unified line sums correctly | Rip `-200` + sales `+500` -> `realizedPnLCents: 300`. |
| All-zero realized | Both inputs 0 -> `realizedPnLCents: 0`, no `-0`. |

## 6. API Changes

### 6.1 `POST /api/sales/preview` (new)

Input:

```ts
{
  catalogItemId: number;
  totalQty: number;
  totalSalePriceCents: number;
  totalFeesCents: number;
  saleDate: string;             // YYYY-MM-DD
  platform?: string | null;
  notes?: string | null;
}
```

Output (success):

```ts
{
  ok: true;
  rows: Array<{
    purchaseId: number;
    purchaseDate: string;
    purchaseSource: string | null;
    perUnitCostCents: number;
    quantity: number;
    salePriceCents: number;
    feesCents: number;
    matchedCostCents: number;
    realizedPnLCents: number;
  }>;
  totals: {
    totalSalePriceCents: number;
    totalFeesCents: number;
    totalMatchedCostCents: number;
    realizedPnLCents: number;
    qtyAvailable: number;
  };
}
```

Output (insufficient qty): `{ ok: false, reason: 'insufficient_qty', totalAvailable: number }` with status 422.

Implementation:

1. Auth check. 401 if no user.
2. Validate body via Zod (`saleCreateSchema`).
3. Load open lots via Supabase: `purchases.select(...).eq('catalog_item_id', catalogItemId).is('deleted_at', null)` with the user scope from RLS, plus separate counts of rips, decomps, and prior sales per purchase. Compute `qtyAvailable = quantity - sum(consumption)`.
4. Call `matchFifo(openLots, req)`.
5. Map results to the response DTO. No DB writes.

This route is read-only (preview); it reuses the same Zod schema as POST so the dialog can bind one form to both endpoints.

### 6.2 `POST /api/sales` (new)

Input: same Zod schema as `/api/sales/preview`.

Implementation:

1. Auth check. 401 if no user.
2. Validate body.
3. Generate one `sale_group_id = crypto.randomUUID()`.
4. Open a Drizzle transaction (matches the rip and decomposition POST patterns):
   a. Inside the txn, re-load open lots (same query as preview). This is the read-modify-write critical section - other writes don't happen since this is single-user, but it's the right shape.
   b. Call `matchFifo(openLots, req)`. If `!ok`, throw `InsufficientQty`.
   c. Insert N rows into `sales`, all with the same `sale_group_id`, `user_id = user.id`, `created_at` defaulting to now.
5. On success, return `201` with `{ saleGroupId, saleIds: [...], totals: { ... } }`.
6. On `InsufficientQty`, return `422` with `{ error, totalAvailable }`.
7. On any other error, return `500`.

Drizzle is used for the txn (matches `/api/decompositions/route.ts` exactly, including manual auth via Supabase first then Drizzle for the multi-statement write).

### 6.3 `GET /api/sales` (new)

Lists sales for the current user, grouped by `sale_group_id`.

Query params (all optional):

- `start` (YYYY-MM-DD, inclusive)
- `end` (YYYY-MM-DD, inclusive)
- `platform` (string match)
- `q` (catalog item name substring; case-insensitive)
- `limit` (default 50, max 200)
- `offset` (default 0)

Implementation: one Supabase query that joins sales with purchases and catalog_items:

```sql
SELECT
  s.id, s.sale_group_id, s.purchase_id, s.sale_date,
  s.quantity, s.sale_price_cents, s.fees_cents, s.matched_cost_cents,
  s.platform, s.notes, s.created_at,
  p.id, p.purchase_date, p.cost_cents,
  c.id, c.name, c.set_name, c.product_type, c.kind, c.image_url, c.image_storage_path
FROM sales s
JOIN purchases p ON p.id = s.purchase_id
JOIN catalog_items c ON c.id = p.catalog_item_id
WHERE s.user_id = auth.uid()
  AND s.sale_date BETWEEN coalesce(:start, '0001-01-01') AND coalesce(:end, '9999-12-31')
  AND (:platform IS NULL OR s.platform = :platform)
  AND (:q IS NULL OR c.name ILIKE '%' || :q || '%')
ORDER BY s.sale_date DESC, s.sale_group_id, s.id
LIMIT :limit OFFSET :offset;
```

Response groups rows by `sale_group_id` server-side and returns `SaleEvent[]`:

```ts
type SaleEvent = {
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
    realizedPnLCents: number;     // (sale - fees - matched), summed
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
  createdAt: string;              // earliest row in the group
};
```

Note: a single `sale_group_id` always maps to one `catalog_item` (FIFO consumes from one holding per sale event), so the catalog item is a property of the group, not per-row.

### 6.4 `GET /api/sales/[saleGroupId]` (new)

Same DTO as one entry from `GET /api/sales`. Used by the SaleDetailDialog (read-only sale event with Undo button).

### 6.5 `DELETE /api/sales/[saleGroupId]` (new)

Atomically deletes all rows in the group:

```ts
await db.delete(schema.sales).where(
  and(eq(schema.sales.saleGroupId, groupId), eq(schema.sales.userId, user.id))
);
```

Returns `204` on success, `404` if the group has no rows visible to the user. No FK cleanup needed - sales are leaf rows; deleting them just frees up the linked purchases' `qty_available`.

### 6.6 `GET /api/holdings/[catalogItemId]` (extend)

Add a `sales: SaleEvent[]` array to the response, scoped to sales whose `purchase_id` is one of this holding's purchases. The holding detail page already loads `rips` and `decompositions` arrays; sales is the third sibling.

Sort: `saleDate desc, saleGroupId, saleId`.

The `holding` summary block (a `HoldingPnL`) is unaffected - sold qty already disappears via the extended `aggregateHoldings`.

### 6.7 `GET /api/dashboard/totals` (extend)

Wire shape change: keep `realizedRipPnLCents` (don't break it for any callers). Add `realizedPnLCents` (unified) and `realizedSalesPnLCents` (breakdown). The breakdown pair is preserved on the wire for forward compatibility (future tooltip), even though Plan 5's UI only renders the unified field.

Implementation change:

1. Existing rip-loss query stays.
2. New query: `SELECT sale_price_cents, fees_cents, matched_cost_cents FROM sales WHERE user_id = $1` -> sum into `realizedSalesPnLCents`.
3. New query: count distinct `sale_group_id` for the caption (`saleEventCount`).
4. Existing call: `aggregateHoldings(purchases, rips, decomps, sales)`.
5. `computePortfolioPnL(holdings, realizedRipLossCents, realizedSalesPnLCents, lotCount, new Date())`.

The route returns the rolled-up `PortfolioPnL` plus `saleEventCount: number` for the dashboard caption.

### 6.8 `GET /api/holdings` (extend)

`aggregateHoldings` call adds the `sales` array. No wire shape change to consumers (the `HoldingPnL[]` structure already accommodates reduced `qtyHeld`).

### 6.9 `PATCH /api/purchases/[id]` (defensive extension)

Today, the route only blocks PATCH on derived-child purchases (rip / decomp children). Plan 5 adds: if `quantity` is being PATCHed, validate the new value is `>= sum(rips + decomps + sales)` for that purchase. Otherwise return 422 `{ error: 'cannot reduce quantity below consumed', consumed }`.

Cost edits remain allowed even on purchases with linked sales. The convention is documented: editing a purchase's cost only affects open lots going forward; `sales.matched_cost_cents` is snapshotted at sale time and never recomputed.

### 6.10 `DELETE /api/purchases/[id]` (no change)

Already returns 409 with `linkedSaleIds` if the purchase has linked sales (verified in `app/api/purchases/[id]/route.ts:139`). Plan 5 adds nothing here.

### 6.11 `DELETE /api/rips/[id]` (no change)

Already returns 409 with `linkedSaleIds` for rip-child purchases that have been sold (verified in `app/api/rips/[id]/route.ts:100`). Plan 5 adds nothing here.

### 6.12 `DELETE /api/decompositions/[id]` (no change)

Already has the linked-sales 409 (verified in `app/api/decompositions/[id]/route.ts:117`, currently called the "Defensive Plan 5 check"). Plan 5 just confirms the check now serves a real purpose.

### 6.13 CSV export endpoints (new)

Three endpoints. All require auth, all stream CSV with `Content-Disposition: attachment; filename=...`.

- `GET /api/exports/sales.csv?start=&end=&platform=&q=` - same filters as `GET /api/sales`. Each row in the CSV is one sales table row (per-lot, not per-event), so the user can audit the FIFO breakdown. Columns: `sale_group_id, sale_id, sale_date, holding_name, set_name, product_type, kind, purchase_id, purchase_date, qty, per_unit_cost_cents, sale_price_cents, fees_cents, matched_cost_cents, realized_pnl_cents, platform, notes`.
- `GET /api/exports/purchases.csv?start=&end=&kind=` - all purchases (not soft-deleted) in the date range. Columns: `purchase_id, purchase_date, holding_name, set_name, product_type, kind, qty, cost_cents, source, location, condition, is_graded, grading_company, grade, cert_number, source_rip_id, source_decomposition_id, deleted_at, notes, created_at`.
- `GET /api/exports/portfolio-summary.csv` - one row per holding with `HoldingPnL` fields plus a portfolio-totals row at the top. Columns: `catalog_item_id, name, set_name, product_type, kind, qty_held, total_invested_cents, last_market_cents, last_market_at, current_value_cents, pnl_cents, pnl_pct, priced, stale`.

Money columns are integer cents (no formatting). Dates are `YYYY-MM-DD`. CSV escaping per RFC 4180 (quote fields containing comma, quote, or newline; double-up internal quotes).

A small `lib/utils/csv.ts` helper writes rows; no third-party dep.

## 7. UI Changes

### 7.1 New components in `components/sales/`

- `SellDialog.tsx` - controlled-open dialog. Opens with the catalog item already selected (passed in as prop). Form fields: qty, sale price, fees, sale date, platform, notes. On change, debounced call to `POST /api/sales/preview` returns the FIFO breakdown which renders as a small "Will consume" table. Submit button disabled until preview is `ok: true`. Submit calls `POST /api/sales`.
- `SellDialog`'s preview pane: a small table showing each consumed lot with thumbnail-sized lot info (purchase date, qty consumed, per-unit cost, lot's contribution to realized P&L).
- `SaleDetailDialog.tsx` - read-only, opens from a SaleRow click. Shows the same breakdown as the preview, plus "Logged on: <createdAt>", "Notes: <text>", and an "Undo sale" destructive button.
- `SaleRow.tsx` - a row in the sale history list (used on `/sales` and `/holdings/[id]`). Shows: thumb, name + set, sale date, qty, total proceeds, total realized P&L (signed/colored via `<PnLDisplay>`), platform pill. Click opens `SaleDetailDialog`.
- `SellButton.tsx` - small button that pops the SellDialog. Two visual variants: `variant="card"` (small icon + text, sits in the holdings grid card alongside qty/price; doesn't link-bubble because it stops propagation) and `variant="header"` (full button used on holding detail page header next to Rip Pack / Open Box).
- `useFifoPreview` hook (TanStack Query) backed by `POST /api/sales/preview`. Debounced query key: `['sales', 'preview', { catalogItemId, totalQty, totalSalePriceCents, totalFeesCents }]`. Stale time 0 (always re-run on input change).

### 7.2 `HoldingsGrid` - SellButton on each card

The card today is a `<Link>` wrapping the entire card content. Plan 5 does not break the link; the SellButton lives in a small action strip at the bottom of the card (right side of the per-card P&L footer) and uses `e.stopPropagation()` + `e.preventDefault()` on click to suppress the link navigation.

Disabled state: SellButton is disabled when `qtyHeld === 0` (which can't happen in the grid today since holdings with 0 qty are filtered out, but defensive).

Layout sketch:

```
[Card link area: thumbnail, name, set]
[Footer: Qty 3 / Invested $54.32]
[Footer: Value $72.10 / +$17.78 (+32.7%)]
[Action strip: Sell button (right-aligned)]
```

### 7.3 Holding detail page header - SellButton

`HoldingDetailClient.tsx` header currently has Rip Pack and Open Box buttons. Add a Sell button alongside them. Disabled if `holding.qtyHeld === 0`.

### 7.4 Holding detail page - sales history section

Below the existing rips section and decomposition section, add a "Sales" section that lists the SaleEvent rows for this holding. Empty state hidden when no sales (mirrors the rips section's behavior today).

### 7.5 `LotRow` - "Sold N" provenance line

When a lot has any sales rows linked to it (via `purchase_id`), show a small subtitle line under the existing rip/decomp consumption lines: "Sold 2 of 5 (+$31.20 realized)". The line is informational only; clicking it does nothing.

The detail page passes a `salesByPurchase: Map<purchaseId, { qty, realizedPnLCents }>` to `LotRow`, computed from the holding response's `sales[]` array.

### 7.6 `/sales` page

`/app/(authenticated)/sales/page.tsx` - replaces the current placeholder.

Layout:

- Header: "Sales" + "Export current view (CSV)" button (uses the active filter set as URL params).
- Filters: date range (from / to inputs), platform select (populated from distinct values in the user's sales), search input for holding name. URL-synced (search params drive the query and are restored on reload).
- Body: paginated list of `SaleRow` components. Stacks vertically on mobile, two-column grid on md+.
- Empty state when no sales match: "No sales yet" with a "Tip: log a sale from any holding" caption.

`useSales(filters)` TanStack hook backed by `GET /api/sales`. Stale time 30 seconds.

### 7.7 `/settings` page - Export section

New "Export" card on the settings page. Three buttons (each triggers a download):

- "Export sales (CSV)" -> `/api/exports/sales.csv`
- "Export purchases (CSV)" -> `/api/exports/purchases.csv`
- "Export portfolio summary (CSV)" -> `/api/exports/portfolio-summary.csv`

Each button is a regular `<a>` with `download` attribute pointing at the export endpoint. No client-side state. The `/sales` page's "Export current view" button is the only one that passes filters in the URL.

### 7.8 `DashboardTotalsCard` - rename realized line

Plan 4's "Realized rip P&L" stat becomes "Realized P&L" and reads from `portfolio.realizedPnLCents`. Caption row updates to include sale event count: "12 lots / 11 priced / 1 unpriced / 2 stale / 4 sales".

`DashboardTotalsCard` reads `portfolio.realizedPnLCents` only; the rip vs sales split fields exist on the wire but aren't rendered in Plan 5.

### 7.9 No new shared components beyond `components/sales/`

`<PnLDisplay>` (Plan 4) is reused for sale P&L rendering; no special-case formatter.

## 8. Wire Format

Bench example - one multi-lot sale event in `GET /api/sales`:

```json
{
  "sales": [
    {
      "saleGroupId": "5b2d3c1e-...-...",
      "saleDate": "2026-04-20",
      "platform": "eBay",
      "notes": "Local pickup",
      "catalogItem": {
        "id": 4421,
        "name": "Scarlet & Violet 151 Elite Trainer Box",
        "setName": "Scarlet & Violet 151",
        "productType": "ETB",
        "kind": "sealed",
        "imageUrl": "...",
        "imageStoragePath": "..."
      },
      "totals": {
        "quantity": 5,
        "salePriceCents": 100000,
        "feesCents": 4000,
        "matchedCostCents": 27500,
        "realizedPnLCents": 68500
      },
      "rows": [
        {
          "saleId": 88,
          "purchaseId": 4001,
          "purchaseDate": "2026-03-01",
          "perUnitCostCents": 5500,
          "quantity": 2,
          "salePriceCents": 40000,
          "feesCents": 1600,
          "matchedCostCents": 11000
        },
        {
          "saleId": 89,
          "purchaseId": 4042,
          "purchaseDate": "2026-04-12",
          "perUnitCostCents": 5500,
          "quantity": 2,
          "salePriceCents": 40000,
          "feesCents": 1600,
          "matchedCostCents": 11000
        },
        {
          "saleId": 90,
          "purchaseId": 4078,
          "purchaseDate": "2026-04-15",
          "perUnitCostCents": 5500,
          "quantity": 1,
          "salePriceCents": 20000,
          "feesCents": 800,
          "matchedCostCents": 5500
        }
      ],
      "createdAt": "2026-04-20T22:14:01.000Z"
    }
  ],
  "nextOffset": null
}
```

Dashboard totals example:

```json
{
  "totalInvestedCents": 543210,
  "pricedInvestedCents": 498765,
  "totalCurrentValueCents": 610955,
  "unrealizedPnLCents": 112190,
  "unrealizedPnLPct": 22.49,
  "realizedPnLCents": 66070,
  "realizedRipPnLCents": -2430,
  "realizedSalesPnLCents": 68500,
  "pricedCount": 11,
  "unpricedCount": 1,
  "staleCount": 2,
  "lotCount": 12,
  "saleEventCount": 4,
  "perHolding": [ ... ],
  "bestPerformers": [ ... ],
  "worstPerformers": [ ... ]
}
```

## 9. Tests

### 9.1 Service-level

- `lib/services/sales.test.ts` (new) - 10 cases per Section 5.1.
- `lib/services/holdings.test.ts` (extended) - 3 new cases for sales consumption.
- `lib/services/pnl.test.ts` (extended) - 3 new cases for `realizedSalesPnLCents` propagation.

### 9.2 API routes

- `app/api/sales/preview/route.test.ts` (new) - happy path, insufficient qty, validation errors, 401.
- `app/api/sales/route.test.ts` (new) - POST happy path (single + multi lot), POST insufficient qty (422), POST validation (422), GET filters (date range, platform, q), GET pagination, 401.
- `app/api/sales/[saleGroupId]/route.test.ts` (new) - GET happy, DELETE happy, DELETE missing, 401.
- `app/api/dashboard/totals/route.test.ts` (extended) - sales contribute to `realizedSalesPnLCents`; sold qty drops out of `qtyHeld`; `realizedPnLCents` sums correctly.
- `app/api/holdings/[catalogItemId]/route.test.ts` (extended) - returned shape includes `sales: SaleEvent[]`.

### 9.3 Component tests

- `SellDialog.test.tsx` - preview renders, submit disabled until `ok`, submit calls POST.
- `SaleRow.test.tsx` - signed P&L coloring, click opens detail dialog.
- `SaleDetailDialog.test.tsx` - undo button calls DELETE.
- `DashboardTotalsCard.test.tsx` (extended) - "Realized P&L" label + value.

### 9.4 CSV export tests

- `app/api/exports/sales/route.test.ts` (new) - CSV header row, RFC 4180 escaping (commas, quotes, newlines in notes), filter passthrough.
- `app/api/exports/purchases/route.test.ts` (new) - includes soft-deleted? No (only `deleted_at IS NULL`). Includes rip-child / decomp-child purchases? Yes (with their `source_*_id` columns populated).
- `app/api/exports/portfolio-summary/route.test.ts` (new) - one row per holding plus the portfolio-totals row at the top.

## 10. Build Order

Plan 5 implementation plan (writing-plans output) will likely batch as:

1. Migration `0008_sales_sale_group_id.sql` (`sale_group_id` column + indexes). Update `lib/db/schema/sales.ts` and `drizzle/schema.ts`.
2. Build `lib/services/sales.ts` (`matchFifo`) + tests. Pure, no UI.
3. Extend `aggregateHoldings` to take `sales` (and add new test cases).
4. Extend `computePortfolioPnL` for `realizedSalesPnLCents` + the unified `realizedPnLCents` field; rename Plan 4's stat field; update tests.
5. Build `POST /api/sales/preview` + tests.
6. Build `POST /api/sales` (transactional) + tests.
7. Build `GET /api/sales` + `GET /api/sales/[saleGroupId]` + `DELETE /api/sales/[saleGroupId]` + tests.
8. Extend `GET /api/holdings/[catalogItemId]` to include `sales[]`. Extend `GET /api/holdings` and `GET /api/dashboard/totals` to pipe sales through `aggregateHoldings`/`computePortfolioPnL`.
9. Build `SellDialog`, `SaleDetailDialog`, `SaleRow`, `SellButton` components + hooks. Component tests.
10. Wire `SellButton` into `HoldingsGrid` cards.
11. Wire `SellButton` into `HoldingDetailClient` header. Add Sales section. Add "Sold N" subtitle to `LotRow`.
12. Replace `/sales` placeholder with the real list page (filters + paginated list + "Export current view" button).
13. Build the three CSV export endpoints + tests + the `lib/utils/csv.ts` helper.
14. Add Export section to `/settings` (three buttons).
15. `DashboardTotalsCard` label rename ("Realized rip P&L" -> "Realized P&L"), caption row update.
16. Defensive PATCH `/api/purchases/[id]` extension: validate `quantity >= total_consumed`. Test.
17. Browser smoke test: log a 5-unit sale split across 3 lots, confirm preview math, confirm sale appears on `/sales` and on holding detail, undo it, confirm capacity restored, dashboard reflects realized P&L line.

## 11. Out of Scope / Deferred

| Feature | Plan |
|---|---|
| Manual lot override on sale entry | 6 (or never, given the user's use case) |
| PATCH on sales rows | never (rows are immutable per convention) |
| Tax-year filter on `/sales` | never |
| Bulk import of historical sales | 6 |
| Daily price snapshot cron + price chart | 6 |
| Refresh-all-held action | 6 |
| Per-LotRow Sell affordance | 6+ if ever |
| Realized P&L breakdown tooltip (rips vs sales) | nice-to-have, can ship anytime; wire fields are already there |
| Sale event "edit notes" path | never; undo + re-log instead |
| Per-condition / per-grade pricing | not yet planned |
| Returns / partial refunds | out of scope; user undoes the sale and re-logs |

## 12. Open Questions

None blocking. Items noted for future plans:

- When the daily cron lands in Plan 6 and `last_market_cents` writes happen on a schedule, the dashboard's `realizedPnLCents` calculation is unaffected (sales math is fully decoupled from current market price).
- If the user ever wants a "split shipment" workflow (one buyer takes 5 boxes, paid in two installments), the current schema requires logging it as one sale event. Splitting across rows would need a new `payment_id` column and is firmly Plan 8+.
