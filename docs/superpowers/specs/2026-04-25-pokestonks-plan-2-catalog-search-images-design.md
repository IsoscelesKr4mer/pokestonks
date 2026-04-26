# Pokestonks Plan 2 Design — Catalog + Search + Images

**Date:** 2026-04-25
**Status:** Draft, pending user review
**Parent spec:** `docs/superpowers/specs/2026-04-25-pokestonks-design.md`
**Predecessor plan:** `docs/superpowers/plans/2026-04-25-pokestonks-foundation.md` (shipped 2026-04-25)
**Successor:** writing-plans skill consumes this design and produces the executable Plan 2.

## 1. Goal

By the end of Plan 2, Michael can type "151 ETB" or "charizard ex 199" into a search box on `/catalog` and see ranked results with images. Picking a result lands on `/catalog/[id]`, which renders the image, name, set, latest TCGCSV market price, and a "Log purchase" button that links to the Plan 1 stub at `/purchases/new`. The shared catalog (`catalog_items` + `market_prices`) is populated lazily as searches happen. Images are downloaded once and served from Supabase Storage on subsequent views.

This plan delivers Sections 5.2 (catalog search), 8.2 (TCGCSV client), 8.3 (Pokémon TCG API client), and 8.4 (image storage flow) of the parent spec, with on-demand pricing instead of the daily cron (Plan 6 owns the cron).

## 2. Decisions baked in (from brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Catalog growth strategy | Hybrid lazy-import | Live external lookups during search, all results upsert into `catalog_items` (text + upstream image URL only). Picking triggers image download + price fetch. Avoids a long-running bulk-import job that fights Vercel Hobby's 10s function timeout. |
| Kinds in scope | Sealed + cards | Michael wants to ship all stages this weekend; doing both at once avoids touching the search service twice. |
| Card variant presentation | Grouped by `(card_number, set_code)` with inline variant chips | Matches Collectr UX; one row per print, variant picker on the row. |
| Plan 2 deliverable shape | Pipeline + minimal `/catalog/[id]` preview page | Makes "the pipeline works" visible without dropping into the DB. ~30 lines of UI on top of the work already required. |
| Manual catalog entry | Deferred to Plan 6 | Not on critical path; data model already accommodates it. Drizzle Studio is the v1 fallback if a gap is hit before Plan 6. |
| Daily price refresh cron | Deferred to Plan 6 | Plan 2 fetches prices on-demand on first view of `/catalog/[id]`. |

## 3. Architecture

### 3.1 New surfaces

```
lib/services/
  tcgcsv.ts        TCGCSV client. Pokémon categoryId=3.
                   Endpoints: groups, products, prices.
                   Used for: sealed metadata + sealed/card prices.
  pokemontcg.ts    Pokémon TCG API client.
                   Used for: card metadata + high-quality scans only.
  search.ts        Unified search service. Parses query,
                   fans out to both clients in parallel,
                   merges cards by (card_number, set_code),
                   lazy-imports rows into catalog_items.
  images.ts        Image fetch + WebP re-encode + Supabase Storage upload.
                   Triggered on first view of a catalog item.

lib/utils/images.ts        Frontend helper: getImageUrl(item) -> storage URL or upstream fallback.

app/(authenticated)/catalog/
  page.tsx                 Search-and-pick page.
  [id]/page.tsx            Per-catalog-item preview.

app/api/
  search/route.ts          GET ?q=&kind=&limit=
  catalog/[id]/route.ts    GET single item + latest price.

components/catalog/
  SearchBox.tsx            Debounced input, kind chip row.
  SearchResultRow.tsx      One row, sealed or card with inline variant chips.
```

### 3.2 Data flow on a single search

```
user types "charizard ex"
  -> /api/search?q=charizard+ex&kind=card
  -> search.ts:
       - parses tokens (text vs card_number_partial vs card_number_full vs set_code)
       - parallel: tcgcsv.searchCards(q), pokemontcg.searchCards(q)
       - merges by (card_number, set_code), one row per print, variants under it
       - upserts each merged variant into catalog_items
         (text + upstream image_url, image_storage_path = NULL)
       - returns top 20 grouped results
  -> UI renders grouped list with variant chips
  -> user picks a variant chip
  -> navigates to /catalog/[id]
  -> page server-renders, kicks images.downloadIfMissing(id) async,
     fetches latest market price (synchronous on-demand TCGCSV call if no recent snapshot).
```

### 3.3 What Plan 2 does NOT do

- Daily price refresh cron (Plan 6).
- Manual catalog entry path (Plan 6).
- "Log purchase" wizard (Plan 3 — the button is just a link to the existing stub).
- Recently-searched / recently-picked memory.
- Keyboard navigation in search results.
- Pagination / infinite scroll.
- Save-as-favorite / star catalog items.
- Condition pickers anywhere (cards default to NM in Plan 2; condition UX lands in Plan 3 on the purchase form).

## 4. Search query parsing

Tokenize on whitespace. Each token is classified:

| Token shape | Class | Examples |
|---|---|---|
| `\d+/\d+` | `card_number_full` | `199/091`, `074/088` |
| `\d{1,3}` | `card_number_partial` | `199`, `74` |
| `[a-z]{2,4}\d+` | `set_code` | `sv3pt5`, `swsh11` |
| anything else | `text` | `charizard`, `ex`, `etb` |

Query becomes AND across token classes, OR within a class:

```
charizard 199           -> text:"charizard" AND (card_number_partial:"199" OR text:"199")
sv3pt5 199/091          -> set_code:"sv3pt5" AND card_number_full:"199/091"
151 booster box         -> text:"151" AND text:"booster" AND text:"box"
```

For `kind=sealed`, all tokens collapse to `text` since sealed has no card-number / set-code semantics in the same way.

## 5. Sealed search (TCGCSV only)

1. Load Pokémon groups list (cached in-memory per server instance, refreshed weekly via `lastFetchedAt` check on the cache entry).
2. Filter groups by name match against text tokens to narrow which groups' price CSVs we fetch.
3. For each candidate group, fetch its products + prices CSV from TCGCSV, filter to sealed product names matching this regex set: `Booster Box`, `Elite Trainer Box`, `Booster Bundle`, `Tin`, `Premium Collection`, `Build & Battle`, `Collection`, `Pack`. Exclude rows that match `Single Card`, `Promo Card`, or other singles patterns.
4. Score each match: name relevance (token overlap, full-word matches weighted higher) plus a small boost for newer release dates.
5. Return top N results.

## 6. Card search (TCGCSV + Pokémon TCG API in parallel)

1. Fire both calls in parallel with a 5s per-source timeout.
2. **Pokémon TCG API** returns canonical cards keyed by id like `sv3pt5-199`, with name, set, number, rarity, and a high-quality `images.large` URL. Source of truth for *display* fields.
3. **TCGCSV** returns SKU-level rows keyed by `tcgplayer_sku_id`, each tagged with variant + condition. Source of truth for *pricing keys*.
4. Merge by `(card_number, set_code)`:
   - Pokémon TCG API row is the base row.
   - TCGCSV rows under the same print are grouped by variant. Conditions other than NM are dropped at this stage (Plan 3 introduces condition on the purchase form).
   - Result shape per grouped row:

```ts
{
  type: 'card',
  cardNumber: '199/091',
  setName: 'Scarlet & Violet 151',
  setCode: 'sv3pt5',
  rarity: 'Illustration Rare',
  imageUrl: '<pokemontcg.io large image URL>',
  variants: [
    { catalogItemId: 1234, variant: 'normal',             marketCents: 1234 },
    { catalogItemId: 1235, variant: 'reverse_holo',       marketCents: 4567 },
    { catalogItemId: 1236, variant: 'illustration_rare',  marketCents: 18900 },
  ],
}
```

5. Lazy-import: one `catalog_items` row per `(set_code, card_number, variant)`. The UI groups them visually but the DB stores them flat — matches the parent spec's Section 3 schema.
6. Fallbacks:
   - TCGCSV times out: cards come from Pokémon TCG API only, single variant `normal` with `tcgplayerSkuId: null`, `marketCents: null`. Warning toast.
   - Pokémon TCG API times out: cards come from TCGCSV only, flat (no grouping by print). Warning toast.
   - Both fail: empty results, two warnings.

## 7. `kind=all` mode

Run sealed + card searches in parallel, interleave by score, return top 20 mixed. UI shows a `[All] [Sealed] [Cards]` chip row that re-runs the query with the new `kind` on click.

## 8. Image pipeline

### 8.1 Trigger
First server-render of `/catalog/[id]/page.tsx` (or first GET on `/api/catalog/[id]`) where `image_storage_path` is NULL. Subsequent requests are no-ops.

### 8.2 Steps
1. Read `catalog_items` row. If `image_storage_path` is set, return early.
2. If `image_url` is also NULL, exit silently. (Should not happen in practice.)
3. `fetch(image_url)` with 10s timeout, abort on non-2xx.
4. Re-encode to WebP via `sharp`: quality 85, max 800px wide, preserve aspect ratio.
5. Upload to Supabase Storage public bucket `catalog/` at path `{catalogItemId}.webp` (overwrite if exists).
6. `UPDATE catalog_items SET image_storage_path = 'catalog/{id}.webp' WHERE id = ?`.
7. Errors are logged, not thrown. Upstream URL keeps working as the fallback for the user.

### 8.3 Concurrency
`images.downloadIfMissing(id)` is idempotent. To avoid two concurrent picks downloading the same image, wrap in an in-memory `Map<id, Promise>` cache so duplicate calls in the same server instance share one promise. Across instances the race is harmless (storage upsert is fine).

### 8.4 URL resolver helper
`lib/utils/images.ts` (pure function, importable from both server and client code):

```ts
export function getImageUrl(item: { imageStoragePath?: string | null; imageUrl?: string | null }) {
  if (item.imageStoragePath) {
    return `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/${item.imageStoragePath}`;
  }
  return item.imageUrl ?? '/placeholder.svg';
}
```

A neutral `/public/placeholder.svg` (gray card silhouette) ships in `public/` for the rare case where both fields are null.

### 8.5 Bucket setup (one-time, manual)
- Create Supabase Storage bucket `catalog` with public access.
- Object size limit 1MB, MIME type allowlist `image/webp` only.
- Document this in plan prerequisites.

### 8.6 Why fire-and-forget
The user lands on `/catalog/[id]` and sees the upstream image immediately. The download runs server-side in the background. On their next visit (or after a soft refresh), the local CDN URL kicks in. Acceptable latency for v1.

### 8.7 Why `sharp`
Native module, ships well on Vercel, ~50KB output per image at q85 / 800px wide. Storage costs stay trivially small even at thousands of catalog items.

## 9. UI

### 9.1 `/catalog` (search-and-pick)

Server component shell with a client-side search island. Sketch:

```
+---------------------------------------------+
|  Search Pokemon products and cards          |
|  +---------------------------------------+  |
|  | charizard ex 199                      |  |
|  +---------------------------------------+  |
|  [All]  [Sealed]  [Cards]                   |
|                                             |
|  +----+--------------------------------+    |
|  |img | Charizard ex  ·  199/091       |    |
|  |    | Scarlet & Violet 151           |    |
|  |    | [Normal] [Reverse Holo] [Ill.] |    |
|  +----+--------------------------------+    |
|  +----+--------------------------------+    |
|  |img | ... next result ...            |    |
|  +----+--------------------------------+    |
+---------------------------------------------+
```

- Debounced input (300ms). TanStack Query `useQuery(['search', q, kind], ...)` with default `staleTime: 60s`.
- Empty state: tip text, "Try '151 ETB' or 'charizard 199'".
- Loading state: 3 skeleton rows.
- Error state: toast plus inline "Couldn't reach pricing source".
- Result row uses `getImageUrl` for thumbnail, shows name, set, kind badge.
  - Sealed: clicking the row navigates to `/catalog/[id]`.
  - Card: clicking a variant chip navigates to `/catalog/[id]` for that variant's row. Each chip shows the price in small caption text below the variant name.
- Mobile: same layout, single column. The kind chip row sticks below the search input.

### 9.2 `/catalog/[id]` (preview)

Server component. Sketch:

```
+-------------------------------------+
|  <- Back                            |
|                                     |
|  +------------+  Charizard ex       |
|  |   image    |  Illustration Rare  |
|  |   ~400px   |  Scarlet & Violet 151|
|  |            |  #199/091           |
|  +------------+                     |
|                                     |
|  Latest market price                |
|  $189.00         (as of 2026-04-25) |
|                                     |
|  [ Log purchase ]   <- Plan 1 stub  |
+-------------------------------------+
```

- Server fetches the catalog row via Drizzle. `catalog_items` and `market_prices` are `public read` under RLS, and Drizzle's postgres-js connection bypasses RLS anyway, so writes (lazy-import, snapshot insert) are also fine through it. This stays inside the parent spec's "Drizzle for service-role / public-read contexts" rule.
- If `image_storage_path` is NULL, fires `images.downloadIfMissing(id)` without awaiting.
- Latest price: query `market_prices` for the most recent snapshot. If none or older than 24h, call `tcgcsv.fetchSinglePrice(item)` synchronously and insert before rendering.
- "Log purchase" button is a `<Link>` to `/purchases/new?catalogItemId={id}`. Plan 3 wires that route up; the button works as navigation today.
- Stale price badge: if snapshot is more than 7 days old, show a "Stale (Nd ago)" badge per parent spec Section 7.3. (Won't be hit in Plan 2 since on-demand refresh is 24h, but the helper is built right.)

### 9.3 Nav tweaks
- Top nav `+ Add` button (currently `/purchases/new`) repointed to `/catalog`.
- Bottom tab bar `Add` tab repointed to `/catalog`.
- Plan 3 will reverse this (or have `/purchases/new` reuse the search component as wizard step 1).

## 10. API contracts

### 10.1 `GET /api/search`

**Query params:**
- `q` — required, 1-200 chars, trimmed.
- `kind` — optional, `all` | `sealed` | `card`, default `all`.
- `limit` — optional, 1-50, default 20.

**Response (200):**

```ts
{
  query: string;
  kind: 'all' | 'sealed' | 'card';
  results: Array<SealedResult | CardResult>;
  warnings: Array<{ source: 'tcgcsv' | 'pokemontcg'; message: string }>;
}

type SealedResult = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;        // 'ETB', 'Booster Box', etc.
  imageUrl: string;                  // resolved server-side via getImageUrl
  marketCents: number | null;        // current price if recently snapshotted, else null
}

type CardResult = {
  type: 'card';
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string;                  // resolved server-side via getImageUrl
  variants: Array<{
    catalogItemId: number;
    variant: string;
    marketCents: number | null;
  }>;
}
```

**Errors:**
- 400 if `q` empty after trim or `kind` / `limit` malformed.
- 200 with empty `results` and a `warnings` entry if both upstream APIs fail. Never 5xx.

**Side effects:** every result (and every variant) is upserted into `catalog_items`. Upsert keys:
- Sealed: `tcgplayer_product_id` (already unique in schema).
- Cards: `(set_code, card_number, variant)`. This unique constraint does not exist yet; Plan 2 adds it as a migration.

### 10.2 `GET /api/catalog/[id]`

**Path param:** `id` — `catalog_items.id`.

**Response (200):**

```ts
{
  id: number;
  kind: 'sealed' | 'card';
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;        // sealed only
  cardNumber: string | null;         // card only
  rarity: string | null;             // card only
  variant: string | null;            // card only
  imageUrl: string;                  // resolved server-side via getImageUrl
  msrpCents: number | null;
  latestPrice: {
    marketCents: number | null;
    snapshotDate: string;            // ISO date
    source: 'tcgcsv';
    isStale: boolean;                // true if > 7 days old
  } | null;
}
```

**Errors:**
- 404 if no row with that id.
- 200 with `latestPrice = null` if TCGCSV has no listing.

**Side effects:**
- If `image_storage_path` is NULL, fires `images.downloadIfMissing(id)` without awaiting.
- If no `market_prices` row in last 24h, synchronously fetches one snapshot and inserts before responding (~500-2000ms first-view latency; same-day repeats are fast).

## 11. Edge cases

| Case | Behavior |
|---|---|
| TCGCSV times out during sealed search | Empty results plus a warning. UI shows "Couldn't reach pricing sources, try again". |
| TCGCSV times out during card search | Card results from Pokémon TCG API only, no variants beyond `normal`, no prices. Warning toast. |
| Pokémon TCG API times out during card search | TCGCSV-only flat rows (no grouping). Warning toast. |
| Both APIs time out | Empty results, two warnings. |
| Search query resolves to >50 raw matches | Truncate to `limit` (default 20). No "show more" in v1. |
| TCGCSV has SKU but no current price | `marketCents: null`. UI renders `—`. |
| Card has Pokémon TCG API metadata but no TCGCSV SKU yet (very recent print) | One variant returned with `tcgplayerSkuId: null`, `variant: 'normal'`. Picking creates a catalog row with `tcgplayer_sku_id = null`; future price refresh skips it cleanly. |
| Same query searched twice in 60s | TanStack Query cache hit. No network. Lazy-import only writes on cache miss. |
| Image upstream URL 404s | `images.downloadIfMissing` logs and exits. Fallback chain falls through to `/placeholder.svg`. |
| Pokémon TCG API rate limited | 20k/day with key, ~1 call/query, single user nowhere near. If hit: degrade to TCGCSV-only with warning. |
| Concurrent searches lazy-importing same row | `INSERT ... ON CONFLICT DO UPDATE` on the unique key. Race is benign. |
| User searches with `q=""` after debounce trim | UI doesn't fire the request. API would 400 if it did. |

## 12. Testing

### 12.1 Unit tests (Vitest)

`lib/services/search.test.ts`:
- Tokenizer correctly classifies `199`, `199/091`, `sv3pt5`, `charizard`.
- Query "charizard 199" produces the expected AND-of-classes structure.
- Card merge: given mock TCGCSV variants + mock Pokémon TCG API canonical, output has one row per print with variants array correctly populated.
- Card merge: TCGCSV-only fallback when Pokémon TCG API returns nothing — flat rows, no grouping.
- Card merge: Pokémon TCG API-only fallback when TCGCSV returns nothing — single-variant `normal` rows with `tcgplayerSkuId: null`.
- Sealed product filter: keeps `Booster Box` / `ETB` / `Booster Bundle` / `Tin`, rejects `Single Card`, `Promo Card`.
- Score ranking: full-word match outranks partial; newer set outranks older for ties.

`lib/services/tcgcsv.test.ts`:
- Group cache: first call fetches, second call within 7 days hits cache, after 7 days re-fetches.
- Price CSV parsing: handles missing market price, malformed rows, empty CSV.
- `fetchSinglePrice`: returns null on 404, throws on 5xx.

`lib/services/images.test.ts`:
- `downloadIfMissing` short-circuits when `image_storage_path` is set.
- Concurrent calls for same id share a single in-flight promise.
- Failed upstream fetch leaves `image_storage_path` as NULL, no throw.
- Sharp re-encoding runs against a real fixture image to catch native-module breakage.

External APIs are mocked with `msw` at the network level. No real network calls in unit tests. A small `tests/fixtures/` directory holds canonical TCGCSV CSV + Pokémon TCG API JSON snippets and a 50KB fixture PNG for the image test.

### 12.2 Integration tests (Vitest, optional, gated on env)

`tests/integration/search.test.ts`:
- `GET /api/search?q=151+ETB&kind=sealed` returns at least one sealed result with `name` containing "Elite Trainer Box" and `setName` containing "151".
- Same query a second time hits the local catalog (verified by inspecting upserted rows + low API call count via spy).
- `GET /api/catalog/[id]` for a freshly-picked sealed item triggers an image download and returns a `latestPrice`.

These skip cleanly if `DATABASE_URL` and the relevant API keys aren't set.

### 12.3 Manual acceptance checklist

- `/catalog` page renders, search box focused.
- Typing "151 ETB" returns at least one sealed result with thumbnail and "Scarlet & Violet 151" set name.
- Typing "charizard ex 199" returns at least one card result grouped with multiple variant chips.
- Clicking the `[Sealed]` chip filters to sealed-only.
- Picking a sealed result navigates to `/catalog/[id]` showing image, name, set, latest price, "Log purchase" button.
- Picking a card variant chip navigates to `/catalog/[id]` for *that variant's* row, showing the variant in the heading.
- After refreshing `/catalog/[id]` once, `image_storage_path` is populated in the DB and the rendered image URL points at Supabase Storage.
- Clicking "Log purchase" navigates to `/purchases/new?catalogItemId=...` (Plan 1 stub, fine for now).
- Top nav `+ Add` and bottom tab bar `Add` both go to `/catalog`.
- No console errors. No Supabase RLS errors in network tab.

## 13. Plan 2 done means

1. Both upstream clients (`tcgcsv.ts`, `pokemontcg.ts`) work and are unit-tested.
2. Search returns correct grouped results with prices for known queries.
3. Picking a result creates a catalog row, downloads the image to Supabase Storage, and fetches a price snapshot.
4. The whole flow is reachable from the nav without dropping into the DB.
5. Tests pass: `npm test` and (if env present) `npm run test:integration`.

## 14. Migrations introduced by Plan 2

- New unique index on `catalog_items (set_code, card_number, variant) WHERE kind = 'card'`. Required for the cards lazy-import upsert key.
- New Supabase Storage bucket `catalog` (public, image/webp only, 1MB cap). Bucket creation is documented as a one-time manual prerequisite, not a SQL migration.

## 15. Coding conventions reminders

These already live in CLAUDE.md and the parent spec; restated here so the implementation plan can reference them by section number rather than re-derive.

- Money as integer cents end-to-end. `formatCents` only at render.
- Dates as ISO `YYYY-MM-DD` for `snapshot_date`, `release_date`. `TIMESTAMPTZ` only for `created_at` style fields.
- No em-dashes in user-facing copy. The `—` placeholder for null numerics is the only exception.
- Drizzle for service-role / public-read contexts. Supabase server/browser clients for user-scoped queries (none in Plan 2; everything here either reads `public read` tables or writes via service-role-equivalent).
- TanStack Query for all client data fetching. No raw `fetch` in components.
- All schema files under `lib/db/schema/`, one file per table.

## 16. Open questions

None at design time. The brainstorming session resolved the five scoping decisions in Section 2; remaining choices are implementation details for the writing-plans skill to express in tasks.
