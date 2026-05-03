# Pokestonks — Plan 9: Decomposition polish (design)

**Date:** 2026-05-02
**Status:** Spec, awaiting plan
**Builds on:** Plan 5.1 (recipe-driven decomposition), Plan 8 (collection-tracking mode / `unknown_cost` flag)

## Problem

Three gaps in the recipe-driven decomposition system shipped in Plan 5.1:

1. **No promo cards in recipes.** Tins, Mega ex Boxes, ETBs, Premium Collections, etc. typically include 1–3 promo cards alongside packs. Today the recipe system only accepts Booster Pack contents — promo cards are silently dropped, so opening one of these products understates contents and the user has no way to track the promo separately.
2. **No two-stage decomposition.** A Booster Box Case is conceptually 6 Booster Boxes, each of which is 36 packs (~216 packs total). Today the only way to model this is to type a 216-row recipe by hand, which collapses Box-level granularity (per-box rip P&L, per-box sale, per-box Open Box flow) into a flat pack list.
3. **No way to clear a wrong recipe.** The first successful decomposition persists the recipe permanently in `catalog_pack_compositions`. Any future open of the same product pre-populates from that saved recipe. If the saved recipe is wrong (wrong pack chosen, wrong count, missing promo), there's no Reset button — the user can edit rows in the dialog, but the dialog gives no visible cue that those edits will silently overwrite the persisted recipe.

## Goals

- Recipes can contain card rows alongside sealed-product rows.
- Recipes can target any catalog row (Booster Box, Booster Pack, Tin sub-product, card, etc.) — not just Booster Pack rows. This unlocks Case → Box → Pack as a two-stage flow.
- The user can wipe a saved recipe back to "no saved recipe" from the OpenBoxDialog, without needing another box to open.
- The dialog visibly distinguishes saved / suggested / new recipe states so the user knows what they're editing.

## Non-goals

- Recursive single-click "Open case → 216 packs" macro. Cases open into Box lots; each Box opens separately. Two physical events match physical reality.
- Auto-derive for Booster Box Case. Case sizes vary historically (4/6/12); no reliable per-product field. Manual recipe on first open; persists thereafter.
- Standalone Recipe Manager surface on `/catalog/[id]`. Single-user app; in-dialog reset is sufficient. Defer until friction reappears.
- Per-row cost weighting by market price (Q1 option B). Cost split stays even across non-card rows; cards are freebies at $0 cost basis.
- Renaming the `box_decompositions.pack_count` column or the `catalog_pack_compositions` table. Both keep their historical names; semantics narrow via migration comments.

## Locked decisions

| # | Decision |
|---|----------|
| Q1 | Promos are $0-cost-basis lots. Cost splits evenly across non-card recipe rows only. Cards are freebies. |
| Q2 | Generalize recipe target to any catalog row. Two-stage falls out (Case → Box lots → Pack lots, two separate Open Box events). |
| Q3 | Reset button + visibility cue in OpenBoxDialog. Auto-save on first open stays. New `DELETE /api/catalog/[id]/composition` endpoint. |

## Data model

### Migration `20260502000002_recipe_polish.sql`

```sql
-- ============================================================
-- Plan 9 polish: recipe contents can be any catalog row, not
-- just Booster Pack rows. Rename column to reflect.
--
-- "pack" stays in the table name for historical continuity;
-- callers should read the column name as the source of truth.
-- ============================================================

ALTER TABLE catalog_pack_compositions
  RENAME COLUMN pack_catalog_item_id TO contents_catalog_item_id;

-- Recreate the unique index with the new column name.
DROP INDEX IF EXISTS catalog_pack_compositions_source_pack_idx;
CREATE UNIQUE INDEX catalog_pack_compositions_source_contents_idx
  ON catalog_pack_compositions(source_catalog_item_id, contents_catalog_item_id);

COMMENT ON COLUMN catalog_pack_compositions.contents_catalog_item_id IS
  'FK to catalog_items.id. Any kind allowed (sealed sub-products like Booster Boxes, Booster Packs, or cards for promos).';

COMMENT ON COLUMN box_decompositions.pack_count IS
  'Cost-split divisor at decomp time. Equals sum(quantity) of non-card recipe rows. Historical name retained.';
```

**Apply at ship time, not before.** The column rename is breaking. Production at `bff5f30` writes `pack_catalog_item_id`; running the migration earlier would 500 every decomposition op until the new code deploys. Order at ship: code-merge to main → wait for Vercel deploy to complete → apply migration via Supabase SQL Editor → smoke. Brief window (~seconds) where deployed code expects the new column and the DB still has the old; tolerable because no decomposition ops happen during the deploy. If anything goes wrong, the inverse rollback is a one-line ALTER TABLE.

### Drizzle schema

`lib/db/schema/catalogPackCompositions.ts` — rename field `packCatalogItemId` → `contentsCatalogItemId`. Update all `lib/db/schema/index.ts` re-exports. Drizzle introspection mirror (`drizzle/schema.ts`) is gitignored per Plan 5; nothing to update there.

### Validation

`lib/validation/decomposition.ts`:

```ts
export const recipeRowSchema = z.object({
  contentsCatalogItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});
```

Type alias `RecipeRow` keeps its name.

## Math

A recipe row is a **cost-split row** if its referenced catalog item is `kind='sealed'`. Card-kind rows are **freebies** at $0 cost.

```ts
costSplitTotal = sum(row.quantity for row where contentsCatalog.kind === 'sealed')
perUnitCostCents = round(sourceCostCents / costSplitTotal)
roundingResidualCents = sourceCostCents - perUnitCostCents * costSplitTotal
```

For each child purchase row created during decomposition:

| Row kind | `cost_cents` | `unknown_cost` |
|----------|--------------|----------------|
| sealed (pack, box, etc.) | `perUnitCostCents` per unit | inherited from source purchase |
| card (promo) | `0` per unit | inherited from source purchase |

`box_decompositions.pack_count` snapshot stores `costSplitTotal` (the divisor). `box_decompositions.per_pack_cost_cents` and `box_decompositions.rounding_residual_cents` snapshot accordingly. Display copy in `OpenBoxDialog` and `OpenBoxDetailDialog` switches from "{N} packs in recipe" to "{N} items in recipe" — universal across pack/box/mixed recipes. The recipe-row preview list already names each row individually; the count caption doesn't need to disambiguate.

### Edge cases

- **All-card recipe.** `costSplitTotal === 0`. Reject 422 `recipe_must_contain_sealed_row`. A card-only "decomposition" is incoherent for a sealed source — packs are the cost-bearing contents.
- **Self-reference.** `contentsCatalogItemId === sourceCatalogItemId`. Reject 422 `circular_recipe`.
- **Booster Pack as source.** Already blocked by existing `productType === 'Booster Pack'` source check (rip flow, not decomposition).

### Worked examples

**Two-stage Case → Box.** $720 Booster Box Case, recipe `[{ contentsCatalogItemId: <Booster Box>, qty: 6 }]`:
- costSplitTotal = 6, perUnitCostCents = 12000, residual = 0.
- Creates 1 child purchase: `quantity=6, cost_cents=12000` (per unit) pointing at the Booster Box catalog row.
- User then opens one of those 6 boxes — its sourcePurchase has `cost_cents=12000`, qty=6 in pool. Box recipe is `[{ Booster Pack, qty: 36 }]`. Splits $120/36 = $3.33 per pack, residual 12¢.

**Mixed pack + promo.** $60 Mega ex Box, recipe `[{ Booster Pack, qty: 3 }, { Mega Pikachu Promo, qty: 1 }]`:
- costSplitTotal = 3, perUnitCostCents = 2000, residual = 0.
- Pack child: `quantity=3, cost_cents=2000, unknown_cost=parent`.
- Promo child: `quantity=1, cost_cents=0, unknown_cost=parent`.

**All-card.** Recipe `[{ Card A, qty: 1 }, { Card B, qty: 1 }]` from a $20 sealed source. Reject 422.

### Pure-function impact

`lib/services/decompositions.ts`:
- `computePerPackCost(sourceCostCents, packCount)` — keep. Call sites pass `costSplitTotal` instead of recipe row count.
- New `computeCostSplitTotal(recipe, contentsCatalogByItemId): number` — pure. Filters non-card rows. Used by API + dialog preview.

`lib/services/pnl.ts`:
- No changes. `aggregateHoldings` rolls card-child purchases into per-catalog-item holdings naturally. `computeHoldingPnL` of a $0-cost card lot produces `pnlCents = currentValue - 0 = currentValue` — that's the freebie semantics ("all market value is gain").

## API surface

### `POST /api/decompositions` — extends

- Validation field renames (`packCatalogItemId` → `contentsCatalogItemId`). No compatibility shim.
- Recipe resolution flow unchanged: body → saved → auto-derive → 422 `recipe_required`. Auto-derive stays gated to `DETERMINISTIC_DECOMPOSITION_TYPES` and Booster Pack lookup. **Booster Box Case is NOT added to the deterministic set.**
- Per-row validation: contents catalog item must exist and be `kind='sealed'` OR `kind='card'`. Reject 422 `invalid_contents_catalog` otherwise (includes the offending `contentsCatalogItemId` in payload).
- New rejection: `circular_recipe` (422) when any row references the source catalog item.
- New rejection: `recipe_must_contain_sealed_row` (422) when `costSplitTotal === 0`.
- Cost split applies per Section "Math". Card child purchases get `cost_cents = 0`.
- Child-purchase creation: each recipe row creates one `purchases` row with the row's `quantity`, computed `cost_cents`, `unknown_cost = source.unknownCost`, `source_decomposition_id = decomposition.id`. `HARD_FIELDS_FOR_DERIVED_CHILDREN` already locks cost/qty/date/unknownCost — no change needed; the same lock applies to card children.

### `GET /api/catalog/[id]/composition` — extends

Recipe-row response shape gains `kind` and `productType`:

```ts
recipe: Array<{
  contentsCatalogItemId: number;
  quantity: number;
  contentsName: string;
  contentsSetName: string | null;
  contentsImageUrl: string | null;
  contentsKind: 'sealed' | 'card';
  contentsProductType: string | null;  // null for cards
}> | null
```

(Field name shift `pack*` → `contents*` matches the schema rename.)

Auto-derive logic unchanged (Booster Pack picker for deterministic types).

### `DELETE /api/catalog/[id]/composition` — new

```http
DELETE /api/catalog/123/composition
```

- Auth required; 401 otherwise. 404 if catalog item doesn't exist.
- Deletes all `catalog_pack_compositions` rows for `source_catalog_item_id = 123`.
- Returns `{ deleted: <count> }`.
- Idempotent. Empty → returns `{ deleted: 0 }`.
- Does NOT touch existing `box_decompositions` rows or their child purchases. Those keep their per-decomp snapshot.
- No 409 logic. The user is single-user; clearing only affects future opens.

### Read-side impact

- `GET /api/holdings`, `GET /api/holdings/[catalogItemId]` — no shape change. Card-child lots roll into per-catalog-item holdings naturally; their `kind='card'` flows through existing DTO.
- `OpenBoxDetailDialog` (read view) — surfaces `contentsKind`/`contentsProductType` for each recipe row, labels them "promo" / "pack" / "box" accordingly.
- LotsTable / HoldingDetailClient gates:
  - **Open Box** menu: gated on `kind === 'sealed' && productType !== 'Booster Pack'`. Naturally excludes card-child lots.
  - **Rip Pack** menu: gated on `productType === 'Booster Pack'`. Naturally excludes card-child lots.
  No new gating code. Both fall out of existing rules.

No changes to `/api/dashboard/totals`, `/api/sales`, `/api/exports/*`. Existing P&L plumbing handles $0-cost lots correctly.

## UI

### `OpenBoxDialog` (`components/decompositions/OpenBoxDialog.tsx`)

**Picker filter relaxation.** Drop the `r.productType === 'Booster Pack'` filter on `packResults`. Show all `/api/search?q=...&kind=sealed` results plus `kind=card` results. Each row in the dropdown gets a small kind label ("Pack", "Box", "Tin", "Card"). No grouping; flat list ordered by relevance from the search endpoint.

The search query needs to fetch both kinds. Two implementation paths:
- (a) call `/api/search` twice (`kind=sealed`, `kind=card`) and merge; or
- (b) extend `/api/search` to accept `kind=any` (or pass no `kind` param). Existing `/api/search` already supports kind filtering; verify whether omitting `kind` returns both. If it doesn't, add `kind=any` support during this plan.

Recommend (b). One round trip per keystroke is the cleanest pattern and aligns with the existing param.

**Recipe-state banner.** Above the recipe rows, surface one of three labels based on the composition response:

| State | Banner text |
|-------|-------------|
| `persisted: true` | "Saved recipe — your edits update future opens" |
| `suggested: true` | "Suggested recipe — first edit will save" |
| `recipe: null` (new) | "Build the recipe — first save sticks for future opens" |

Banner is muted-foreground, text-xs, single line, sits between the source info card and the recipe rows.

**Reset button.** When `persisted: true`, show a "Clear saved recipe" button in the recipe-section header (right-aligned, ghost variant, text-xs). Clicking opens an inline confirm (no separate dialog — small confirm bar replaces the rows for one keystroke):

```
"Clear the saved recipe? Existing decompositions and lots are unaffected."
[Cancel]  [Clear]
```

On confirm: call `DELETE /api/catalog/[id]/composition`, invalidate `['catalogComposition', catalogItemId]`, dialog re-fetches and shows either auto-derive (if applicable) or the empty state. The `useCatalogComposition` hook handles the refetch.

**Cost-split preview.** Update the existing preview block:

```
This will create new lots:
  3 × Scarlet & Violet 151 Booster Pack — at $20.00 each
  1 × Mega Pikachu Promo Card — promo (no cost)

Source: 4 items in recipe (3 cost-split), rounding residual: $0.00
```

For card rows: render "promo (no cost)" instead of a price. The "Source: N packs in recipe" caption uses `costSplitTotal` and the predominant productType ("packs", "boxes", "items").

### `OpenBoxDetailDialog` (read-only)

Update the row labels to surface kind (existing dialog renders a list of child purchases; needs kind/productType in the DTO that backs it). Card rows show "(promo)" inline next to the name. Pack rows unchanged.

### `LotsTable` / `HoldingDetailClient` / `LotRow`

No changes. Existing menu gates already produce the correct affordances for card-child lots:
- card-child lot at `/holdings/[cardCatalogId]` shows neither Open Box nor Rip Pack — only Sell + Edit + Delete. Correct.

### Hooks

`lib/query/hooks/useDecompositions.ts`:
- `useCatalogComposition` query result type updates (`pack*` → `contents*` field names).
- New `useClearCatalogComposition(catalogItemId)` mutation. Calls DELETE; invalidates `['catalogComposition', catalogItemId]`.
- `useCreateDecomposition` body field rename (`packCatalogItemId` → `contentsCatalogItemId`). Drop the existing `_packCatalogItemId: 0` legacy compat field from `OpenBoxDialog`'s mutation call site — the broad invalidation it documented was already covered by the `['holdings']` cache key.

## Tests

### Service-level (pure)

- `computeCostSplitTotal`:
  - all sealed rows → sum of quantities
  - mixed sealed + card → sum of sealed-row quantities only
  - all card → 0
- `computePerPackCost` (existing): regression on rename-only refactor.

### API

- `POST /api/decompositions`:
  - card row in recipe → child purchase has cost_cents=0
  - all-card recipe → 422 `recipe_must_contain_sealed_row`
  - circular recipe → 422 `circular_recipe`
  - non-existent contents catalog item → 422 `invalid_contents_catalog`
  - inherited unknownCost from source flows to both pack and card children
  - two-stage: two sequential POST calls — first opens a Case into 6 Box children; second opens one of those Boxes into 36 Pack children. Verify per-stage cost math.
- `GET /api/catalog/[id]/composition`:
  - response includes `contentsKind` and `contentsProductType` per row
  - card row in saved recipe round-trips correctly
- `DELETE /api/catalog/[id]/composition`:
  - 401 unauth
  - 404 missing catalog item
  - persisted recipe: deletes rows, returns count
  - empty: returns `{ deleted: 0 }`
  - existing `box_decompositions` rows untouched after DELETE

### Component

- `OpenBoxDialog`:
  - picker shows card results (mock `/api/search` with mixed kinds)
  - Clear button visible only when `persisted: true`
  - Click Clear → confirms → calls DELETE → recipe state resets
  - Recipe-state banner reads the right label per state
  - Cost-split preview labels card rows as "promo (no cost)"
  - All-card recipe disables submit + shows inline error
- `OpenBoxDetailDialog`:
  - card rows render "(promo)" label

## Acceptance

- 433 + N tests passing (current baseline 433 from Plan 8).
- `tsc --noEmit` clean.
- `npm run build` clean.
- Migration `20260502000002_recipe_polish.sql` applied via Supabase SQL Editor at ship time, immediately before the deploy lands.
- Manual smoke pass:
  - Open a Case → confirm 6 Box children appear in `/holdings/[boxCatalogId]`.
  - Open one of those Boxes → confirm 36 Pack children, cost-split correct.
  - Open a Mega ex Box → recipe builder accepts a card row → confirm card child has $0 basis and shows on `/holdings/[cardCatalogId]`.
  - Sell the promo → confirm full revenue lands in realized P&L.
  - Save a wrong recipe (e.g., wrong pack), open the dialog again → click "Clear saved recipe" → confirm dialog resets to suggestion or empty.

## Out of scope

- Recursive Case → Pack one-click flow.
- Booster Box Case auto-derive (manual recipe required on first open).
- Per-row market-weighted cost split.
- Standalone `/catalog/[id]` Recipe Manager surface.
- Renaming `catalog_pack_compositions` table or `box_decompositions.pack_count` column.
- Two-stage decomposition that walks the recipe tree atomically.

## Migrations to apply manually via Supabase SQL Editor

1. `20260502000002_recipe_polish.sql` (Plan 9) — at ship time. Renames `pack_catalog_item_id` → `contents_catalog_item_id`, recreates unique index, adds column comments. Rename is breaking; apply alongside code deploy.
