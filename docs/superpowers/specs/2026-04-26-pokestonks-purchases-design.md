# Pokestonks Plan 3 — Purchases Design Spec

**Date:** 2026-04-26
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan:** 3 of 6 (Purchases)
**Supersedes:** Section 5.3 and parts of Sections 3.4, 6.1, 6.2 of the parent design spec (`2026-04-25-pokestonks-design.md`)

## 1. Purpose

Plan 3 turns the (currently stubbed) "log a purchase" experience into a working end-to-end flow: users can log a purchase against any catalog item, view their holdings as a Collectr-style grid, drill into per-item lot details, edit a row, and soft-delete a row. The dashboard's empty-state placeholder is replaced with a "Total invested" tile.

Plan 3 also introduces **pack ripping** — a sealed-collector-specific feature that doesn't exist in Collectr. Ripping is a disposal event: it consumes one unit from a sealed lot (pack, ETB, box) and creates N child card purchase rows whose snapshotted cost basis is split from the pack's cost. Any cost basis not transferred to a kept card flows to realized P&L as a "rip loss" (most pulls are bulk that gets written off). This makes cost-basis tracking through the rip → keep-the-hits workflow correct from day one.

This plan unblocks Plan 4 (P&L + Dashboard), which will join holdings against current market prices to compute unrealized P&L (and surface rip-realized loss in the realized YTD tile), and Plan 5 (Sales + FIFO), which will introduce sales rows that decrement open lots.

## 2. Non-Goals

- **Sales / realized P&L / FIFO matching for sales.** Deferred to Plan 5. The schema's `sales` table already exists; this plan only writes a defensive `409` check for soft-delete-when-referenced. Note: rip-realized loss IS computed in this plan, because it's bound to the rip event and snapshots immediately. Plan 4's dashboard surfaces it.
- **Unrealized P&L** (current value, delta, percent). Deferred to Plan 4. The holdings list shows `qty_held` and `total_invested` only; current-value columns land in Plan 4.
- **Daily price refresh cron.** Deferred to Plan 6. The detail page reads `last_market_cents` written by the on-demand search path (already shipped in Plan 2 capstone).
- **Multi-portfolio support** (Collectr's "Adding to: Main"). Single portfolio per user.
- **Bulk import / CSV ingest.** Deferred to Plan 6.
- **Vending-machine quick-add preset chips on the form.** Deferred to Plan 6 once enough source history exists to make presets meaningful. Plan 3's `<SourceChipPicker>` uses dynamic recent-sources only.
- **Session-by-session ripping of multi-pack containers.** A 9-pack ETB ripped a pack a week is not directly modeled. Each rip consumes 1 unit of qty from a sealed lot — so an ETB with `quantity=1` can only be ripped once. Users who want pack-by-pack tracking from an ETB would need to manually log 9 pack purchases first. Multi-pack decomposition (an "open ETB" flow that explodes one ETB lot into 9 pack lots) is deferred to a later plan.

## 3. Decisions Locked During Brainstorming

### 3.1 Purchase-flow decisions (this session)

| Question | Decision |
|---|---|
| Sealed-only vs full card/grading fidelity in the form? | Full sealed + cards + condition + graded, single form with conditional sections. |
| Entry points for logging a purchase? | Three: (a) 1-tap "+" on search-result tiles (existing `QuickAddButton`); (b) inline "+" qty stepper on `/holdings/[catalogItemId]`; (c) full form at `/purchases/new` for vending purchases where date/cost/source matters. |
| Source field UX? | Full chip-style picker over the user's top 5 most recent sources, plus a free-text fallback for new entries. |
| Holdings page in this plan? | Yes. `/holdings` aggregated grid + `/holdings/[catalogItemId]` lot detail (separate from `/catalog/[id]`). Plus a dashboard "Total invested" tile. |
| Edit UX? | Modal via shadcn Dialog, opened from "..." overflow on each lot row. `/purchases/[id]/edit` exists as a server-rendered deep-link fallback that uses the same form component. |
| Delete behavior? | Soft-delete via new `deleted_at TIMESTAMPTZ` column. Hard-block (`409`) if any non-soft-deleted sale references the lot. |

### 3.2 Pack-ripping decisions (locked in prior session)

| Question | Decision |
|---|---|
| What is a rip, conceptually? | A disposal event that consumes 1 unit of qty from a sealed lot and creates N child card purchase rows. The pack's cost is split across the kept cards (default = even split, user editable per card). Any unallocated residual flows to realized P&L as a "rip loss". |
| How many cards can be kept (N)? | Arbitrary. N=0 is allowed (no hits worth keeping → entire pack cost = realized loss). N=1 and N=2 are the common cases. N=11+ ("god pack") is allowed too. |
| Cost-basis allocation rule? | Default: even split (`pack_cost / N` per card). Each cell is editable. The system never decides for the user — it picks a sane default and lets the user override. No weighted-by-market-value logic. |
| Where does residual go? | Realized P&L. `realized_loss_cents = pack_cost_cents - sum(child cost_cents)`. Sign: positive = bulk write-off (common); zero = clean transfer; negative = user assigned more cost than pack price (allowed but rare/intentional). Snapshot at rip time, immutable. |
| Are kept-card cost amounts immutable? | Yes, like `sales.matched_cost_cents`. Editing the source pack's `cost_cents` later does NOT retroactively change child card cost basis. |
| What lots are rippable? | Any sealed lot (`kind = 'sealed'`). Card lots cannot be ripped. Catalog `product_type` is not gated — packs, ETBs, boxes, bundles all ripable as one unit each. |
| Pack consumption model? | Each rip consumes 1 unit of `quantity` from the source lot, computed at read time as `quantity - count(rips referencing this purchase)`. The source `purchases.quantity` itself is never mutated by a rip. |
| Rip deletion (undo)? | Hard-delete the `rips` row + soft-delete the child card purchases (re-uses the `deleted_at` column from this plan). Re-credits qty back to the pack lot. Block with `409` if any child card has linked sales (only relevant Plan 5+). |
| Rip provenance UI? | Child card lot rows show "From: [pack name] · ripped 2026-04-26" subtitle when `source_rip_id IS NOT NULL`. The rip itself appears as a special "Ripped" row in the source pack's lot list. |
| Editability of rip-child purchases? | "Hard" fields are locked: `cost_cents`, `quantity`, `purchase_date`, `source_rip_id`, `catalog_item_id`. Editing these would invalidate the rip's snapshotted `realized_loss_cents`. To change them, the user undoes the rip and creates a new one. "Soft" fields ARE editable: `condition`, `is_graded`, `grading_company`, `grade`, `cert_number`, `notes`, `location`. The `source` field stays NULL on rip children (it's not a vending purchase) but is editable if the user wants. |

## 4. Schema Changes

### 4.1 Migration 0004 — `add_purchases_deleted_at`

```sql
ALTER TABLE purchases
  ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Hot path: aggregate open lots per (user, catalog_item). Existing
-- purchases_user_catalog_idx matches all rows including soft-deleted ones,
-- which is wrong for these queries.
CREATE INDEX purchases_user_catalog_open_idx
  ON purchases (user_id, catalog_item_id)
  WHERE deleted_at IS NULL;
```

The existing `purchases_user_catalog_idx` stays (used for "show me everything I've ever bought, including deleted" admin views).

Drizzle schema in `lib/db/schema/purchases.ts` gains:

```ts
deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

### 4.2 Migration 0005 — `add_rips_and_source_rip_id`

```sql
-- Pack ripping: a disposal event that consumes one unit of a sealed lot
-- and (optionally) creates child card purchase rows whose cost basis is
-- snapshotted from the pack at rip time.
CREATE TABLE rips (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  rip_date DATE NOT NULL,
  pack_cost_cents INTEGER NOT NULL CHECK (pack_cost_cents >= 0),
  realized_loss_cents INTEGER NOT NULL,  -- signed: + = bulk write-off, 0 = clean transfer, - = arbitrage
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX rips_user_date_idx ON rips (user_id, rip_date DESC);
CREATE INDEX rips_source_purchase_idx ON rips (source_purchase_id);

ALTER TABLE rips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rips" ON rips FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Cards pulled from a rip carry the rip id so we can render provenance
-- and undo the rip cleanly.
ALTER TABLE purchases
  ADD COLUMN source_rip_id BIGINT REFERENCES rips(id);

CREATE INDEX purchases_source_rip_idx
  ON purchases (source_rip_id)
  WHERE source_rip_id IS NOT NULL;
```

Why `pack_cost_cents` and `realized_loss_cents` are stored on `rips`:
- Immutability per the conventions memo (mirrors `sales.matched_cost_cents`). A user editing the source pack's cost later must not retroactively change historical realized P&L. Snapshot at rip time.
- `realized_loss_cents` is computable from `pack_cost_cents - SUM(child purchases cost_cents * quantity)` but storing it explicitly avoids a join on every realized-P&L query and pins the value at rip time, so even if a child purchase is later soft-deleted via undo-rip, the historical loss number stays.

Drizzle schema additions:

```ts
// lib/db/schema/rips.ts (NEW)
export const rips = pgTable('rips', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
    .notNull()
    .references(() => purchases.id),
  ripDate: date('rip_date').notNull(),
  packCostCents: integer('pack_cost_cents').notNull(),
  realizedLossCents: integer('realized_loss_cents').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// lib/db/schema/purchases.ts (additions)
sourceRipId: bigint('source_rip_id', { mode: 'number' }).references(() => rips.id),
```

Note the circular FK (`purchases.source_rip_id → rips.id`, `rips.source_purchase_id → purchases.id`). This is fine — Postgres allows it; both columns are nullable. We add the FK on `purchases` AFTER creating `rips` to satisfy ordering.

### 4.3 RLS

The existing `"own purchases"` policy already covers SELECT/INSERT/UPDATE/DELETE under `user_id = auth.uid()`. No policy changes there. The new `"own rips"` policy mirrors it. Soft-deleted purchase rows are filtered in application code via `WHERE deleted_at IS NULL` on every read query that exposes lots to the UI.

### 4.4 No other schema changes

All other purchase fields already exist from Plan 1: `condition`, `is_graded`, `grading_company`, `grade`, `cert_number`, `source`, `location`, `notes`, plus the structural fields `purchase_date`, `quantity`, `cost_cents`.

## 5. API Surface

All routes use `createClient()` from `@/lib/supabase/server`. RLS enforces ownership. No Drizzle in user-facing routes.

```
GET    /api/purchases                    list current user's purchases (optional ?catalogItemId=N)
GET    /api/purchases/sources            top 5 distinct sources by recency (for chip picker)
POST   /api/purchases                    create
PATCH  /api/purchases/[id]               update one row
DELETE /api/purchases/[id]               soft-delete; 409 if linked active sales OR if purchase has been ripped

POST   /api/rips                         create a rip event from a sealed purchase + N kept cards
GET    /api/rips/[id]                    fetch a rip + its child rows (for the rip detail dialog)
DELETE /api/rips/[id]                    undo a rip (soft-deletes child cards, re-credits qty); 409 if any child has linked sales

GET    /api/holdings                     aggregated qty_held + total_invested per catalog_item_id
GET    /api/holdings/[catalogItemId]     single-item rollup + lot list (includes rip rows for sealed)
GET    /api/dashboard/totals             total_invested + total_rip_loss rollup for the dashboard tile
```

### 5.1 `POST /api/purchases`

Body (Zod):

```ts
{
  catalogItemId: number,            // required
  quantity: number,                 // int, >= 1, default 1
  costCents: number | null,         // int >= 0; if null, server resolves: msrp_cents -> last_market_cents -> 0
  purchaseDate: string,             // YYYY-MM-DD, default = today (server)
  source?: string | null,           // free text, max 120
  location?: string | null,         // free text, max 120
  notes?: string | null,            // free text, max 1000
  condition?: 'NM'|'LP'|'MP'|'HP'|'DMG' | null,  // required for cards, default NM (server-applies if missing)
  isGraded?: boolean,               // default false
  gradingCompany?: 'PSA'|'CGC'|'BGS'|'TAG' | null,
  grade?: number | null,            // 0..10 step 0.5, required when isGraded
  certNumber?: string | null,
}
```

Server logic:
1. Auth check, return 401 if no user.
2. Zod parse, return 422 with field errors if invalid.
3. Lookup catalog item; if `kind = 'card'`, enforce condition (default NM); if `isGraded`, enforce grading_company + grade. If `kind = 'sealed'`, ignore card-only fields.
4. If `costCents == null`, resolve via Drizzle (catalog_items is public-read so this is safe): `msrp_cents` → `last_market_cents` → `0`. This is a service-role-style read that doesn't leak per-user data.
5. Insert via Supabase client (`from('purchases').insert(...).select().single()`).
6. Return 201 with the inserted row.

The existing `QuickAddButton` currently calls this endpoint with `{ catalogItemId, quantity: 1, costCents: fallbackCents }` where `fallbackCents = row.marketCents`. That's wrong for sealed: vending-machine ETBs are bought at MSRP, but the button records `last_market_cents` as cost basis, which is the secondary-market price.

After this plan, `QuickAddButton` sends `{ catalogItemId, quantity: 1 }` only — no `costCents`, no `source`. The server runs the MSRP-first resolution chain. This makes quick-add correctly record MSRP for sealed (where it's known) and last-market for cards (where MSRP is always null). The `fallbackCents` prop is removed.

### 5.2 `PATCH /api/purchases/[id]`

Body: same shape as POST, all fields optional. Server:
1. Auth check.
2. Zod parse partial; return 422 on invalid.
3. Look up the row (RLS-scoped). If `source_rip_id IS NOT NULL`, the row is a rip child: reject any patch that touches "hard" fields (`costCents`, `quantity`, `purchaseDate`, `catalogItemId`) with `422 { error: 'cannot edit cost/quantity/date on rip-child purchases; undo the rip and recreate' }`. Patches to "soft" fields (condition, grading subfields, notes, location, source) are allowed. The check happens here, before the update, so the user gets a clear field-level error.
4. Update via Supabase client `where id = ? and user_id = auth.uid() and deleted_at IS NULL`. RLS enforces user_id; the deleted_at filter prevents un-deleting a soft-deleted row through PATCH (use a dedicated restore endpoint later if needed).
5. If 0 rows affected, return 404.
6. Return 200 with the updated row.

### 5.3 `DELETE /api/purchases/[id]`

Server:
1. Auth check.
2. Look up the row; if not found (RLS-hidden or already soft-deleted), return 404.
3. Check for any sales rows referencing this purchase: `SELECT id FROM sales WHERE purchase_id = ?`. (RLS on sales is also `user_id = auth.uid()`, so this implicitly scopes to the same user. Sales rows have no soft-delete in the spec, so any row found is treated as a hard block.) If any rows exist: return 409 with `{ error: 'purchase has linked sales', linkedSaleIds: [...] }`.
4. Check for rip events referencing this purchase as the source: `SELECT id FROM rips WHERE source_purchase_id = ?`. If any rows: return 409 with `{ error: 'purchase has been ripped', ripIds: [...] }`. The user must undo the rip(s) first.
5. Set `deleted_at = NOW()` via UPDATE (not DELETE).
6. Return 204.

In Plan 3, no sales rows exist yet, so the linked-sales 409 path is exercised only by tests with seeded data. The ripped-purchase 409 path is fully exercised this plan.

### 5.4 `GET /api/purchases/sources`

```sql
SELECT source, MAX(created_at) AS recent
FROM purchases
WHERE user_id = auth.uid()
  AND source IS NOT NULL
  AND source <> ''
  AND deleted_at IS NULL
GROUP BY source
ORDER BY recent DESC
LIMIT 5;
```

Returns `{ sources: string[] }`. Empty array on a brand-new user.

### 5.5 `GET /api/holdings` and `GET /api/holdings/[catalogItemId]`

`GET /api/holdings`:

```sql
-- Sealed: qty_held subtracts ripped units; cards: qty_held is just SUM(quantity).
-- Rip-derived card lots count exactly like manual card purchases (cost basis transferred at rip time).
WITH rip_consumption AS (
  SELECT source_purchase_id, COUNT(*) AS ripped_units
  FROM rips
  WHERE user_id = auth.uid()
  GROUP BY source_purchase_id
)
SELECT
  ci.id,
  ci.name,
  ci.kind,
  ci.set_name,
  ci.product_type,
  ci.image_storage_path,
  ci.image_url,
  ci.last_market_cents,
  SUM(p.quantity - COALESCE(rc.ripped_units, 0)) AS qty_held,
  SUM(p.cost_cents * (p.quantity - COALESCE(rc.ripped_units, 0))) AS total_invested_cents
FROM purchases p
JOIN catalog_items ci ON ci.id = p.catalog_item_id
LEFT JOIN rip_consumption rc ON rc.source_purchase_id = p.id
WHERE p.user_id = auth.uid()
  AND p.deleted_at IS NULL
GROUP BY ci.id
HAVING SUM(p.quantity - COALESCE(rc.ripped_units, 0)) > 0
ORDER BY MAX(p.created_at) DESC;
```

The CTE attributes ripped units to their source purchase. For card lots there's never a row in `rip_consumption` (cards can't be ripped), so `qty_held` reduces to `SUM(p.quantity)`. For sealed lots, fully-ripped purchases get filtered out by the `HAVING` clause.

In Plan 5 (Sales) this query also subtracts `sales.quantity` from `qty_held`.

`GET /api/holdings/[catalogItemId]`: returns the same per-item rollup plus:
- For card kinds: the array of lot rows (id, purchase_date, quantity, cost_cents, condition, is_graded + grading subfields, source, location, notes, source_rip_id, created_at), ordered by `purchase_date ASC, id ASC` (FIFO order, ready for Plan 5). Lots with `source_rip_id IS NOT NULL` carry an extra joined `sourceRip: { id, ripDate, sourcePurchaseId }` and `sourcePack: { catalogItemId, name }` so the UI can render provenance.
- For sealed kinds: the lot rows AS ABOVE plus a parallel array of rip events for those lots (id, rip_date, pack_cost_cents, realized_loss_cents, kept_card_count, source_purchase_id, notes), so the UI can render the "Ripped on 2026-04-26" history under each pack lot.

### 5.6 `GET /api/dashboard/totals`

```sql
SELECT
  COALESCE((SELECT SUM(cost_cents * quantity)
            FROM purchases
            WHERE user_id = auth.uid() AND deleted_at IS NULL), 0) AS total_invested_cents,
  COALESCE((SELECT SUM(realized_loss_cents)
            FROM rips
            WHERE user_id = auth.uid()), 0) AS total_rip_loss_cents,
  COALESCE((SELECT COUNT(*) FROM purchases
            WHERE user_id = auth.uid() AND deleted_at IS NULL), 0) AS lot_count;
```

Returns `{ totalInvestedCents, totalRipLossCents, lotCount }`. Plan 4 will add `portfolioValueCents`, `unrealizedPnlCents`, `unrealizedPnlPct`. The `totalRipLossCents` value is signed: positive = realized loss YTD-and-prior from bulk write-offs, negative = realized "gain" from cost-basis arbitrage.

### 5.7 `POST /api/rips`

Body (Zod):

```ts
{
  sourcePurchaseId: number,         // the sealed lot being ripped (must belong to current user, kind='sealed')
  ripDate?: string,                 // YYYY-MM-DD, default today
  notes?: string | null,            // free text, max 1000
  keptCards: Array<{
    catalogItemId: number,          // must be kind='card'
    costCents: number,              // int >= 0; user-set, no server defaulting
    condition?: 'NM'|'LP'|'MP'|'HP'|'DMG' | null,  // default NM
    isGraded?: boolean,             // default false
    gradingCompany?: 'PSA'|'CGC'|'BGS'|'TAG' | null,
    grade?: number | null,
    certNumber?: string | null,
    notes?: string | null,
  }>,                               // length >= 0; empty array = N=0 case (full pack to bulk loss)
}
```

Server logic (transactional via Supabase RPC OR a single Postgres function — see Section 11.3 for why we wrap this in a stored procedure):

1. Auth check.
2. Zod parse, return 422 with field errors if invalid.
3. Lookup source purchase. Verify (a) belongs to current user via RLS, (b) `kind` of its catalog item is `'sealed'`, (c) `deleted_at IS NULL`. If any check fails, return 404 or 422 with explicit error code.
4. Compute `qty_remaining` for the source lot: `purchases.quantity - count(rips referencing this purchase)`. If `qty_remaining < 1`, return 422 with `{ error: 'pack already fully ripped' }`.
5. Snapshot `pack_cost_cents = source_purchase.cost_cents` (per-unit cost).
6. Compute `realized_loss_cents = pack_cost_cents - SUM(keptCards[i].costCents)`. (Note: child quantities are always 1, so no multiplication needed; see step 7.)
7. Insert one `rips` row.
8. For each `keptCard`, insert one `purchases` row with: the kept card's `catalogItemId`, `quantity = 1`, `cost_cents = keptCard.costCents`, `purchase_date = rip_date`, `source_rip_id = <new rip id>`, `source = NULL`, condition/grading fields from the keptCard, `created_at = NOW()`. (The kept-card cost is snapshotted here; editing this purchase row later won't change the rip's stored `realized_loss_cents` since that was snapshotted in step 6.)
9. Return 201 with `{ rip, keptPurchases }`.

If any step fails after step 7, the entire transaction rolls back (no orphan rips with missing children, no leaked qty consumption).

### 5.8 `GET /api/rips/[id]`

Server:
1. Auth check.
2. Fetch the rip row (RLS-scoped to current user).
3. Fetch source purchase + catalog item for context.
4. Fetch child purchases via `WHERE source_rip_id = <ripId> AND deleted_at IS NULL` plus their catalog items.
5. Return `{ rip, sourcePurchase, sourceCatalogItem, keptPurchases: [{ purchase, catalogItem }, ...] }`.

### 5.9 `DELETE /api/rips/[id]` — undo rip

Server:
1. Auth check.
2. Fetch rip row; 404 if missing.
3. Check linked sales on any child purchase: `SELECT s.id FROM sales s JOIN purchases p ON p.id = s.purchase_id WHERE p.source_rip_id = <ripId>`. If any: return 409 with `{ error: 'rip has linked sales on its kept cards', linkedSaleIds: [...] }`.
4. In a transaction:
   - Soft-delete child purchases: `UPDATE purchases SET deleted_at = NOW() WHERE source_rip_id = <ripId>`.
   - Hard-delete the rip row: `DELETE FROM rips WHERE id = <ripId>`.
5. Return 204.

The pack lot's qty is automatically re-credited because qty consumption is computed at read time from the count of rips referencing the source purchase. Soft-deleting children (rather than hard-deleting) preserves history if the user later wants to "redo" the rip with a different split — though there's no UI for that in Plan 3.

## 6. UI Surface

### 6.1 Routes

| Route | Strategy | Notes |
|---|---|---|
| `/purchases/new?catalogItemId=N` | Server component renders `<PurchaseForm mode='create'>` inside a Client wrapper | Replaces existing stub. Catalog item lookup happens server-side; the form receives `initialValues` derived from MSRP/last_market_cents. |
| `/purchases/[id]/edit` | Server component | Fallback / deep-link. Renders `<PurchaseForm mode='edit'>` with the row pre-loaded. Primary edit UX is the modal (6.2). |
| `/holdings` | Server component fetches via `/api/holdings` server-side | Collectr-style grid (2-col mobile, 4-col desktop). |
| `/holdings/[catalogItemId]` | Server component fetches via `/api/holdings/[catalogItemId]` | Lot list with inline + stepper, "..." per row → modal Edit / Delete. |
| `/` (dashboard) | Server component | Empty-state placeholder swaps to a "Total invested" Card when `lotCount > 0`. |

### 6.2 Components

All under `components/purchases/` unless noted; rip-related components under `components/rips/`.

- **`<PurchaseForm>`** — props `{ mode: 'create' | 'edit', catalogItem, initialValues?, onSubmit, onCancel }`. Fields per Section 5.1. Conditional rendering: card-only fields (`condition`, graded toggle, grading subfields) only render when `catalogItem.kind === 'card'`. Submit calls `onSubmit(values)` which the parent wires to the appropriate mutation.
- **`<SourceChipPicker>`** — props `{ value, onChange, suggestions: string[] }`. Renders top suggestions as clickable chips; an "Other" chip toggles a free-text input for new sources. Loading skeleton if suggestions are still fetching.
- **`<QuantityStepper>`** — props `{ value, min, max?, onChange }`. Two `<button>`s flanking a numeric label, +/- pill style. Minus disabled at `min`.
- **`<LotRow>`** — props `{ lot }`. One row of the lot list: date, qty, per-unit cost, source. If `lot.sourceRipId IS NOT NULL`, also shows a "From: [pack name] · ripped 2026-04-26" subtitle that links to the source pack's detail page. "..." overflow opens a popover/menu with Edit / Delete.
- **`<RipRow>`** (under `components/rips/`) — props `{ rip, sourcePurchase }`. A specialized row that appears in a sealed lot's lot-list view, between the pack lot rows and the inline + stepper. Shows: rip date, kept-card count, per-card thumbnails (small), `realized_loss_cents` formatted with sign and color (red for loss, green for gain). "..." overflow → "View rip" (opens `<RipDetailDialog>`) and "Undo rip".
- **`<EditPurchaseDialog>`** — shadcn `Dialog` wrapping `<PurchaseForm mode='edit'>`. Closes on success, reopens on validation error. When the row being edited has `source_rip_id IS NOT NULL`, the form disables `cost_cents`, `quantity`, and `purchase_date` fields with an inline note "Locked because this card was pulled from a rip. Undo the rip to change cost basis."
- **`<RipPackDialog>`** (under `components/rips/`) — shadcn `Dialog` opened from a pack lot row's "..." menu via "Rip pack". Walks the user through:
  1. Confirms the source pack (image, name, cost basis snapshot).
  2. A search box to add cards (re-uses the existing `<SearchBox>` from Plan 2 in card-only mode).
  3. As cards are added, each appears as a row with: thumbnail, name, condition picker (NM default), graded toggle, and an editable per-card cost field. Default cost per card = `pack_cost / N` where N is the current count of kept cards (recalculates on add/remove).
  4. A live "Bulk loss" / "Bulk gain" line at the bottom showing `pack_cost - sum(kept_costs)` with sign and color. Editing a per-card cost recomputes this in real time.
  5. Notes textarea (optional).
  6. Submit posts `/api/rips`. On success, closes and the lot list refreshes.
- **`<RipDetailDialog>`** (under `components/rips/`) — read-only dialog showing rip details (source pack, date, kept cards with their cost basis, realized loss). "Undo rip" button at bottom. Used both from the pack-side `<RipRow>` (View rip) and the card-side provenance subtitle.
- **`<DashboardTotalsCard>`** (under `components/dashboard/`) — small server component / client island showing total invested and lot count, with a "View holdings" link. (Plan 4 will add rip-loss + portfolio-value rows.)
- **Existing `<QuickAddButton>`** — drops the `fallbackCents` prop and stops sending `costCents` and `source` in the body. Server resolves both. See Section 5.1 for why.

### 6.3 Inline qty stepper on `/holdings/[catalogItemId]`

Above the lot list, a single qty stepper showing total `qty_held` for that catalog item. Only the **+** button is functional in Plan 3:
- Clicking + posts a new purchase row with `quantity: 1`, `costCents: null` (server resolves per Section 5.1: `msrp_cents → last_market_cents → 0`), `purchaseDate: today`, `source: null`. Identical to the search-tile QuickAddButton, just from inside the holdings detail page.
- The − button is **hidden** in Plan 3. Plan 5 reveals it and wires it to FIFO sale matching.

### 6.4 Sealed lot detail page additions

`/holdings/[catalogItemId]` for a sealed item shows, in order:
1. Header (image, name, set, current FMV from `last_market_cents`).
2. Aggregate qty stepper (Section 6.3).
3. Lot list — each `<LotRow>` for this pack, plus a "**Rip pack**" action in each row's "..." menu (only present when `lot.kind = 'sealed'` and `qty_remaining > 0`).
4. **Rip history** — for each rip referencing one of these lots, a `<RipRow>` showing date, kept count, realized loss, "..." menu.
5. (Plan 6 polish) An overall "Open boxes" CTA that runs the planned ETB-decomposition flow. Not in Plan 3.

### 6.4 Form layout (mobile-first)

Per Collectr's pattern (file2.png in `docs/references/collectr_examples/`), the form is a vertical stack on mobile, two-column above 768px:

```
┌──────────────────────────────────────┐
│  [image]  Pikachu ex                 │
│           Ascended Heroes            │
│           SIR · 276/217 · Holofoil   │
└──────────────────────────────────────┘

  Date            [2026-04-26  ▼]
  Quantity        [-] [  1  ] [+]
  Per-unit cost   [$  1170.87       ]   ← defaults from last_market_cents

  Source          [Walmart vending] [Target] [Costco] [+ Other]
  Location        [Walmart - Springfield        ]
  Notes           [                              ]
                  [                              ]

  ─────────────── Card details ───────────────    ← only when kind='card'
  Condition       [NM ▼]
  ☐ This is graded
    └── (when on)
        Grading company  [PSA ▼]
        Grade            [10.0 ▼]
        Cert number      [optional             ]

  [ Cancel ]                       [ Log purchase ]
```

For sealed items, the "Card details" section is omitted entirely. For graded cards, the grading subfields slide in below the toggle.

## 7. Data Flow

All client-side data goes through TanStack Query hooks calling `/api/*` routes. New hooks in `lib/query/hooks/`:

- `usePurchases({ catalogItemId? })`, `usePurchaseSources()`
- `useCreatePurchase()`, `useUpdatePurchase()`, `useDeletePurchase()` — each invalidates `['purchases']`, `['holdings']`, `['dashboardTotals']`, `['purchaseSources']`.
- `useHoldings()`, `useHolding(catalogItemId)` — invalidated by rip mutations as well as purchase mutations, since rips affect `qty_held`.
- `useDashboardTotals()`
- `useRip(id)` — for the rip detail dialog
- `useCreateRip()`, `useDeleteRip()` — each invalidates `['holdings']`, `['holding', sourceCatalogItemId]`, `['holding', keptCatalogItemId]` (one for each kept card), `['dashboardTotals']`, `['rips']`. Mutations carry the affected `sourceCatalogItemId` and `keptCatalogItemIds[]` in their context so invalidation can be precise.

Server components on `/holdings`, `/holdings/[id]`, `/`, `/purchases/new`, `/purchases/[id]/edit` fetch initial data with the Supabase server client to avoid request waterfalls. Client islands (the form, the lot list with mutations, the qty stepper, the rip dialog) use the hooks for mutation-driven invalidation.

## 8. Validation

`lib/validation/purchase.ts` exports a Zod schema shared by `<PurchaseForm>` and the API routes:

```ts
export const purchaseInputSchema = z.object({
  catalogItemId: z.number().int().positive(),
  quantity: z.number().int().min(1).default(1),
  costCents: z.number().int().nonnegative().nullable().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (s) => new Date(s).getTime() <= Date.now(),
    'Purchase date cannot be in the future'
  ).optional(),  // server defaults to today when missing
  source: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  condition: z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']).nullable().optional(),
  isGraded: z.boolean().default(false),
  gradingCompany: z.enum(['PSA', 'CGC', 'BGS', 'TAG']).nullable().optional(),
  grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
  certNumber: z.string().max(64).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.isGraded) {
    if (!v.gradingCompany) ctx.addIssue({ path: ['gradingCompany'], code: 'custom', message: 'Required for graded cards' });
    if (v.grade == null) ctx.addIssue({ path: ['grade'], code: 'custom', message: 'Required for graded cards' });
  }
});

export const purchasePatchSchema = purchaseInputSchema.partial();
```

`lib/validation/rip.ts` exports the rip schema:

```ts
const keptCardSchema = z.object({
  catalogItemId: z.number().int().positive(),
  costCents: z.number().int().nonnegative(),  // user must set; no defaulting
  condition: z.enum(['NM', 'LP', 'MP', 'HP', 'DMG']).nullable().optional(),
  isGraded: z.boolean().default(false),
  gradingCompany: z.enum(['PSA', 'CGC', 'BGS', 'TAG']).nullable().optional(),
  grade: z.number().min(0).max(10).multipleOf(0.5).nullable().optional(),
  certNumber: z.string().max(64).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.isGraded) {
    if (!v.gradingCompany) ctx.addIssue({ path: ['gradingCompany'], code: 'custom', message: 'Required for graded cards' });
    if (v.grade == null) ctx.addIssue({ path: ['grade'], code: 'custom', message: 'Required for graded cards' });
  }
});

export const ripInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  ripDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
    (s) => new Date(s).getTime() <= Date.now(),
    'Rip date cannot be in the future'
  ).optional(),
  notes: z.string().max(1000).nullable().optional(),
  keptCards: z.array(keptCardSchema),  // can be empty (N=0 case)
});
```

The schema does NOT enforce `sum(keptCards.costCents) === pack_cost_cents` — that's the whole point of the rip-loss feature. The server computes residual loss and stores it; the user is free to under- or over-allocate.

API routes wrap with kind-aware logic on the server (require condition for cards, ignore card-only fields for sealed; verify source purchase is a sealed lot for rips).

## 9. Error Handling

| Code | Cause | UX |
|---|---|---|
| 401 | not authenticated | Client redirects to `/login` |
| 404 | row not found / RLS-hidden / already soft-deleted | Toast "purchase not found" or "rip not found" |
| 409 | DELETE on a purchase when active sales reference it | Toast "this purchase has N sales recorded against it. Delete the sale first." (Plan 5 wires this; Plan 3 keeps the check but it's only exercised in tests.) |
| 409 | DELETE on a purchase that's been ripped | Toast "this purchase has N rips recorded against it. Undo the rip(s) first." Includes a link to each rip. |
| 409 | DELETE on a rip when any kept-card child has linked sales | Toast "one or more cards from this rip have been sold. Reverse the sale first." |
| 422 | POST `/api/rips` with non-sealed source, fully-ripped pack, or kept card that's not `kind='card'` | Toast with specific message (`{ error: 'pack already fully ripped' }`, `{ error: 'rip source must be a sealed lot' }`, `{ error: 'kept card must be kind=card' }`) |
| 422 | Zod validation failed | Field-level errors mapped back to form fields |
| 5xx / network | Transient | TanStack retries GETs; mutations show error toast with Retry |

All API errors return `{ error: string, ...details }` JSON. The toast helper (`lib/utils/toast.ts`, already exists from Plan 2) maps codes to default messages with override.

## 10. Testing

### 10.1 Unit (`vitest`, node env)

- `lib/validation/purchase.ts` — schema accepts/rejects: negative cost, future date, missing grading fields when `isGraded=true`, oversized strings, condition enum out-of-range.
- `lib/validation/rip.ts` — schema accepts: empty `keptCards` (N=0), N=1, N=11+, sum(keptCosts) > packCost, sum(keptCosts) < packCost, sum(keptCosts) == packCost. Rejects: future ripDate, kept card with negative cost, kept card with isGraded but missing company.
- `lib/services/holdings.ts` — `aggregateHoldings(rows, rips)` ignores soft-deleted, subtracts rip consumption from sealed qty, sums cents correctly, returns zero rows when input empty. `aggregateLot(rows, rips)` returns lots-plus-rips for a single catalog item.
- `lib/services/rips.ts` — `computeRealizedLoss(packCostCents, keptCostCents[])` returns the signed residual; handles empty array (= packCost), arrays summing to less (positive residual), more (negative residual), and equal (zero).

### 10.2 API route integration (`vitest`, node env, real test DB via Supabase local)

- `POST /api/purchases` — happy path with full payload, quick-add path with null cost (resolves to MSRP, then last_market, then 0), 401 unauth, 422 invalid date.
- `PATCH /api/purchases/[id]` — happy path, 404 for other-user row (RLS), 422 invalid grade, 404 for already-soft-deleted row, 422 with `cannot edit cost/quantity/date on rip-child purchases` when patching `costCents` / `quantity` / `purchaseDate` / `catalogItemId` on a row whose `source_rip_id IS NOT NULL`, happy 200 when patching only soft fields (condition, notes) on the same rip-child row.
- `DELETE /api/purchases/[id]` — soft-delete sets `deleted_at`, second delete is 404 (idempotent at the resource level), 409 when seeded sale row references the lot, 409 when seeded rip references the purchase.
- `GET /api/purchases/sources` — empty user returns `[]`; populated user with 7 distinct sources returns top 5 by recency, excludes nulls and empty strings, excludes soft-deleted rows.
- `GET /api/holdings` — single user with 3 catalog items + 5 lots returns 3 grouped rows with correct sums; soft-deleted rows excluded; items with `qty_held = 0` excluded; sealed lot fully ripped is excluded; sealed lot partially ripped shows correct remaining qty.
- `POST /api/rips`:
  - Happy N=1: pack cost $5, keep one card at $5 cost. Verify rip row has `realized_loss_cents = 0`. Child purchase row has `source_rip_id` set, `cost_cents = 500`, `quantity = 1`.
  - Happy N=0 (full bulk loss): no kept cards. Rip row has `realized_loss_cents = 500` (full pack cost). No child rows.
  - Happy N=2 even-split: pack cost $5, two cards at $2.50 each. Realized loss = 0.
  - Happy N=2 with overflow: pack cost $5, two cards at $3 each. Realized loss = -$1 (gain).
  - Happy god pack N=11: pack cost $5, eleven cards at varying costs summing to $5. Realized loss = 0.
  - 422 when source purchase is `kind='card'`.
  - 422 when source purchase is fully ripped (rip count >= quantity).
  - 422 when a kept card's catalog item is `kind='sealed'`.
  - 404 when source purchase belongs to another user (RLS-hidden).
  - Transactional rollback: simulate a Postgres error mid-insert (e.g., a kept catalog_item_id that doesn't exist), verify no rip row and no child purchases were committed.
- `GET /api/rips/[id]` — returns rip + source + kept children with catalog joins; 404 for other-user rip.
- `DELETE /api/rips/[id]` — soft-deletes children, hard-deletes rip, re-credits qty (verify subsequent `GET /api/holdings` shows the pack lot as held again). 409 when a child has linked sales (Plan 5+ exercise; Plan 3 seeds manually).
- `GET /api/dashboard/totals` — empty user returns zeros; user with purchases returns total_invested; user with rips returns the right total_rip_loss_cents (signed sum).

### 10.3 Component (`vitest`, happy-dom)

- `<PurchaseForm>` — kind=sealed hides card section; kind=card shows it; graded toggle reveals grading subfields; submit converts dollars input to cents; Cancel calls `onCancel`. When `initialValues.sourceRipId` is set, cost/quantity/date inputs render disabled with the lock note.
- `<SourceChipPicker>` — chips render from prop, clicking a chip sets value, "Other" reveals input, typing into input updates value, blur commits.
- `<QuantityStepper>` — increment, decrement, lower bound at min.
- `<RipPackDialog>`:
  - Initial state: pack cost displayed, "Bulk loss" line shows pack cost in red.
  - Add one card: card row appears with cost field defaulting to pack_cost. Bulk loss flips to $0.
  - Add second card: both cards default to pack_cost / 2. Bulk loss stays at $0.
  - Edit card #1 cost manually to a higher value: card #2 cost stays the same; bulk loss recomputes (negative = green "gain").
  - Remove a card: remaining card defaults adjust.
  - Submit: posts the right body to `/api/rips`, dialog closes on success.
- `<LotRow>` for a card with `sourceRipId IS NOT NULL` shows the "From: pack · ripped DATE" subtitle.
- `<RipRow>` shows realized loss with correct sign and color.

### 10.4 Out of scope (deferred)

E2E (Playwright) for the full quick-add → holdings → edit → soft-delete and rip → undo-rip flows lands in Plan 6. Visual regression / screenshot diffs deferred indefinitely.

## 11. Migration & Rollout

### 11.1 Migrations

Direct-to-main per the project's stated posture (no feature branches). Each task in the implementation plan ships as its own commit. Vercel auto-deploys on push.

Two migrations:
- **0004 — `add_purchases_deleted_at`**: adds `deleted_at` column + partial open-lots index.
- **0005 — `add_rips_and_source_rip_id`**: creates `rips` table, RLS policy, indexes, and `purchases.source_rip_id` FK.

Drizzle migrations generated via `npm run db:generate`, applied via `npm run db:migrate` (per the `feedback_stack_gotchas.md` memo: not `db:push`, which needs a TTY).

### 11.2 Backfill / data migration

None required. New columns (`deleted_at`, `source_rip_id`) are nullable with no default — existing rows pick up `NULL`, which is correct for both. The `rips` table starts empty.

### 11.3 Why `POST /api/rips` should use a Postgres function (not just a multi-step Supabase call)

A rip is multi-row insert (one rip + N child purchases) and must be atomic — partial rips would be a data integrity disaster (orphan children pointing at no rip, or a rip with the wrong child count, both break realized-P&L math).

Two implementation options:
- **(a)** Use Supabase's `rpc()` to call a Postgres function `create_rip(...)` that wraps everything in a single transaction. Cleanest, fully atomic, but requires a stored procedure (Plan 1 didn't introduce any).
- **(b)** Use Drizzle's `db.transaction(async (tx) => { ... })` from the API route. Drizzle is service-role and bypasses RLS, but for this specific endpoint we'd validate ownership manually (lookup source_purchase, assert `user_id = auth.uid()` ourselves) and then run the multi-row insert in one transaction.

Option (b) is the path of least resistance: no stored procedures, fits the existing codebase patterns. The convention "Drizzle for service-role contexts only" is preserved because we're explicitly checking user_id ourselves before any write — the route effectively acts as a service-role RPC with manual auth. The check on `source_purchase.user_id === user.id` happens BEFORE the transaction starts.

Plan 3 picks **option (b)**. If we later see the rip flow growing into a hot path, we can convert to (a) without breaking the API contract.

## 12. Open Questions

1. **ETB / box decomposition flow** — when ripping a lot whose product is "Booster Box" or "Elite Trainer Box" (containing many packs), the current model treats it as a single rip event. A future plan can introduce an "Open container" flow that explodes one ETB lot into 9 pack purchase rows (cost split evenly across the packs), then each pack can be ripped independently over time. Out of scope for Plan 3.

2. **Restore (undo soft-delete)** — there's no restore-purchase or restore-rip-children endpoint in this plan. If the user soft-deletes a row by mistake, they currently can't recover it via UI (DB-level recovery via Supabase Studio works). Worth a small Plan 6 polish item: a "..." menu on a settings "Trash" view.

3. **Per-rip notes** — the rip row has a `notes` field but the current `<RipPackDialog>` only exposes a single notes box. Per-card notes during a rip aren't collected (the keptCardSchema accepts them but the UI doesn't surface them in Plan 3). Polish item.

## 13. References

- Parent design spec: `docs/superpowers/specs/2026-04-25-pokestonks-design.md`
- Plan 2 capstone (DB-first search): `docs/superpowers/specs/2026-04-26-pokestonks-db-first-search-design.md`
- Collectr screenshots: `docs/references/collectr_examples/`
  - `file.png`, `file3.png`, `file5.png` — search results with "+" tiles
  - `file2.png`, `file2.jpg` — detail page with "Adding to: Main" qty stepper and graded section
  - `file4.png` — portfolio grid (matches the planned `/holdings` layout)
- Existing scaffolding to be replaced/extended:
  - `app/api/purchases/route.ts` (placeholder POST) → real CRUD
  - `app/(authenticated)/purchases/new/page.tsx` (stub) → form
  - `app/(authenticated)/holdings/page.tsx` (stub) → grid
  - `components/catalog/QuickAddButton.tsx` (works) → minor tweak (drop `fallbackCents` prop, server-resolves cost)
- New Plan 3 artifacts:
  - `lib/db/schema/rips.ts`
  - `lib/validation/purchase.ts`, `lib/validation/rip.ts`
  - `lib/services/holdings.ts`, `lib/services/rips.ts`
  - `app/api/rips/route.ts`, `app/api/rips/[id]/route.ts`
  - `app/api/holdings/route.ts`, `app/api/holdings/[catalogItemId]/route.ts`
  - `app/api/dashboard/totals/route.ts`
  - `app/(authenticated)/holdings/[catalogItemId]/page.tsx`
  - `app/(authenticated)/purchases/[id]/edit/page.tsx`
  - `components/purchases/PurchaseForm.tsx`, `SourceChipPicker.tsx`, `QuantityStepper.tsx`, `LotRow.tsx`, `EditPurchaseDialog.tsx`
  - `components/rips/RipPackDialog.tsx`, `RipDetailDialog.tsx`, `RipRow.tsx`
  - `components/dashboard/DashboardTotalsCard.tsx`
  - `lib/query/hooks/usePurchases.ts`, `useHoldings.ts`, `useRips.ts`, `useDashboardTotals.ts`
