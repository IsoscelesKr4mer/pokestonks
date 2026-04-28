# Pokestonks Plan 3.5 — Box Decomposition Design Spec

**Date:** 2026-04-27
**Status:** Draft, pending user review
**Author:** Brainstorming session, Michael Dixon
**Plan:** 3.5 (continuation of Plan 3 Purchases + Pack Ripping; Plan 4 P&L + Dashboard remains the next major plan)
**Supersedes:** Section 2 (`Session-by-session ripping of multi-pack containers`) and Section 12 question 1 (`ETB / box decomposition flow`) of `docs/superpowers/specs/2026-04-26-pokestonks-purchases-design.md`.

## 1. Purpose

Plan 3 shipped a single rip model: one rip consumes 1 unit of a sealed lot and creates N kept card purchases. That covers ripping a booster pack into hits but not the prior step — opening a box (booster box, ETB, Tin, Build & Battle, Premium Collection, etc.) into the booster packs it contains.

Plan 3.5 adds **box decomposition**. The user clicks "Open box" on a sealed lot whose `product_type` carries packs, and the system creates a single child pack purchase row with `quantity = pack_count` and per-pack cost basis split from the source box. From there, the existing Plan 3 rip flow takes over: ripping a booster pack into kept cards.

This is the "two-layer" workflow real Pokémon TCG collectors want:

```
ETB (cost basis $50)
  → Open box → 9 × Booster Pack (cost basis $5.56 each)
    → Rip pack → 1 kept card (cost basis = $5.56) + bulk loss $0
```

## 2. Non-Goals

- **Tracking ETB / Tin / Build & Battle accessories.** Promo cards, dice, sleeves, build-decks: not modeled. The full source cost goes to the packs; non-pack contents are implicitly value $0. Power users who want to track an ETB promo can manually add it as a standalone purchase.
- **Pack count override at decompose time.** The catalog's `pack_count` is treated as ground truth. Regional anomalies (rare retail variants with one extra/missing pack) are not supported in v1; users with such items can manually log packs and skip the decompose flow.
- **Auto-import of missing booster pack catalog rows.** If a set's Booster Pack isn't in `catalog_items` yet, the decompose flow returns 422 with a clear message. The user goes to `/catalog`, searches, imports the row, returns. We do not silently fetch from TCGCSV mid-decompose.
- **Editable per-pack cost on decomposition children.** The cost basis of a decomposition-child pack lot is locked, mirroring rip-child immutability from Plan 3. To change cost, the user undoes the decomposition.
- **A new "Decomposed" P&L line on the dashboard.** Rounding residual is sub-$0.10 per decomposition; not material. Plan 4 (P&L + Dashboard) may surface it later.
- **Extending Plan 3's rip flow to also handle box → packs.** Schema and UI stay separate per the locked decisions.

## 3. Decisions Locked During Brainstorming

| Question | Decision |
|---|---|
| What sealed lots can be decomposed? | Any with `pack_count > 1`. The product_type → pack_count map (Section 4.1) covers Booster Box (36), Booster Bundle (6), ETB (9), Build & Battle (4), Premium Collection (6), ex Box (6), Tin (3), Pin Collection (3), Collection Box (4), Collection (4), Blister (3). Booster Pack and product_types not in the map have `pack_count = NULL` (or 1) and are not decomposable. |
| UI surface? | Separate `<OpenBoxDialog>` component. The "..." menu on a sealed lot in `/holdings/[catalogItemId]` shows "Open box" when the source has `pack_count > 1` AND `qty_remaining > 0`. The existing "Rip pack" stays available for any sealed lot regardless of pack count, so users keep the option of ripping an entire ETB at once into kept cards if they prefer (suboptimal but not blocked). |
| Schema model? | New `box_decompositions` table (parallel to `rips`). New `source_decomposition_id` column on `purchases`. The two events (rip and decompose) stay distinct because their invariants differ (variable vs fixed N, manual vs even cost split, signed P&L loss vs rounding residual). |
| Pack lot row shape? | One purchase row with `quantity = pack_count`. The existing rip flow already handles `quantity > 1` (each rip consumes 1 unit of qty). N separate rows would be wasteful; the packs are identical SKUs from the user's perspective. |
| Cost split rule? | Even split: `per_pack_cost_cents = Math.round(source_cost_cents / pack_count)`. The integer rounding residual (`source_cost - per_pack * count`) is snapshotted on the decomposition row in `rounding_residual_cents`. Typically -9..+9 cents. |
| Missing booster pack catalog row? | Block with 422 + clear error (`booster pack catalog row not found for this set`). User imports via `/catalog`, returns. |
| Pack count override? | None. Catalog metadata is ground truth. |
| Decomposition-child cost editability? | Locked. Same `HARD_FIELDS_FOR_RIP_CHILDREN` rule from Plan 3 extends to children where `source_decomposition_id IS NOT NULL`. |
| Non-pack contents (ETB promo, accessories)? | Not tracked. Cost goes 100% to packs. |
| Undo decomposition? | Yes, mirror of undo-rip. Hard-delete the `box_decompositions` row, soft-delete the child pack purchase. Re-credits qty on the source box automatically (qty consumption is computed at read time from the count of decompositions referencing the source). Block with 409 if any rips reference the child pack purchase or any sales reference it (mostly a Plan 5 concern). |

## 4. Schema Changes

### 4.1 Migration 0006 — `add_catalog_items_pack_count`

```sql
ALTER TABLE catalog_items
  ADD COLUMN pack_count INTEGER;

-- One-shot seed from the product_type → count map. Existing rows get the right
-- value; future TCGCSV imports populate this column the same way (see Plan 3.5
-- Section 8.2).
UPDATE catalog_items SET pack_count = 36 WHERE product_type = 'Booster Box';
UPDATE catalog_items SET pack_count = 6  WHERE product_type = 'Booster Bundle';
UPDATE catalog_items SET pack_count = 9  WHERE product_type = 'Elite Trainer Box';
UPDATE catalog_items SET pack_count = 4  WHERE product_type = 'Build & Battle';
UPDATE catalog_items SET pack_count = 6  WHERE product_type = 'Premium Collection';
UPDATE catalog_items SET pack_count = 6  WHERE product_type = 'ex Box';
UPDATE catalog_items SET pack_count = 3  WHERE product_type = 'Tin';
UPDATE catalog_items SET pack_count = 3  WHERE product_type = 'Pin Collection';
UPDATE catalog_items SET pack_count = 4  WHERE product_type = 'Collection Box';
UPDATE catalog_items SET pack_count = 4  WHERE product_type = 'Collection';
UPDATE catalog_items SET pack_count = 3  WHERE product_type = 'Blister';
UPDATE catalog_items SET pack_count = 1  WHERE product_type = 'Booster Pack';
-- Anything else stays NULL (not decomposable).
```

The product_type → count map lives in `lib/services/tcgcsv.ts` next to `SEALED_PATTERNS` so the catalog-import path also populates `pack_count` on new rows. The migration's UPDATE statements are idempotent for the seed.

Drizzle schema in `lib/db/schema/catalogItems.ts` gains:

```ts
packCount: integer('pack_count'),
```

### 4.2 Migration 0007 — `add_box_decompositions`

```sql
CREATE TABLE box_decompositions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  source_purchase_id BIGINT NOT NULL REFERENCES purchases(id),
  decompose_date DATE NOT NULL,
  source_cost_cents INTEGER NOT NULL,
  pack_count INTEGER NOT NULL,
  per_pack_cost_cents INTEGER NOT NULL,
  rounding_residual_cents INTEGER NOT NULL,  -- signed; typically -9..+9
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT box_decompositions_source_cost_nonneg CHECK (source_cost_cents >= 0),
  CONSTRAINT box_decompositions_pack_count_positive CHECK (pack_count > 0),
  CONSTRAINT box_decompositions_per_pack_nonneg CHECK (per_pack_cost_cents >= 0)
);
CREATE INDEX box_decompositions_user_date_idx ON box_decompositions (user_id, decompose_date DESC);
CREATE INDEX box_decompositions_source_purchase_idx ON box_decompositions (source_purchase_id);

ALTER TABLE purchases
  ADD COLUMN source_decomposition_id BIGINT REFERENCES box_decompositions(id);

CREATE INDEX purchases_source_decomp_idx
  ON purchases (source_decomposition_id)
  WHERE source_decomposition_id IS NOT NULL;
```

Drizzle schema additions:

```ts
// lib/db/schema/boxDecompositions.ts (NEW)
export const boxDecompositions = pgTable('box_decompositions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: uuid('user_id').notNull(),
  sourcePurchaseId: bigint('source_purchase_id', { mode: 'number' })
    .notNull()
    .references(() => purchases.id),
  decomposeDate: date('decompose_date').notNull(),
  sourceCostCents: integer('source_cost_cents').notNull(),
  packCount: integer('pack_count').notNull(),
  perPackCostCents: integer('per_pack_cost_cents').notNull(),
  roundingResidualCents: integer('rounding_residual_cents').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// lib/db/schema/purchases.ts (additions)
sourceDecompositionId: bigint('source_decomposition_id', { mode: 'number' }),
```

Like `source_rip_id` from Plan 3, the `source_decomposition_id` Drizzle definition omits the `.references(() => boxDecompositions.id)` call to avoid the circular type-cycle issue from Plan 3 Task 3 fix `f121161`. The DB-level FK is established by the migration above.

### 4.3 Supabase RLS migration — `supabase/migrations/20260427000000_box_decompositions_rls.sql`

```sql
ALTER TABLE box_decompositions
  ADD CONSTRAINT box_decompositions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE box_decompositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own decompositions"
  ON box_decompositions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Same pattern as Plan 1's RLS migration and Plan 3's `rips` RLS migration. Applied via direct SQL execution because `scripts/migrate-rls.ts` lacks idempotency tracking (already known polish item).

## 5. API Surface

```
POST   /api/decompositions                  create a decomposition (open box → N packs)
GET    /api/decompositions/[id]             fetch decomposition + source + child pack purchase
DELETE /api/decompositions/[id]             undo (soft-delete pack child, hard-delete row)
```

Plus extensions to existing routes (Section 5.5).

### 5.1 `POST /api/decompositions`

Body (Zod):

```ts
{
  sourcePurchaseId: number,
  decomposeDate?: string,   // YYYY-MM-DD; server defaults to today
  notes?: string | null,    // max 1000
}
```

Server logic (Drizzle transaction with manual auth, mirroring `POST /api/rips` per Plan 3 Section 11.3 option b):

1. Auth check, return 401 if no user.
2. Zod parse, return 422 with field errors if invalid.
3. Lookup `sourcePurchase` via Drizzle (`eq(id) AND eq(userId, user.id)`). Return 404 if missing or `deletedAt != null`.
4. Lookup `sourceItem = catalog_items[sourcePurchase.catalogItemId]`. Verify:
   - `kind === 'sealed'` (else 422 `'decompose source must be a sealed lot'`)
   - `pack_count IS NOT NULL AND pack_count > 1` (else 422 `'this product type is not decomposable'`)
5. Compute `qty_remaining = sourcePurchase.quantity - count(rips referencing) - count(decompositions referencing)`. If `< 1` return 422 `'box already fully consumed'`.
6. Lookup pack catalog row:
   ```sql
   SELECT * FROM catalog_items
   WHERE kind='sealed'
     AND product_type='Booster Pack'
     AND (set_code = $sourceSetCode OR (set_code IS NULL AND set_name = $sourceSetName))
   LIMIT 1;
   ```
   Return 422 `{ error: 'booster pack catalog row not found for this set', setCode, setName }` if no match.
7. Snapshot `source_cost_cents = sourcePurchase.costCents`. Compute `per_pack_cost = Math.round(source_cost / pack_count)`, `rounding_residual = source_cost - (per_pack * pack_count)`.
8. Drizzle transaction:
   - Insert `box_decompositions` row.
   - Insert one child `purchases` row: `catalog_item_id = packCatalog.id`, `quantity = pack_count`, `cost_cents = per_pack`, `purchase_date = decompose_date`, `source_decomposition_id = newRow.id`, `condition = NULL` (sealed), `is_graded = false`, `source = NULL`, `location = NULL`, `notes = NULL`.
9. Return 201 with `{ decomposition, packPurchase }`.

If anything fails after step 8 starts, the transaction rolls back. No orphan decompositions.

### 5.2 `GET /api/decompositions/[id]`

1. Auth check.
2. Drizzle lookup of decomposition (`eq(id) AND eq(userId, user.id)`). 404 if missing.
3. Look up source purchase + source catalog item.
4. Look up pack child purchase (`source_decomposition_id = id AND deleted_at IS NULL`) + pack catalog item.
5. Return `{ decomposition, sourcePurchase, sourceCatalogItem, packPurchase, packCatalogItem }`.

### 5.3 `DELETE /api/decompositions/[id]` — undo decomposition

1. Auth check.
2. Drizzle lookup. 404 if missing.
3. Find the child pack purchase id (`SELECT id FROM purchases WHERE source_decomposition_id = ?`).
4. Block if any rips reference the child: `SELECT id FROM rips WHERE source_purchase_id = ?`. Return 409 `{ error: 'decomposition has linked rips on its packs', linkedRipIds }` if any.
5. Block if any sales reference the child: `SELECT id FROM sales WHERE purchase_id = ?`. Return 409 `{ error: 'decomposition has linked sales on its packs', linkedSaleIds }` if any. (Plan 5 concern; defensive in Plan 3.5.)
6. Drizzle transaction:
   - Soft-delete child pack purchase: `UPDATE purchases SET deleted_at = NOW() WHERE source_decomposition_id = ?`.
   - Hard-delete decomposition row: `DELETE FROM box_decompositions WHERE id = ?`.
7. Return 204.

The source box's qty_remaining is automatically restored because qty consumption is computed at read time as `quantity - count(rips) - count(decompositions)`.

### 5.4 Pure functions

`lib/services/decompositions.ts` adds:

```ts
export function computePerPackCost(sourceCostCents: number, packCount: number): {
  perPackCostCents: number;
  roundingResidualCents: number;
} {
  if (packCount <= 0) throw new Error('packCount must be > 0');
  const perPack = Math.round(sourceCostCents / packCount);
  const residual = sourceCostCents - perPack * packCount;
  return { perPackCostCents: perPack, roundingResidualCents: residual };
}
```

Pure, fully unit-testable, no DB or HTTP. Used by `POST /api/decompositions` and the `<OpenBoxDialog>` preview.

### 5.5 Extensions to existing routes

**`PATCH /api/purchases/[id]`** — extend the rip-child immutability check. The check fires when EITHER `source_rip_id IS NOT NULL` OR `source_decomposition_id IS NOT NULL`. Same `HARD_FIELDS_FOR_RIP_CHILDREN` set (rename to `HARD_FIELDS_FOR_DERIVED_CHILDREN` for clarity). Error message becomes:

```
"cannot edit cost/quantity/date on derived purchases (rip or decomposition children); undo the parent event and recreate"
```

**`DELETE /api/purchases/[id]`** — add a third 409 check after linked-sales and linked-rips:

```ts
const { data: decomps } = await supabase
  .from('box_decompositions')
  .select('id')
  .eq('source_purchase_id', numericId);
if (decomps && decomps.length > 0) {
  return NextResponse.json(
    { error: 'purchase has been decomposed', decompositionIds: decomps.map((d) => d.id) },
    { status: 409 }
  );
}
```

**`GET /api/holdings`** — the underlying `aggregateHoldings` service grows a third argument:

```ts
export function aggregateHoldings(
  purchases: readonly RawPurchaseRow[],
  rips: readonly RawRipRow[],
  decompositions: readonly RawDecompositionRow[],
): Holding[];
```

Both rip and decomposition events consume 1 unit of qty from their `source_purchase_id`. The route fetches both events arrays and passes them in. Existing behavior unchanged otherwise.

**`GET /api/holdings/[catalogItemId]`** — extend the response:

For sealed items: response gains a `decompositions` array (parallel to `rips`):
```ts
decompositions: Array<{
  id: number;
  decomposeDate: string;
  sourceCostCents: number;
  packCount: number;
  perPackCostCents: number;
  roundingResidualCents: number;
  sourcePurchaseId: number;
  notes: string | null;
}>;
```

For pack child lots: each lot gains `sourceDecomposition` and `sourceContainer` provenance fields (parallel to existing `sourceRip` and `sourcePack`):
```ts
sourceDecomposition: { id: number; decomposeDate: string; sourcePurchaseId: number } | null;
sourceContainer: { catalogItemId: number; name: string } | null;
```

A given child lot has at most one set of provenance populated. `sourceRip`/`sourcePack` for rip-derived card lots; `sourceDecomposition`/`sourceContainer` for decomposition-derived pack lots. Both null for regular purchases.

The qty-remaining computation in this route also subtracts decomposition counts.

**`GET /api/dashboard/totals`** — unchanged in Plan 3.5. The `total_rounding_residual_cents` rollup is too small to surface; defer to Plan 4 P&L if anyone wants it later.

## 6. UI Surface

### 6.1 New components

**`<OpenBoxDialog>`** at `components/decompositions/OpenBoxDialog.tsx`. Props:

```ts
{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: {
    purchaseId: number;
    catalogItemId: number;
    name: string;          // e.g. "Ascended Heroes Elite Trainer Box"
    productType: string;   // e.g. "Elite Trainer Box"
    imageUrl: string | null;
    packCount: number;     // catalog metadata; > 1
    sourceCostCents: number; // user's purchase cost
    setCode: string | null;
    setName: string | null;
  };
}
```

Layout:

```
┌─────────────────────────────────────────────┐
│  Open box                                   │
│  ───────────────────────────────────────    │
│  [img] Ascended Heroes Elite Trainer Box    │
│        Elite Trainer Box · 9 packs          │
│        Cost basis: $50.00                   │
│                                             │
│  This will create a new lot:                │
│  9 × Ascended Heroes Booster Pack           │
│  at $5.56 each (rounding residual: -$0.04) │
│                                             │
│  Notes (optional): [______________________]  │
│                                             │
│  [ Cancel ]                  [ Open box ]   │
└─────────────────────────────────────────────┘
```

Submit calls `useCreateDecomposition` mutation. On success, dialog closes and the holdings page refetches via TanStack Query invalidation. On 422 missing-pack-catalog-row, the dialog shows an inline error with a "Search for the booster pack" link to `/catalog?q=<setName>%20Booster%20Pack`.

**`<DecompositionRow>`** at `components/decompositions/DecompositionRow.tsx`. Props:

```ts
{
  decomposition: {
    id: number;
    decomposeDate: string;
    packCount: number;
    perPackCostCents: number;
    roundingResidualCents: number;
    sourcePurchaseId: number;
  };
  packCatalogItem: { id: number; name: string };
  affectedCatalogItemIds: number[];
}
```

Renders a row in the sealed lot's "Decomposition history" section (parallel to `<RipRow>`). Shows: open-box icon, decompose date, "9 × Booster Pack at $5.56 each", "..." menu with "View details" (opens `<OpenBoxDetailDialog>`) and "Undo".

**`<OpenBoxDetailDialog>`** at `components/decompositions/OpenBoxDetailDialog.tsx`. Read-only view + Undo button. Mirror of Plan 3's `<RipDetailDialog>`. Props: `{ open, onOpenChange, decompositionId }`.

### 6.2 Existing component updates

**`<LotRow>`** at `components/purchases/LotRow.tsx`. The "..." menu adds a new entry "Open box" rendered when:
- `catalogItem.kind === 'sealed'` AND
- `catalogItem.packCount != null && catalogItem.packCount > 1` AND
- the caller passes a new optional `onOpenBox` handler (analogous to existing `onRip`)

The existing "Rip pack" entry stays as-is. Both can appear together for multi-pack containers, giving the user the choice.

When a child pack lot has `sourceDecompositionId` set, `<LotRow>` shows a new provenance subtitle:
```
From: Ascended Heroes Elite Trainer Box · opened 2026-04-27
```

Same visual style as the existing "From: pack · ripped DATE" subtitle for rip-child cards. Click navigates to the source container's holdings detail page.

**`<HoldingDetailClient>`** at `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`. Three changes:

1. New `[openBoxState, setOpenBoxState]` state and `<OpenBoxDialog>` instance, parallel to the existing rip dialog.
2. New `openOpenBox(lot)` handler passed as `onOpenBox` prop to `<LotRow>` for sealed multi-pack lots.
3. New "Decomposition history" `<section>` rendered when `detail.item.kind === 'sealed' && detail.decompositions.length > 0`, listing `<DecompositionRow>` instances. Sits between "Rip history" and the bottom of the page.

The qty stepper "+" handler stays unchanged — it adds a new sealed lot, not a decomposition.

### 6.3 Hooks

`lib/query/hooks/useDecompositions.ts` (new):

```ts
export function useDecomposition(id: number | null);
export function useCreateDecomposition();
export function useDeleteDecomposition();
```

Each mutation invalidates: `['holdings']`, `['holding', sourceCatalogItemId]`, `['holding', packCatalogItemId]`, `['decompositions']`, `['purchases']`. Caller passes `_sourceCatalogItemId` and `_packCatalogItemId` as private mutation-context fields (same pattern as `useCreateRip`).

`useCreateDecomposition` mutation function shape:

```ts
mutationFn: async (payload: {
  sourcePurchaseId: number;
  decomposeDate?: string;
  notes?: string | null;
  _sourceCatalogItemId: number;
  _packCatalogItemId: number;
}) => Promise<{ decomposition: ...; packPurchase: ... }>
```

The API doesn't need `_sourceCatalogItemId` or `_packCatalogItemId`; they're stripped before the POST and only used in `onSuccess` for precise invalidation.

## 7. Validation

`lib/validation/decomposition.ts`:

```ts
import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const today = new Date().toISOString().slice(0, 10);
    return s <= today;
  }, 'Date cannot be in the future');

export const decompositionInputSchema = z.object({
  sourcePurchaseId: z.number().int().positive(),
  decomposeDate: isoDate.optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type DecompositionInput = z.infer<typeof decompositionInputSchema>;
```

The `HARD_FIELDS_FOR_RIP_CHILDREN` constant in `lib/validation/purchase.ts` gets renamed to `HARD_FIELDS_FOR_DERIVED_CHILDREN` (the same fields are locked for both rip-children and decomposition-children). PATCH route checks both `source_rip_id` and `source_decomposition_id` to decide whether to enforce.

## 8. Error Handling

| Code | Cause | UX |
|---|---|---|
| 401 | not authenticated | client redirects to `/login` |
| 404 | source purchase / decomposition not found | toast |
| 409 | DELETE decomposition with linked rips on its packs | toast "this decomposition has N rips recorded against its packs. Undo the rip(s) first." Includes link to source pack lot. |
| 409 | DELETE decomposition with linked sales | Plan 5 concern; defensive check |
| 409 | DELETE source purchase that's been decomposed | toast "this purchase has been decomposed. Undo the decomposition first." Includes link to decomposition. |
| 422 | source not sealed / not decomposable / fully consumed | toast with specific message |
| 422 | booster pack catalog row not found for set | dialog inline error + link to `/catalog?q=<setName>%20Booster%20Pack` |
| 422 | Zod validation | field-level errors |
| 5xx | transient | toast with retry |

The DELETE-purchase 409 with `decompositionIds` is parsed by `useDeletePurchase` and surfaced through `DeletePurchaseError.decompositionIds` (extending the structured-error pattern from Plan 3 fix `ff488e9`).

## 9. Testing

### 9.1 Unit (`vitest`, node env)

- `lib/validation/decomposition.ts` — schema accepts/rejects: future date, invalid ISO, oversized notes.
- `lib/services/decompositions.ts` — `computePerPackCost`:
  - $50, 9 packs → 556 per pack, residual -4 ($5.56 × 9 = $50.04)
  - $0, 9 packs → 0 per pack, residual 0
  - $5, 1 pack → 500 per pack, residual 0
  - $5.55, 5 packs → 111 per pack, residual 0
  - $1, 3 packs → 33 per pack, residual 1 (33 × 3 = 99, residual 1)
  - throws on packCount = 0
- `lib/services/holdings.ts` — `aggregateHoldings` with decompositions: subtracts decomposition counts from sealed qty; orphan decompositions ignored gracefully; multiple events on same source lot are summed.

### 9.2 API integration (`vitest`, node env, mocked Supabase client)

- `POST /api/decompositions`:
  - Happy path: valid sealed source with packCount > 1, returns 201, decomposition row + child pack purchase row inserted with correct cost split.
  - 422 source not sealed (kind='card').
  - 422 source not decomposable (packCount = NULL).
  - 422 source not decomposable (packCount = 1, e.g. Booster Pack).
  - 422 source already fully consumed (qty - rips - decompositions < 1).
  - 422 booster pack catalog row not found (no matching set).
  - 404 source belongs to another user (RLS-hidden).
  - 401 unauth.
  - Transactional rollback: simulate insert error mid-transaction, verify no rows committed.
- `GET /api/decompositions/[id]`: returns full detail; 404 for other-user.
- `DELETE /api/decompositions/[id]`:
  - Soft-deletes child pack purchase, hard-deletes decomposition row.
  - Verify subsequent `GET /api/holdings` shows the source box's qty restored.
  - 409 when seeded rip references the child pack purchase.
- `DELETE /api/purchases/[id]`: 409 with `decompositionIds` when seeded decomposition references the purchase.
- `PATCH /api/purchases/[id]`: 422 when patching costCents on a decomposition-child purchase; 200 when patching only soft fields (notes).

### 9.3 Component (`vitest`, happy-dom)

- `<OpenBoxDialog>`:
  - Renders source name + product type + pack count.
  - Preview shows correct N × per-pack-cost format with rounding residual.
  - Submit posts the right body and closes dialog.
  - 422 missing-pack-catalog-row shows inline error with link to `/catalog?q=...`.
- `<DecompositionRow>`: shows correct date, pack count, per-pack cost; "..." menu has View / Undo.
- `<LotRow>` for a pack with `sourceDecompositionId IS NOT NULL` shows the "From: ETB · opened DATE" subtitle.

## 10. Migration & Rollout

Direct-to-main per project posture. Each task in the implementation plan ships as its own commit. Vercel auto-deploys on push.

Migrations in order:
- Drizzle **0006** — `add_catalog_items_pack_count` (Drizzle generate + apply via `npm run db:migrate`; the seed UPDATE statements run in the same migration file).
- Drizzle **0007** — `add_box_decompositions` (Drizzle generate + apply).
- Supabase `supabase/migrations/20260427000000_box_decompositions_rls.sql` (applied directly via the postgres client because `scripts/migrate-rls.ts` lacks idempotency tracking — same pattern Plan 3 Task 4 used).

Backward compatibility: existing sealed lots in `purchases` (e.g., the user's existing ETBs and Tins) get `pack_count` populated on the catalog side and become decomposable on next page load. No backfill of `purchases` rows. No changes to Plan 3's rip flow.

## 11. Open Questions

1. **Multiple Booster Pack variants per set.** Some sets have multiple "Booster Pack" SKUs in TCGCSV (e.g., Japanese vs English, premium vs basic). Plan 3.5 picks the first match by `set_code` and ignores variants. If real-world Pokémon TCG sets ever have multiple English packs per set, we'd need a disambiguation prompt — defer until that surfaces.

2. **Pack count for unrecognized product_types.** TCGCSV occasionally classifies oddball SKUs (e.g., "Special Set", "Promo Box") that aren't in our hardcoded map. They'll have `pack_count = NULL` and won't be decomposable. Users with such items can either log packs manually or treat the whole thing as a single rippable lot via the existing rip flow. Add new product_types to the map as they surface.

3. **Restore from soft-deleted decomposition children.** Following the Plan 3 pattern, there's no "restore" UI for soft-deleted purchases — this is also a Plan 6 polish item. DB-level recovery via Supabase Studio works.

## 12. References

- Parent design spec: `docs/superpowers/specs/2026-04-25-pokestonks-design.md`
- Plan 3 spec (purchases + ripping): `docs/superpowers/specs/2026-04-26-pokestonks-purchases-design.md`
- Plan 3 plan: `docs/superpowers/plans/2026-04-26-pokestonks-purchases.md`
- Reference patterns to mirror:
  - `app/api/rips/route.ts` — Drizzle transaction with manual auth
  - `app/api/rips/[id]/route.ts` — GET + DELETE undo flow
  - `components/rips/RipPackDialog.tsx` — dialog structure (though OpenBoxDialog is much simpler)
  - `components/rips/RipDetailDialog.tsx` — read-only detail with Undo
  - `components/rips/RipRow.tsx` — sealed lot detail history row
  - `lib/validation/rip.ts` — schema layout
  - `lib/services/rips.ts` — pure-function helper organization
  - `lib/query/hooks/useRips.ts` — TanStack hook pattern with private invalidation context
- New artifacts:
  - `lib/db/schema/boxDecompositions.ts`
  - `lib/validation/decomposition.ts`
  - `lib/services/decompositions.ts`
  - `app/api/decompositions/route.ts`, `app/api/decompositions/[id]/route.ts`
  - `components/decompositions/OpenBoxDialog.tsx`, `OpenBoxDetailDialog.tsx`, `DecompositionRow.tsx`
  - `lib/query/hooks/useDecompositions.ts`
- Plan 3 commits referenced for patterns: rip transactional create `eea3a23`, rip undo `4f3b29f`, rip-child lock `1832851`, structured DELETE error `ff488e9`, type cycle workaround `f121161`.
