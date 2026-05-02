# Plan 8 — Collection-Tracking Mode (Design Spec)

**Date:** 2026-05-02
**Status:** Brainstormed and approved

## 1. Goal

Let users record lots they own without knowing the cost basis. Those lots count toward the vault's current market value and lifetime sale revenue, but do not pollute cost basis or unrealized P&L. Use case: a friend with multi-year sealed inventory wants the app's market-value tracking without backfilling decades of receipts. A user with a partial cost-basis history can use the app honestly without inventing fake numbers.

The UX entry point is **"Add to vault w/o cost basis"** — explicit framing so users understand they're declining cost-basis tracking, not just deferring it.

## 2. Scope (locked)

Five things ship together:

1. `purchases.unknown_cost` boolean flag (schema + Drizzle + migration). Children of rips and decompositions inherit the flag at creation.
2. P&L math gates — cost basis, unrealized P&L, realized P&L, performers ranking — all branch on the flag (Section 5).
3. AddPurchaseDialog gets an "I don't know the cost basis" checkbox + helper text. The single "Add" entry path on holding detail / catalog detail covers both modes.
4. Catalog search bulk-add: result rows on `/catalog` gain a multi-select checkbox + "Add N to vault (no basis)" action bar. All bulk-added rows are flagged `unknown_cost: true`.
5. UI surfacing: "No basis" pill on holdings grid cards, lot rows, sale rows; conversion flow in EditPurchaseDialog ("Set cost basis" button); dashboard caption splits "X tracked / Y in collection."

**Explicitly out of scope:**

- CSV bulk import (deferred — Plan 4 backlog item from CLAUDE.md still applies later).
- Reverse conversion (known → unknown). One-way only; preventing this is a deliberate footgun guard.
- Backfill of existing rows. All existing `purchases` get `unknown_cost = false` via the migration default.
- Per-lot "currency unknown" or "approximate basis" variants. Either you know it or you don't; no third state.

## 3. Architecture

One column. The flag travels through existing service-layer aggregation; the math splits at the cost-basis sum and at the P&L derivations. No new tables, no new services beyond a small bulk-create endpoint.

### 3.1 Boundaries

- **Schema layer** — `purchases.unknown_cost` boolean. Existing `cost_cents NOT NULL` + `cost_cents >= 0` CHECK constraints stay. When `unknown_cost = true`, store `cost_cents = 0`. The flag, not the value, is the source of truth.
- **`lib/services/holdings.ts`** — `RawPurchaseRow` gains `unknown_cost: boolean`. `Holding` gains `qtyHeldTracked`, `qtyHeldCollection`. `totalInvestedCents` continues to sum only over tracked lots (unknown-cost lots contribute 0 because `cost_cents = 0`, so this is a free invariant — but we make it explicit in code with a comment and guard: skip cost-basis accumulation for `unknown_cost: true` rows regardless of stored value).
- **`lib/services/pnl.ts`** — `HoldingPnL` gains `qtyHeldTracked`, `qtyHeldCollection`, `currentValueTrackedCents`, `currentValueCollectionCents`. P&L derivations use the tracked subset only. `currentValueCents` continues to mean total (all qty × market) for display. Best/worst performers exclude all-unknown holdings (no P&L to rank by).
- **`lib/services/sales.ts`** — `matchFifo` is unchanged on the surface. Per-row computed `costBasisCents` continues to come from each lot's `cost_cents`, which is 0 for unknown-cost lots. Realized P&L per row: `(unitPriceCents * qty) - feesShare - costBasisCents`. For unknown-cost rows that's `revenue - fees - 0` — already correct, no math change. Sale rows surface `unknownCost: boolean` for UI badging.
- **API layer** — POST `/api/purchases` accepts `unknownCost?: boolean`. POST `/api/purchases/bulk` is new. PATCH `/api/purchases/[id]` allows clearing `unknown_cost` and setting `cost_cents` in one request (one-way conversion).
- **UI** — AddPurchaseDialog checkbox; new bulk-select bar on `/catalog`; "No basis" badges across holdings + sales surfaces; EditPurchaseDialog conversion flow.

### 3.2 Data flow

- Add: AddPurchaseDialog → POST `/api/purchases` `{unknownCost: true, costCents: 0, ...}` → row inserted with flag set. Same dialog, same endpoint.
- Bulk add: `/catalog` multi-select → POST `/api/purchases/bulk` with array → Drizzle txn inserts N rows, all `unknown_cost: true`, all `cost_cents: 0`.
- Open box / rip: existing transaction creates child purchases. Each child inherits `unknown_cost` from the source purchase row.
- Conversion: EditPurchaseDialog "Set cost basis" → PATCH `/api/purchases/[id]` `{costCents: X, unknownCost: false}` → server validates lot is currently `unknown_cost: true` and is not a derived child (rip / decomposition); if both pass, updates atomically.
- Read: existing `/api/holdings`, `/api/dashboard/totals`, `/api/holdings/[id]`, `/api/sales`, `/api/sales/[saleGroupId]` all gain `unknownCost`-aware counts and badges. No new read endpoints.

## 4. Schema

### 4.1 Migration: `supabase/migrations/20260502000001_unknown_cost_purchases.sql`

Applied manually via Supabase SQL editor. Drizzle TS schema updated to match — no `drizzle-kit push` (per standing project rule from Plan 5 disaster recovery).

```sql
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS unknown_cost BOOLEAN NOT NULL DEFAULT FALSE;
```

No new index. Filtering happens at the service layer over the already-loaded purchases array; we never query "all unknown_cost purchases" in isolation. Single-user scale, lot count well under 10k.

### 4.2 Drizzle schema changes

`lib/db/schema/purchases.ts` adds:

```ts
unknownCost: boolean('unknown_cost').notNull().default(false),
```

### 4.3 `HARD_FIELDS_FOR_DERIVED_CHILDREN` extension

The existing rip-child / decomposition-child immutability lock (`app/api/purchases/[id]/route.ts`) gains `unknownCost` to the locked field set. Children of rips and decompositions cannot independently flip their `unknown_cost` flag. To convert children, the parent must be converted (then re-rip / re-decompose if needed); we do not propagate parent flips to existing children automatically because the children may already be partially sold.

### 4.4 Inheritance at creation

Two existing transactional endpoints copy the parent's `unknown_cost` to children:

- `POST /api/rips` — child purchase inherits `source_purchase.unknown_cost`.
- `POST /api/decompositions` — each child pack purchase inherits `source_purchase.unknown_cost`. Cost-split math is unchanged because cost is 0 anyway when the source is unknown-cost.

## 5. P&L math gates

### 5.1 Aggregation (`aggregateHoldings`)

Per-purchase loop accumulates two parallel quantity sums:

- `qtyHeldTracked` — sum of `remaining` for purchases with `unknown_cost = false`.
- `qtyHeldCollection` — sum of `remaining` for purchases with `unknown_cost = true`.
- `qtyHeld = qtyHeldTracked + qtyHeldCollection` (existing field, preserved).
- `totalInvestedCents` — sum of `cost_cents * remaining` for `unknown_cost = false` rows only. Unknown-cost rows contribute 0 by storage convention; we still gate explicitly to defend against bad data.

### 5.2 Per-holding P&L (`computeHoldingPnL`)

```
priced = lastMarketCents != null
qtyHeldTracked >= 0
qtyHeldCollection >= 0

currentValueCents             = priced ? lastMarketCents * qtyHeld           : null
currentValueTrackedCents      = priced ? lastMarketCents * qtyHeldTracked    : null
currentValueCollectionCents   = priced ? lastMarketCents * qtyHeldCollection : null

pnlCents  = priced AND qtyHeldTracked > 0
              ? currentValueTrackedCents - totalInvestedCents
              : null

pnlPct    = pnlCents != null AND totalInvestedCents > 0
              ? (pnlCents / totalInvestedCents) * 100
              : null
```

Mixed example. Catalog item X: 2 tracked lots ($50 cost each, qty 1 each) + 3 collection lots (qty 1 each), market $30 per unit.
- `qtyHeld = 5`, `qtyHeldTracked = 2`, `qtyHeldCollection = 3`
- `totalInvestedCents = 10000` (2 × $50)
- `currentValueCents = 15000` (5 × $30) — what the user sees as "current market value"
- `currentValueTrackedCents = 6000` (2 × $30)
- `pnlCents = 6000 - 10000 = -4000`, `pnlPct = -40%`
- The 3 collection lots' market value ($9000) shows up in `currentValueCents` but not in P&L. That's the honest split.

All-unknown holding: `qtyHeldTracked = 0`. `totalInvestedCents = 0`. `pnlCents = null` (gated by `qtyHeldTracked > 0`, even when invested is 0 — different from existing behavior, see § 5.5). UI renders "No basis" badge instead of a P&L number.

### 5.3 Portfolio totals (`computePortfolioPnL`)

New fields added to `PortfolioPnL`:

- `totalCurrentValueTrackedCents` — sum of `currentValueTrackedCents` over priced holdings. Used for portfolio unrealized P&L.
- `totalCurrentValueCollectionCents` — sum of `currentValueCollectionCents` over priced holdings. Display only.
- `qtyHeldTrackedAcrossPortfolio` — sum of `qtyHeldTracked`. Drives caption "X tracked".
- `qtyHeldCollectionAcrossPortfolio` — sum of `qtyHeldCollection`. Drives caption "Y in collection".
- `lotCountTracked`, `lotCountCollection` — preserved alongside existing `lotCount`. Lot counts (open lots), not unit counts.

Portfolio unrealized P&L derivation changes:

```
unrealizedPnLCents = totalCurrentValueTrackedCents - pricedInvestedCents
unrealizedPnLPct   = pricedInvestedCents > 0
                       ? (unrealizedPnLCents / pricedInvestedCents) * 100
                       : null
```

`totalCurrentValueCents` continues to mean the full vault total (all qty × market) — that's what shows on the dashboard "Current value" stat. The P&L line uses the tracked subset.

`pricedInvestedCents` is unchanged because invested-money totals already exclude unknown-cost lots (their `cost_cents` is 0).

### 5.4 Best/worst performers

Performers list filters out holdings where `qtyHeldTracked === 0`. They have no P&L to rank. The performers strip already filters `priced` only; the new condition is `priced && qtyHeldTracked > 0`.

This means an all-collection vault will show empty performers (correct — no rankable P&L). Mixed vaults rank by tracked-subset P&L, ignoring the collection portion. The "No basis" lots are still browsable in `/holdings`, just absent from performers.

### 5.5 Edge case: tracked qty = 0 but invested = 0

Today, `pnlPct` returns null when `totalInvestedCents === 0`, but `pnlCents` returns 0 (not null). Plan 8 changes `pnlCents` to return null when `qtyHeldTracked === 0` even if invested is 0, because there is no tracked subset to compute P&L over. UI surfaces this as the "No basis" badge instead of "$0.00 (—%)".

This is a behavior change for the (today-unreachable) case of `purchases.cost_cents = 0` — but no such row exists in production today, and the new code path is the honest answer for collection-mode lots.

### 5.6 Realized P&L (sales)

`matchFifo` distributes price + fees across matched lots in date order. Each row's `realizedPnLCents = perRowPrice - perRowFees - perRowCost`. For unknown-cost lots, `perRowCost = 0`, so realized = revenue − fees. That number flows into:

- Per-sale-row total realized — surfaced via SaleRow + SaleDetailDialog. Each row gains `unknownCost: boolean` so the UI badges no-basis rows.
- Portfolio-level `realizedSalesPnLCents` — bundled (per Q3 = C). Dashboard "Realized P&L" total includes unknown-cost sale revenue without segregation. Honesty lives at the per-sale detail level, not the dashboard.

### 5.7 Dashboard caption

Existing: `Total invested across N lots · M sales`.

New: `Total invested across N tracked lots · K in collection · M sales`.

`K = 0` collapses to today's caption (no "0 in collection" noise). `N = 0 && K > 0` reads `Total invested across 0 tracked lots · K in collection · M sales` — yes that's a little awkward, but honest, and surfaces the friend's all-collection vault state without requiring a special branch. UI may opt to render `K in collection · M sales` (drop the leading clause) when `N = 0`; spec leaves that to the implementer.

## 6. API surface

### 6.1 POST `/api/purchases` (existing — extend)

Body adds optional `unknownCost?: boolean` (default false). Validation:

- If `unknownCost === true`: server forces `costCents = 0` regardless of any value sent. (Cleaner than rejecting; if the client sends both, the flag wins.)
- If `unknownCost === false` (default): `costCents >= 0` required, existing rules.

Response: existing shape, plus `unknownCost: boolean` on the returned purchase.

### 6.2 POST `/api/purchases/bulk` (new)

Body:

```ts
{
  items: Array<{
    catalogItemId: number;
    quantity: number;          // > 0
    purchaseDate?: string;     // ISO YYYY-MM-DD; defaults to today
    source?: string | null;
  }>;
  // Plan 8 always submits unknownCost: true via this endpoint (the bulk-add UI is
  // collection-only). Server enforces unknownCost: true for every row regardless,
  // making this a single-purpose endpoint by design.
}
```

Behavior:

- Drizzle transaction; insert N rows. All rows: `unknownCost = true`, `costCents = 0`.
- Validates `items.length > 0`, `<= 200` (sanity ceiling).
- Validates each `catalogItemId` exists (single SELECT WHERE id IN (...) before the txn).
- Returns `{ created: number, ids: number[] }`.
- Auth: same Supabase session-cookie auth as other purchase routes. `userId` from session.

### 6.3 PATCH `/api/purchases/[id]` (existing — extend)

Today: rejects edits to derived children's locked fields. Plan 8 extends:

- `unknownCost` joins the locked field set for derived children (rip + decomposition). Children cannot be independently converted.
- For non-derived rows, allow `unknownCost` and `costCents` to change in the same request. Two flow shapes:
  - **Conversion** (unknown → known): body has `{unknownCost: false, costCents: <integer >= 0>}`. Server transitions the lot.
  - **No reverse**: if the row is currently `unknown_cost: false` and the body sends `unknownCost: true`, return 422 `cannot_unset_basis`. One-way invariant.
- Sale-history side effects: converting a partially-sold collection lot updates lot cost-basis going forward. Existing sale rows for that lot retain their `realizedPnLCents` snapshot (stored at sale time). No retroactive sale recalculation. Plan-author flag: this is intentional; we treat realized history as immutable.

### 6.4 Other existing endpoints (read-side extensions)

These add fields without changing behavior:

- `GET /api/holdings` — each row gains `qtyHeldTracked`, `qtyHeldCollection`, `currentValueTrackedCents`, `currentValueCollectionCents`. `pnlCents` / `pnlPct` semantics changed per § 5.2.
- `GET /api/holdings/[catalogItemId]` — same fields on the `holding` summary; each `lots[i]` row gains `unknownCost: boolean`.
- `GET /api/dashboard/totals` — adds the four portfolio fields from § 5.3 plus `lotCountTracked`, `lotCountCollection`.
- `GET /api/sales` — each row gains `unknownCost: boolean` (true if any FIFO leg drew from a collection lot — bubble up at the row level for the UI badge; spec uses `any`-fold).
- `GET /api/sales/[saleGroupId]` — preserved per-leg `unknownCost: boolean` so the SaleDetailDialog can badge individual legs.

## 7. UI

### 7.1 AddPurchaseDialog (extend)

New "I don't know the cost basis" checkbox below the cost field. When checked:

- Cost field disables (greyed) and clears.
- Helper text appears beneath: "Excluded from P&L. Counts toward vault current market value."
- Submit button label switches from "Add purchase" to "Add to vault".
- Form sends `{unknownCost: true, costCents: 0}`.

When unchecked: existing flow.

The dialog is invoked from holding detail (`/holdings/[id]`) and catalog detail (`/catalog/[id]`). No separate "Add to vault" entry button on those surfaces — single dialog, mode toggle inside.

QuickAddButton (the MSRP-resolved one-click add on `/catalog/[id]`) is unchanged. It always creates a known-cost lot using MSRP. Users who want a no-basis lot from catalog detail click the regular "Add" button and tick the checkbox.

### 7.2 Catalog bulk-select (`/catalog`)

Search result cards gain a leading checkbox (visible on hover or always — implementer's call; recommend always-visible for discoverability). Selecting one or more cards reveals a sticky action bar at the bottom of the page:

- **Left:** "N selected" with a "Clear" button.
- **Right:** "Add to vault (no basis)" primary button.

Click → POST `/api/purchases/bulk` with one item per selected card, qty = 1 each, `purchaseDate = today`. Toast on success: "Added N items to your vault." Selection clears, action bar hides.

No per-row qty input in this iteration — qty 1 each, edit later if needed via EditPurchaseDialog. (Per-row qty would re-introduce a dialog-shaped UI we're trying to avoid; YAGNI for first cut.)

### 7.3 HoldingsGrid card

Three states:

- **All tracked** (existing): unchanged.
- **All collection**: P&L footer replaced with a `<NoBasisCaption />` component reading "No basis · vault total $X.XX". No P&L number. No StalePill (stale is meaningless without P&L). The "No basis" pill renders next to the qty badge.
- **Mixed**: P&L footer renders the tracked-subset P&L number normally. A small caption beneath: "+K in collection". The "No basis" pill renders next to the qty badge.

The qty badge always shows total `qtyHeld`. Hovering or pressing reveals the split: "5 (2 tracked, 3 collection)" — implementer detail; spec doesn't lock the disclosure mechanism.

Sort dropdown: Plan 5 added 7 sort options. Plan 8 leaves them unchanged. Holdings sorted by P&L $ or P&L % rank all-collection holdings to the bottom (their P&L is null; sort treats null as worst). Holdings sorted by total value (existing) include collection lots in the value math, so a high-value all-collection box sorts to the top. Holdings sorted by market price are unaffected.

### 7.4 HoldingDetailClient

- Header P&L block: renders tracked-subset P&L (current behavior shape, but math comes from `qtyHeldTracked`). When `qtyHeldTracked === 0` and `qtyHeldCollection > 0`, renders "No basis · vault value $X.XX" instead of P&L numbers.
- Current-value display: shows the full vault total. When mixed, a smaller caption beneath the value reads "$X.XX tracked · $Y.YY in collection".
- Lot rows: unknown-cost lots get a "No basis" pill in the row, hide the per-lot P&L line, and the cost column reads "—" instead of "$0.00".
- Decomposition rows / rip rows / sale rows: unchanged structurally; if the underlying lot is unknown-cost, the relevant subline ("realized P&L: …") reads "no basis" with a tooltip rather than a dollar number.

### 7.5 EditPurchaseDialog (extend)

When opened against an unknown-cost lot AND the lot is not a derived child:

- Cost field is greyed with placeholder "Unknown".
- Below it: a "Set cost basis" link/button. Clicking opens a small inline form: number input + Save / Cancel. On save, PATCH with `{unknownCost: false, costCents: <input>}`. After success, the lot is converted; the dialog re-renders in normal-edit mode.

When opened against a derived child (a purchase row created by a rip or decomposition) that is unknown-cost: the cost field is greyed; the "Set cost basis" action is hidden with a tooltip explaining the parent must be converted first.

When opened against a known-cost lot: existing behavior. No reverse-conversion UI — the UI does not surface "I want to make this unknown".

### 7.6 SaleRow / SaleDetailDialog

- SaleRow (`/sales` list, holding detail sales section): when the row's `unknownCost` is true, render a "No basis" pill next to the realized-P&L number. The number itself is unchanged (it's revenue − fees per § 5.6).
- SaleDetailDialog: per-leg badges. Each FIFO leg's row shows a "No basis" pill if its source lot is unknown-cost.

### 7.7 PortfolioHero / DashboardTotalsCard

- Caption updated per § 5.7.
- "Current value" stat is the full vault total (tracked + collection). When `qtyHeldCollectionAcrossPortfolio > 0`, a smaller caption beneath the value reads "$X.XX tracked · $Y.YY in collection".
- "Unrealized P&L" stat uses the tracked subset only. No layout change; the math just moves.
- "Realized P&L" stat is the existing total; bundles unknown-cost sale revenue per § 5.6.

### 7.8 PerformersStrip

No layout change. Filtering rule per § 5.4. When the entire vault is unknown-cost, the strip renders the existing empty state.

## 8. Children inheritance — concrete behaviors

| Action on parent (unknown-cost) | Child purchase row gets `unknown_cost` | Child `cost_cents` |
|---|---|---|
| Rip a pack (single child)              | true  | 0 |
| Decompose a box (N child packs)        | true  | 0 each |
| Edit child (any field)                 | locked (existing rule + `unknownCost` added) | locked |
| Sell from a child lot                  | sale row tagged unknownCost = true | n/a |
| Convert parent (unknown → known)       | children unchanged (see § 6.3 last bullet) | unchanged |

The child-locked rule means converting a parent lot that has already been ripped or decomposed leaves the children in unknown-cost state. The user has to delete the children (via undo-rip or undo-decomposition) and re-create them after conversion to migrate the children's cost basis. This is acceptable because:

- Conversion is rare (the friend's "I remembered what I paid" case).
- Re-doing the rip / decomposition is one click each.
- The alternative — propagating parent flips to children — would silently invalidate their already-stored creation-time invariants and conflict with the child-immutability rule we lean on for sales math.

Document this in the spec; surface as a tooltip on the EditPurchaseDialog "Set cost basis" action when children exist: "Note: this won't update the cost basis of packs already opened from this box. Re-open the box after converting if you want them tracked."

## 9. Tests

### 9.1 Pure service tests (new)

`lib/services/holdings.test.ts`:

- All-tracked aggregation (existing assertions still pass).
- All-collection aggregation: `qtyHeldTracked = 0`, `qtyHeldCollection = qtyHeld`, `totalInvestedCents = 0`.
- Mixed aggregation: split numbers, total preserved.
- Soft-deleted unknown-cost row: still skipped (existing rule).
- Consumed unknown-cost row (qty fully sold): excluded (existing rule).

`lib/services/pnl.test.ts`:

- All-tracked → existing assertions pass.
- All-collection priced: `pnlCents = null`, `currentValueCents > 0`, `currentValueCollectionCents = currentValueCents`.
- All-collection unpriced: existing unpriced assertions still pass; `pnlCents = null` for the same reason.
- Mixed priced: tracked-subset P&L only, full `currentValueCents` includes collection.
- Stale boundary still triggers when priced (collection or tracked).
- Best/worst performers exclude all-collection holdings.
- Portfolio totals: `totalCurrentValueCents = tracked + collection`; `unrealizedPnLCents` uses tracked subset; collection counts surface in the new fields.
- Edge case: `qtyHeldTracked = 0`, `totalInvested = 0`, priced → `pnlCents = null` (the new behavior).
- Sign-flip / `-0` guard tests still pass (existing).

`lib/services/sales.test.ts`:

- FIFO match against an unknown-cost lot: `costBasisCents = 0` per row, `realizedPnLCents = revenue - fees`.
- Mixed FIFO chain (unknown lot first, tracked lot second): correct per-row split, tagged `unknownCost` only on the first leg.
- Existing 11 tests unchanged.

### 9.2 API route tests (new)

- `POST /api/purchases` with `unknownCost: true, costCents: 9999` → row created with `cost_cents = 0`, `unknown_cost = true` (server forces).
- `POST /api/purchases/bulk` happy path → N rows inserted, all `unknown_cost: true`.
- `POST /api/purchases/bulk` with `items.length === 0` → 422.
- `POST /api/purchases/bulk` with one bad `catalogItemId` → 404, no rows inserted.
- `PATCH /api/purchases/[id]` conversion happy path (unknown → known) → row updated, returns updated shape.
- `PATCH /api/purchases/[id]` reverse attempt (known → unknown) → 422 `cannot_unset_basis`.
- `PATCH /api/purchases/[id]` conversion of a rip-source-purchase that has been ripped → succeeds for the parent; children remain unknown-cost (assertion via second GET).
- `PATCH /api/purchases/[id]` conversion attempt against a rip-child (derived) → 422 (existing locked-field path, with `unknownCost` added to the lock).
- `GET /api/holdings` with mixed inventory → response includes new fields, P&L gated correctly.
- `GET /api/dashboard/totals` with mixed inventory → includes new portfolio counts; unrealized math uses tracked subset.

### 9.3 Component tests (new)

- AddPurchaseDialog: checkbox toggles cost-field disabled state; submit body shape correct in both modes.
- AddPurchaseDialog: helper text appears when checkbox checked.
- EditPurchaseDialog: "Set cost basis" button appears for unknown-cost non-derived lot; clicking opens inline form; submit calls PATCH with correct body.
- EditPurchaseDialog: "Set cost basis" hidden for unknown-cost derived child.
- HoldingsGrid card: all-collection state renders NoBasisCaption + "No basis" pill, no P&L number.
- HoldingsGrid card: mixed state renders P&L plus "+K in collection" caption.
- LotRow: unknown-cost lot renders "No basis" pill, hides per-lot P&L.
- SaleRow: renders "No basis" pill when row's `unknownCost` is true.
- Bulk-select action bar: appears when ≥1 cards selected, hides on clear, calls bulk endpoint with correct body.

### 9.4 Test count expectation

Plan 7 ended at 380 tests passing. Plan 8 adds:

- ~12 service-layer tests (holdings/pnl/sales).
- ~10 API route tests.
- ~10 component tests.
- ~5 reused-existing-test extensions (assertions added to existing tests for new fields).

Target: ~412–417 tests passing after Plan 8 ships, all green, tsc clean, `npm run build` clean.

## 10. Migration order

1. Apply pending Plan 7 migration `20260430000001_pricing_automation.sql` first (still pending per `MEMORY.md`). Plan 8 does not depend on it, but interleaving migrations is messy.
2. Apply `20260502000001_unknown_cost_purchases.sql`.
3. Update Drizzle schema (`lib/db/schema/purchases.ts`).
4. Update `tsc --noEmit` + run vitest. Fix any narrowing fallout (the new `unknownCost` field appears in many DTOs).
5. Land service-layer changes (holdings, pnl, sales). All existing tests still green before any UI work.
6. Land API surface changes.
7. Land UI surfaces incrementally — AddPurchaseDialog first (simplest), then HoldingsGrid + LotRow, then EditPurchaseDialog conversion, then bulk-select, then dashboard, then sales surfaces.
8. Smoke test: create an unknown-cost lot via the dialog; create five via bulk-select; convert one; sell from one; ripped one if sealed; verify dashboard caption, P&L gates, performers exclusion.

## 11. Out of scope (deferred to later plans)

- CSV bulk import (CLAUDE.md Phase 4 backlog still applies).
- Per-row qty + date editing in the bulk-select flow.
- Reverse conversion UI (known → known).
- Currency / approximate-basis variants.
- Sharable vault links — Plan 10 backlog already exists for this.

## 12. Standing rules (recap)

- Money in cents.
- ISO `YYYY-MM-DD` for dates.
- No em-dashes in user-facing copy.
- Drizzle for service-role only; user-scoped reads continue to use Supabase client + RLS.
- Direct-to-main shipping (per Plan 5 / 6 / 7 posture).
- `npm run build` must pass before declaring done.
- Push to `origin` regularly during plan execution so Vercel ships.
- No mid-flight status checkpoints during plan execution.
