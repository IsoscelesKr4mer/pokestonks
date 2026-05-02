# Plan 11 — Alt-Print Variants Design Spec

**Date:** 2026-05-02
**Status:** Brainstorming notes for a future session. Not yet approved. No code yet.

**Roadmap slot:** Plan 11. Plans 1–7 shipped. Plan 8 (Collection mode) is in flight in
another session as of 2026-05-02. Plans 9 (Decomp polish) and 10 (Sharable vault links)
are pre-scoped backlogs ahead of this. This work slots after all three because it's
larger than the decomp polish items, orthogonal to share-link rendering, and will
intersect with Plan 8's catalog display work — letting Plan 8 ship first avoids merge
conflicts on the same surfaces. Reorder if a fresh session decides correctness pressure
outweighs the queue order.

## TL;DR for a fresh session

Modern Pokémon sets ship multiple TCGplayer SKUs at the same card number — base print plus
"(Friend Ball)", "(Energy Symbol Pattern)", "(Master Ball)", etc. Each SKU has its own
market price. Our search currently only surfaces the base print because the search
pipeline is keyed on Pokemon TCG API cards, which don't model alt-prints. Collectr shows
all of them. We want parity.

The proposed approach: drive card upserts off **TCGCSV products**, not Pokemon TCG API
cards. Each TCGplayer SKU becomes its own `catalog_items` row, joined to a Pokemon TCG
API card for image/rarity/regulation metadata when one matches.

This is a moderate-sized change touching the schema, the card upsert path, the search
service, and the result UI. Scope it as its own plan.

## 1. Background — what's broken today

A user searching "ascended heroes pikachu" sees four cards:

- Pikachu ex SIR #276 — $1,078.82 ✓
- Pikachu ex SIR #277 — $496.41 ✓
- Pikachu ex (Double Rare) #057 — stale, no price
- Pikachu (Common) #055 — stale, no price

Two distinct bugs:

1. **CardNumber padding mismatch (fixed today, commit `e51da4e`).** Pokemon TCG API stores
   numbers unpadded (`"57"`); TCGCSV pads to set width (`"057/217"`). The naive
   `startsWith()` lookup missed everything <100. Fixed with a `stripLeadingZeros()`
   normalizer in `lib/services/search.ts`. **This is already shipped.** Do not redo it.
2. **Alt-print variants invisible (this spec).** Even after the padding fix, the user only
   sees the *base* `Pikachu` print at #055. The Friend Ball ($1.09 Reverse Holofoil) and
   Energy Symbol Pattern ($0.64 Reverse Holofoil) prints — both real TCGplayer products
   at the same card number — never appear in search results.

### 1.1 Concrete data shape

For Ascended Heroes (`me2pt5` in Pokemon TCG API, `groupId 24541` "ME: Ascended Heroes"
in TCGCSV), the four `Pikachu*` cards in the Pokemon TCG API map to **seven** TCGCSV
products:

| TCGplayer ID | TCGCSV name | Card number | Price (subType) |
|---|---|---|---|
| 675867 | Pikachu | 055/217 | Normal $0.24 |
| 676897 | Pikachu (Friend Ball) | 055/217 | Reverse Holofoil $1.09 |
| 677037 | Pikachu (Energy Symbol Pattern) | 055/217 | Reverse Holofoil $0.64 |
| 675869 | Pikachu ex - 057/217 | 057/217 | Holofoil $2.68 |
| 676088 | Pikachu ex - 276/217 | 276/217 | Holofoil $1,078.82 |
| 676089 | Pikachu ex - 277/217 | 277/217 | Holofoil $496.41 |

The Friend Ball and Energy Symbol Pattern variants have **no separate Pokemon TCG API
entry** — they're TCGplayer-only SKUs. Our current pipeline can't represent them because
`catalog_items` is keyed on `pokemon_tcg_card_id + variant`, and the variant field only
holds subType-derived values (`normal`, `holo`, `reverse_holo`).

### 1.2 Why fix this now

- Cost-basis honesty. A user who buys a Friend Ball Pikachu and logs it as "Pikachu" gets
  the wrong cost basis line — base Pikachu trades at $0.24 Normal, the Friend Ball trades
  at $1.09 Reverse Holofoil. Same display string, three different real-world prices.
- Search-result completeness. The user explicitly noted Collectr shows these and they
  expect parity.
- This blocks any future "scan a sealed product, decompose into pulls" flow where the
  pulled SKU genuinely is "Pikachu (Friend Ball)" with its own market value.

## 2. Goal

Surface every TCGplayer SKU as a distinct row in search results, with its own image,
name (including parenthetical alt-print label), price history, and (eventually) holdings
line. Each SKU is one `catalog_items` row.

Out of scope:
- Backfilling holdings purchased before this ships. Existing `purchases` rows stay
  pointed at whichever `catalog_item_id` they were logged against. Users can re-log if
  they care.
- Showing alt-prints in `/holdings` differently from base prints. They render the same
  way; only the name and price differ.

## 3. Design space — three approaches

### 3.A Drive upserts off TCGCSV products (recommended)

The card-import path becomes:

1. Hit Pokemon TCG API for the user's text query → get a list of `cards[]` keyed by
   `(setCode, cardNumber)`. Use this for **metadata enrichment** only: image, rarity,
   regulation mark, set release date.
2. For each unique `(setName, cardNumber)` in the result, walk **all** matching TCGCSV
   products in the corresponding TCGCSV group.
3. For each TCGCSV product, upsert one or more `catalog_items` rows — one per variant
   (subType) found in TCGCSV prices.
4. Build the search result list from those rows.

The TCGCSV product carries the alt-print info in its name (`"Pikachu (Friend Ball)"`).
We store that name verbatim. Pokemon TCG API images are shared across all SKUs at the
same `(setCode, cardNumber)` — Friend Ball Pikachu and base Pikachu have the same image
on TCGCSV anyway, so this is fine in practice.

**Pros:**
- Faithful to the data. One row per TCGplayer SKU per priced variant.
- Each row has a real `tcgplayer_product_id`, so daily price refresh (the existing
  `lib/services/tcgcsv-live.ts` job) keeps working without changes.
- Natural extension point for a future "all sealed-decomposed pulls live in catalog" flow.

**Cons:**
- Search no longer fundamentally "Pokemon TCG API first." Cards that exist in Pokemon
  TCG API but not TCGCSV (rare, but possible — e.g., very fresh sets, promos that hit
  pokemontcg.io before TCGplayer) won't appear in card results.
- Schema change: catalog uniqueness can no longer be `(pokemon_tcg_card_id, variant)`
  because `pokemon_tcg_card_id` is non-unique across alt-prints. Switch to
  `(tcgplayer_product_id, variant)` for cards.
- One-time backfill: existing card rows have to migrate. Easiest path is a SQL
  migration that NULLs `image_storage_path` (already familiar pattern from
  `20260502000000_recache_lowres_tcgplayer_images.sql`) and lets next-search re-upsert
  through the new path.

### 3.B Add an `alt_print_label` column, keep Pokemon TCG API as source

Keep the Pokemon TCG API → bulk upsert flow. Add a nullable `alt_print_label TEXT`
column on `catalog_items`. For each Pokemon TCG API card, find **all** TCGCSV products
at the same cardNumber. Emit one row per (TCGCSV product × subType) tuple, deriving the
label from the parenthetical in the TCGCSV name.

Uniqueness becomes `(pokemon_tcg_card_id, variant, alt_print_label)`.

**Pros:**
- Keeps Pokemon TCG API as the canonical card source. Cards present there but not on
  TCGplayer (rare) still surface.

**Cons:**
- Two unique constraints competing: `pokemon_tcg_card_id` is no longer unique-per-card,
  but several other places assume it is. Audit risk.
- Synthesizing one canonical name out of `(pokemon_tcg_card_name, alt_print_label)` for
  display always ends up "Pikachu (Friend Ball)" anyway — the parenthetical handling is
  duplicate work compared to just storing the TCGCSV name.
- We still don't have a place to store alt-print-only cards that have no Pokemon TCG API
  entry, if any future set ships TCGplayer-only SKUs. Approach A handles those for free.

### 3.C Keep current model, ship "alt-print awareness" as filter-only

Leave the data model alone. In the search route, after the standard pipeline, walk
TCGCSV products at each result's cardNumber and inject *display-only* info ("3 alt
prints exist") into the response. Build a "View on TCGplayer" deep-link.

**Pros:** zero schema change. Defers the modeling decision.
**Cons:** doesn't actually solve the problem. User can't add a Friend Ball Pikachu to
their portfolio with correct pricing. Solves the discovery half, not the tracking half.

### 3.D Recommendation

**Approach A.** It's the only design where logging a purchase of a Friend Ball Pikachu
gets the right cost basis and tracks the right market price. The schema delta is
moderate (swap card uniqueness key, store TCGCSV name verbatim). The migration is
incremental — existing rows can be left alone or cleared and re-upserted on the next
search.

## 4. Open questions a fresh session should resolve

1. **Search-result UI grouping.** When a query returns base Pikachu + 2 alt-prints, do
   they render as 3 sibling cards in the grid? Or as one Pikachu card with a
   `+2 prints` chip that expands? Collectr renders siblings; that's likely the simplest
   and most consistent answer.
2. **Sort order for siblings.** Within "all me2pt5 Pikachu prints", do they sort by
   price-desc (default), name (alpha), or by alt-print label (base first, then variants
   alphabetically)? Probably honor the chosen sortBy globally — siblings interleave with
   non-sibling results.
3. **Display name format.** TCGCSV ships `"Pikachu (Friend Ball)"` directly. Do we store
   that verbatim and render it, or split into `name="Pikachu" altPrintLabel="Friend Ball"`
   and recombine for display? Splitting is more work but enables filtering ("show me only
   Friend Ball prints across the catalog"). Probably YAGNI — store verbatim, revisit if a
   filter need emerges.
4. **What about TCGCSV products that look like junk?** TCGCSV groups also contain Code
   Cards, parallel-set entries, error misprints, etc. Some of those have card numbers and
   would now flow into card search. Today the existing flow drops them implicitly because
   Pokemon TCG API doesn't list them. A negative filter is needed: skip products whose
   name contains `Code Card`, `Promo Card`, set codes that don't match the expected
   pattern, etc. Cross-reference `lib/services/tcgcsv.ts` `SINGLES_REJECT` regex —
   already exists for sealed classification, can be extended.
5. **Holdings migration.** A user with existing `Pikachu (Common)` purchases logged
   against `catalog_item_id = 123` doesn't auto-migrate to the new SKU-keyed row. Do we
   leave them pointing at the old row (which still exists, just now means "base Pikachu
   Normal print") and let the user re-log if needed? Or write a migration that re-keys
   purchases to the matching SKU? Probably leave alone — auto-migration risks misassigning
   alt-print purchases that were originally logged as base. Ship a one-line warning in
   the changelog that legacy holdings stay where they are.
6. **`pokemon_tcg_card_id` uniqueness.** The current partial unique index is
   `(pokemon_tcg_card_id, variant) WHERE pokemon_tcg_card_id IS NOT NULL`. After
   approach A, that index drops. Anything else assuming card-id uniqueness? Audit
   `lib/db/upserts/catalogItems.ts` for the conflict target on `bulkUpsertCards`.
7. **Search refresh path.** The `/api/search/refresh` route also calls `searchAll`. As
   long as the upsert layer is shared, refresh just works through the new path. No
   route-level change should be needed.

## 5. Sketch of the schema delta (Approach A)

**Migration `supabase/migrations/<timestamp>_alt_print_variants.sql`:**

```sql
-- 1. Drop old card uniqueness (pokemon_tcg_card_id, variant)
ALTER TABLE catalog_items
  DROP CONSTRAINT IF EXISTS catalog_items_pokemon_tcg_card_unique;
DROP INDEX IF EXISTS catalog_items_pokemon_tcg_card_id_variant_idx;

-- 2. Add new card uniqueness (tcgplayer_product_id, variant) for cards
-- Sealed already uses this implicitly via the existing tcgplayer_product_id column.
CREATE UNIQUE INDEX catalog_items_tcgplayer_product_variant_card_idx
  ON catalog_items (tcgplayer_product_id, variant)
  WHERE kind = 'card' AND tcgplayer_product_id IS NOT NULL;

-- 3. Force re-upsert of all card rows so the new path attaches a tcgplayer_product_id
-- to every row. This lets future searches and the daily refresh job see SKU-keyed cards.
UPDATE catalog_items
SET image_storage_path = NULL
WHERE kind = 'card';
-- (Existing purchases keep their catalog_item_id; the row just gets re-enriched.)
```

Drizzle schema (`lib/db/schema/catalogItems.ts`) needs the corresponding index update.

## 6. Sketch of the service delta (Approach A)

In `lib/services/search.ts`, replace `searchCardsWithImport`'s "for each Pokemon TCG API
card, find ONE TCGCSV product" loop with:

1. Group Pokemon TCG API cards by `(setName, cardNumber)`.
2. For each group, fetch all matching TCGCSV products from the group's products list.
3. For each TCGCSV product, fetch the price rows. Emit one `pending` per
   `(product, subTypeName)` tuple.
4. Bulk-upsert as today. Conflict target shifts from
   `(pokemon_tcg_card_id, variant)` to `(tcgplayer_product_id, variant)`.

The Pokemon TCG API metadata (image, rarity, regulationMark, setPrintedTotal) joins by
`(setCode, cardNumber)` — every TCGCSV product at that cardNumber gets the same
metadata, which is correct because the alt-prints share the printed art.

`tokenizeQuery` and the `cardNumberFull` / `cardNumberPartial` post-filters in
`searchCardsWithImport` still apply — they're metadata-driven, independent of how many
SKUs we end up emitting.

## 7. Sketch of the UI delta

`SearchResultCard` already takes a generic `SearchResultItem` with `name`,
`imageUrl`, `lastMarketCents`. As long as the API response carries
`name = "Pikachu (Friend Ball)"`, the card grid just works — three Pikachu cards render
side by side, each with their own price. No grouping logic needed for v1.

If we later want a `+2 prints` chip + expand interaction (per Open Question 1), that's a
follow-up.

## 8. Test plan

1. **Search service unit test** — feed in mocked TCGCSV products list with three Pikachu
   SKUs at #055/217 + price rows for each. Assert three result rows are emitted, each
   with the correct name and price.
2. **CardNumber padding regression** — keep the existing test (post-`e51da4e`) so the
   alt-print rewrite doesn't reintroduce the padding bug.
3. **Negative filter** — TCGCSV products named `*Code Card*` should not produce result
   rows. Pin a fixture for this.
4. **Schema migration locally** — run on a dev database snapshot, confirm purchases keep
   pointing at the right rows, confirm new index can't be violated.

## 9. What this spec is NOT

- Not a plan. Plans live in `docs/superpowers/plans/`. Once a fresh session runs the
  brainstorming gates and approves an approach (with the Open Questions answered), it
  should call `superpowers:writing-plans` to produce the implementation plan.
- Not blocking on Plan 8 (Collection Mode). Plan 8 is in flight in another session.
  This work is independent — touches search/catalog, not collection assembly.
- Not blocking on the cardNumber padding fix in `e51da4e`. That already shipped.

## 10. Pointers for the next session

- Recent commits worth `git show`ing for context: `e51da4e` (cardNumber padding fix
  that surfaces this issue), `15efc29` (image persistence — same upsert path that the
  alt-print expansion will plug into), `e3e93a6` (TCGplayer high-res variant fetch —
  shows current TCGCSV URL handling).
- Existing relevant files:
  - `lib/services/search.ts` — `searchCardsWithImport`, `findTcgcsvCardPrices`
  - `lib/services/tcgcsv.ts` — `fetchProducts`, `fetchPrices`, `findGroupBySetName`
  - `lib/services/pokemontcg.ts` — `searchCards`
  - `lib/db/upserts/catalogItems.ts` — `bulkUpsertCards`
  - `lib/db/schema/catalogItems.ts` — current uniqueness rules
  - `app/api/search/route.ts` and `app/api/search/refresh/route.ts` — both flow through
    `searchAll`, so service-layer changes propagate automatically.
