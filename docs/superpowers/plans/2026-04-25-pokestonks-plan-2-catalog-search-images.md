# Pokestonks Plan 2 Implementation Plan — Catalog + Search + Images

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the catalog pipeline. By the end, a user can search "151 ETB" or "charizard ex 199" on `/catalog`, see ranked results with images, click into `/catalog/[id]` to view the image + latest TCGCSV market price, and navigate to a (still-stubbed) "Log purchase" route. The shared catalog and price snapshots populate lazily as searches happen.

**Architecture:** Two new upstream clients (`tcgcsv.ts`, `pokemontcg.ts`) plus a unified `search.ts` service that fans out, merges card variants by `(card_number, set_code)`, and lazy-imports rows into `catalog_items`. An `images.ts` service downloads picked-item images to Supabase Storage on first view (fire-and-forget). Price snapshots are fetched on-demand per pick (daily cron is Plan 6). Two new pages (`/catalog`, `/catalog/[id]`) and two new API routes (`/api/search`, `/api/catalog/[id]`).

**Tech Stack:** Adds to Plan 1 stack: `sharp` (image re-encode), `papaparse` (TCGCSV CSV), `msw` (network-level test mocks). All other tech (Next.js 15, Drizzle, Supabase Storage, TanStack Query) already in place from Plan 1.

**Spec reference:** `docs/superpowers/specs/2026-04-25-pokestonks-plan-2-catalog-search-images-design.md`. Sections referenced inline as `[design §N]`.

---

## File Structure

After this plan completes, the following are added or modified:

```
lib/
├── services/
│   ├── tcgcsv.ts                    # TCGCSV client (groups, products, prices)
│   ├── tcgcsv.test.ts
│   ├── pokemontcg.ts                # Pokémon TCG API client (cards only)
│   ├── pokemontcg.test.ts
│   ├── search.ts                    # tokenizer + sealed/card search + merge + lazy-import
│   ├── search.test.ts
│   ├── images.ts                    # downloadIfMissing (sharp + Supabase Storage)
│   └── images.test.ts
├── utils/
│   ├── images.ts                    # getImageUrl pure helper (server + client)
│   └── images.test.ts
└── db/schema/catalogItems.ts        # MODIFIED: add unique index for (kind, set_code, card_number, variant)

app/
├── (authenticated)/
│   └── catalog/
│       ├── page.tsx                 # search-and-pick
│       └── [id]/page.tsx            # preview
└── api/
    ├── search/route.ts              # GET ?q&kind&limit
    └── catalog/[id]/route.ts        # GET single item + latest price (+ async image download trigger)

components/
├── catalog/
│   ├── SearchBox.tsx                # debounced input + kind chips
│   ├── SearchResultRow.tsx          # single row, sealed or card-with-variants
│   └── PriceLabel.tsx               # formatted cents + stale badge
└── nav/
    ├── TopNav.tsx                   # MODIFIED: + Add → /catalog
    └── BottomTabBar.tsx             # MODIFIED: Add tab → /catalog

drizzle/
└── 0001_*.sql                       # generated: card unique index

tests/
├── fixtures/
│   ├── tcgcsv-groups.json
│   ├── tcgcsv-sv151-products.json
│   ├── tcgcsv-sv151-prices.csv
│   ├── pokemontcg-charizard.json
│   └── sample-card.png              # 200x280 PNG for image pipeline test
└── msw/
    ├── handlers.ts                  # default request handlers
    └── server.ts                    # node-side MSW server

public/
└── placeholder.svg                  # gray card silhouette
```

**Boundaries enforced:**

- `lib/services/*` — one file per upstream system or service concern. No HTTP handlers, no React.
- `lib/utils/images.ts` — pure helper, no I/O, importable from server and client.
- `lib/db/schema/catalogItems.ts` — schema definitions only; queries live elsewhere.
- `app/api/*` — thin route handlers calling services; no business logic.
- `components/catalog/*` — presentation only; state and fetching via hooks.
- `tests/fixtures/*` — canonical sample responses, used by msw handlers.

---

## Manual Prerequisites

These can't be automated. Do all three before starting Task 1.

- [ ] **Create Supabase Storage bucket `catalog`.**
  - Supabase dashboard → Storage → New bucket.
  - Name: `catalog`
  - Public bucket: **on** (so we can serve via Supabase CDN without signed URLs).
  - File size limit: `1 MB`
  - Allowed MIME types: `image/webp`
  - After creation, confirm it appears in the Storage list and that "Public" is true.

- [ ] **Verify `POKEMONTCG_API_KEY` is set.**

In `.env.local`, confirm a value (you registered the key during Plan 1's prerequisites). Test it:

```bash
curl -s -H "X-Api-Key: $(grep POKEMONTCG_API_KEY .env.local | cut -d= -f2)" \
  "https://api.pokemontcg.io/v2/cards?q=name:charizard%20number:199&pageSize=1" | head -c 200
```

Expected: a JSON object beginning with `{"data":[{"id":"sv3pt5-199",`. If you get `{"error":...}`, fix the key in `.env.local` and Vercel before continuing.

- [ ] **Confirm dev server still works.**

```bash
npm run dev
```

Visit `http://localhost:3000`, sign in, confirm dashboard renders. Stop with `Ctrl+C`.

---

## Task 1: Install new dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install sharp papaparse
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D @types/papaparse msw undici
```

`undici` provides a fetch implementation msw uses under the hood in Node 20.

- [ ] **Step 3: Verify install**

```bash
npm ls sharp papaparse msw
```

Expected: all three resolve, no `UNMET DEPENDENCY` lines.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add sharp, papaparse, msw for catalog pipeline"
```

---

## Task 2: Set up MSW for unit tests

**Files:**
- Create: `tests/msw/server.ts`, `tests/msw/handlers.ts`
- Modify: `tests/setup.ts`, `vitest.config.mts`

- [ ] **Step 1: Create default request handlers**

Create `tests/msw/handlers.ts`:

```ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Default: any unmocked TCGCSV / Pokémon TCG call returns 503 so tests fail loudly.
  http.get('https://tcgcsv.com/*', () =>
    HttpResponse.json({ error: 'unmocked tcgcsv call' }, { status: 503 })
  ),
  http.get('https://api.pokemontcg.io/*', () =>
    HttpResponse.json({ error: 'unmocked pokemontcg call' }, { status: 503 })
  ),
];
```

- [ ] **Step 2: Create the node MSW server**

Create `tests/msw/server.ts`:

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

- [ ] **Step 3: Wire MSW into the global test setup**

Edit `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 4: Verify vitest still runs**

```bash
npm test
```

Expected: existing middleware tests still pass.

- [ ] **Step 5: Commit**

```bash
git add tests/msw tests/setup.ts
git commit -m "test: add msw server with default handlers for unit tests"
```

---

## Task 3: Add card unique index migration

The lazy-import upsert key for cards is `(kind, set_code, card_number, variant)`. Plan 1 didn't include it.

**Files:**
- Modify: `lib/db/schema/catalogItems.ts`
- Create: `drizzle/0001_*.sql` (generated)

- [ ] **Step 1: Modify the schema**

Edit `lib/db/schema/catalogItems.ts`. Add a `cardUniqueIdx` to the indexes block (only enforced when `kind = 'card'` so sealed rows aren't constrained):

```ts
import { pgTable, bigserial, text, integer, date, timestamp, bigint, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const catalogItems = pgTable(
  'catalog_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    setName: text('set_name'),
    setCode: text('set_code'),
    tcgplayerProductId: bigint('tcgplayer_product_id', { mode: 'number' }).unique(),
    productType: text('product_type'),
    msrpCents: integer('msrp_cents'),
    pokemonTcgCardId: text('pokemon_tcg_card_id'),
    tcgplayerSkuId: bigint('tcgplayer_sku_id', { mode: 'number' }),
    cardNumber: text('card_number'),
    rarity: text('rarity'),
    variant: text('variant'),
    imageUrl: text('image_url'),
    imageStoragePath: text('image_storage_path'),
    releaseDate: date('release_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindSetCodeIdx: index('catalog_items_kind_set_code_idx').on(t.kind, t.setCode),
    nameSearchIdx: index('catalog_items_name_search_idx').using('gin', sql`to_tsvector('english', ${t.name})`),
    cardNumberIdx: index('catalog_items_card_number_idx').on(t.cardNumber).where(sql`${t.kind} = 'card'`),
    cardUniqueIdx: uniqueIndex('catalog_items_card_unique_idx')
      .on(t.setCode, t.cardNumber, t.variant)
      .where(sql`${t.kind} = 'card'`),
  })
);

export type CatalogItem = typeof catalogItems.$inferSelect;
export type NewCatalogItem = typeof catalogItems.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:generate
```

Expected: a new file `drizzle/0001_*.sql` is created. Open it and confirm it contains a `CREATE UNIQUE INDEX ... WHERE kind = 'card'` statement and nothing else surprising. If the diff includes drops or alters of unrelated columns, abort and reconcile schema with the live DB before continuing.

- [ ] **Step 3: Apply via drizzle-kit migrate (NOT push — push needs TTY per stack-gotchas memory)**

Add a script if it doesn't exist. Open `package.json` and confirm or add:

```json
"db:migrate": "drizzle-kit migrate"
```

Then run:

```bash
npm run db:migrate
```

Expected: applies `0001_*.sql` against Supabase. No prompts.

- [ ] **Step 4: Verify in Supabase**

Supabase dashboard → Database → Indexes. Confirm `catalog_items_card_unique_idx` exists on `catalog_items`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/catalogItems.ts drizzle package.json
git commit -m "feat(db): add unique index for cards lazy-import upsert key"
```

---

## Task 4: Image URL resolver helper (`lib/utils/images.ts`)

Pure function. Easiest TDD warm-up.

**Files:**
- Create: `lib/utils/images.ts`, `lib/utils/images.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/utils/images.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getImageUrl } from './images';

const ENV_URL = 'https://abc.supabase.co';

describe('getImageUrl', () => {
  it('returns Supabase public URL when image_storage_path is set', () => {
    expect(
      getImageUrl(
        { imageStoragePath: 'catalog/42.webp', imageUrl: 'https://upstream.example/x.png' },
        ENV_URL
      )
    ).toBe('https://abc.supabase.co/storage/v1/object/public/catalog/42.webp');
  });

  it('falls back to upstream image_url when storage path is null', () => {
    expect(
      getImageUrl({ imageStoragePath: null, imageUrl: 'https://upstream.example/x.png' }, ENV_URL)
    ).toBe('https://upstream.example/x.png');
  });

  it('falls back to placeholder when both are null', () => {
    expect(getImageUrl({ imageStoragePath: null, imageUrl: null }, ENV_URL)).toBe('/placeholder.svg');
  });

  it('treats undefined fields the same as null', () => {
    expect(getImageUrl({}, ENV_URL)).toBe('/placeholder.svg');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/utils/images
```

Expected: FAIL with "Cannot find module './images'".

- [ ] **Step 3: Implement**

Create `lib/utils/images.ts`:

```ts
type ImageFields = {
  imageStoragePath?: string | null;
  imageUrl?: string | null;
};

export function getImageUrl(item: ImageFields, supabaseUrl?: string): string {
  if (item.imageStoragePath) {
    const base = supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return `${base}/storage/v1/object/public/${item.imageStoragePath}`;
  }
  if (item.imageUrl) return item.imageUrl;
  return '/placeholder.svg';
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/utils/images
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/images.ts lib/utils/images.test.ts
git commit -m "feat(utils): add getImageUrl resolver with storage/upstream/placeholder fallback"
```

---

## Task 5: Placeholder SVG

Trivial asset.

**Files:**
- Create: `public/placeholder.svg`

- [ ] **Step 1: Write the file**

Create `public/placeholder.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" width="200" height="280" role="img" aria-label="No image">
  <rect width="200" height="280" rx="12" fill="#e2e8f0"/>
  <path d="M70 110h60a4 4 0 0 1 4 4v52a4 4 0 0 1-4 4H70a4 4 0 0 1-4-4v-52a4 4 0 0 1 4-4z" fill="#94a3b8"/>
  <circle cx="86" cy="128" r="6" fill="#cbd5e1"/>
  <path d="M70 162l18-22 12 14 16-20 14 28z" fill="#cbd5e1"/>
</svg>
```

- [ ] **Step 2: Verify it renders**

```bash
npm run dev
```

Visit `http://localhost:3000/placeholder.svg`. Expected: a gray rounded rectangle with a stylized image icon. Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add public/placeholder.svg
git commit -m "chore: add placeholder.svg for missing catalog images"
```

---

## Task 6: TCGCSV client — groups list with cache

TCGCSV serves Pokémon groups (sets) at `https://tcgcsv.com/tcgplayer/3/groups`. Cache in-memory per server instance, refresh when older than 7 days.

**Files:**
- Create: `lib/services/tcgcsv.ts`, `lib/services/tcgcsv.test.ts`
- Create: `tests/fixtures/tcgcsv-groups.json`

- [ ] **Step 1: Add a small fixture**

Create `tests/fixtures/tcgcsv-groups.json`:

```json
{
  "totalItems": 3,
  "success": true,
  "errors": [],
  "results": [
    {
      "groupId": 23237,
      "name": "Scarlet & Violet 151",
      "abbreviation": "SV3PT5",
      "isSupplemental": false,
      "publishedOn": "2023-09-22T00:00:00",
      "modifiedOn": "2024-01-04T20:24:13.503",
      "categoryId": 3
    },
    {
      "groupId": 23244,
      "name": "Paldean Fates",
      "abbreviation": "SV4PT5",
      "isSupplemental": false,
      "publishedOn": "2024-01-26T00:00:00",
      "modifiedOn": "2024-02-01T15:00:00",
      "categoryId": 3
    },
    {
      "groupId": 1234,
      "name": "Some Older Set",
      "abbreviation": "OLD",
      "isSupplemental": false,
      "publishedOn": "2018-01-01T00:00:00",
      "modifiedOn": "2018-02-01T00:00:00",
      "categoryId": 3
    }
  ]
}
```

- [ ] **Step 2: Write failing tests**

Create `lib/services/tcgcsv.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import { __resetGroupCacheForTests, getGroups } from './tcgcsv';

describe('tcgcsv.getGroups', () => {
  beforeEach(() => __resetGroupCacheForTests());

  it('fetches groups from TCGCSV on first call', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    const groups = await getGroups();
    expect(hits).toBe(1);
    expect(groups).toHaveLength(3);
    expect(groups[0].name).toBe('Scarlet & Violet 151');
    expect(groups[0].abbreviation).toBe('SV3PT5');
  });

  it('caches within 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    await getGroups();
    await getGroups();
    expect(hits).toBe(1);
  });

  it('refreshes when cache is older than 7 days', async () => {
    let hits = 0;
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => {
        hits++;
        return HttpResponse.json(groupsFixture);
      })
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await getGroups();
    vi.setSystemTime(new Date('2026-01-09T00:00:00Z')); // +8 days
    await getGroups();
    expect(hits).toBe(2);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- lib/services/tcgcsv
```

Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

Create `lib/services/tcgcsv.ts`:

```ts
const TCGCSV_BASE = 'https://tcgcsv.com/tcgplayer/3';
const POKEMON_CATEGORY_ID = 3;
const GROUP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation: string | null;
  isSupplemental: boolean;
  publishedOn: string;
  modifiedOn: string;
  categoryId: number;
};

let groupCache: { fetchedAt: number; groups: TcgcsvGroup[] } | null = null;

export function __resetGroupCacheForTests() {
  groupCache = null;
}

export async function getGroups(now: number = Date.now()): Promise<TcgcsvGroup[]> {
  if (groupCache && now - groupCache.fetchedAt < GROUP_CACHE_TTL_MS) {
    return groupCache.groups;
  }
  const res = await fetch(`${TCGCSV_BASE}/groups`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`TCGCSV groups fetch failed: ${res.status}`);
  }
  const body = (await res.json()) as { results: TcgcsvGroup[] };
  groupCache = { fetchedAt: now, groups: body.results };
  return body.results;
}

export const __test = { POKEMON_CATEGORY_ID };
```

- [ ] **Step 5: Run, confirm pass**

```bash
npm test -- lib/services/tcgcsv
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/tcgcsv.ts lib/services/tcgcsv.test.ts tests/fixtures/tcgcsv-groups.json
git commit -m "feat(services): add tcgcsv groups cache with 7-day TTL"
```

---

## Task 7: TCGCSV client — sealed product search

Walks the cached groups, filters by name match, fetches products + prices for promising groups, filters to sealed product names, scores, returns top N.

**Files:**
- Modify: `lib/services/tcgcsv.ts`, `lib/services/tcgcsv.test.ts`
- Create: `tests/fixtures/tcgcsv-sv151-products.json`, `tests/fixtures/tcgcsv-sv151-prices.csv`

- [ ] **Step 1: Add product fixture**

Create `tests/fixtures/tcgcsv-sv151-products.json`:

```json
{
  "totalItems": 4,
  "success": true,
  "errors": [],
  "results": [
    {
      "productId": 480000,
      "name": "Scarlet & Violet 151 Elite Trainer Box",
      "cleanName": "Scarlet & Violet 151 Elite Trainer Box",
      "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/480000_200w.jpg",
      "categoryId": 3,
      "groupId": 23237,
      "url": "https://www.tcgplayer.com/product/480000",
      "modifiedOn": "2024-01-04T20:24:13.503",
      "imageCount": 1,
      "presale": false,
      "extendedData": []
    },
    {
      "productId": 480001,
      "name": "Scarlet & Violet 151 Booster Box",
      "cleanName": "Scarlet & Violet 151 Booster Box",
      "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/480001_200w.jpg",
      "categoryId": 3,
      "groupId": 23237,
      "url": "https://www.tcgplayer.com/product/480001",
      "modifiedOn": "2024-01-04T20:24:13.503",
      "imageCount": 1,
      "presale": false,
      "extendedData": []
    },
    {
      "productId": 480002,
      "name": "Scarlet & Violet 151 Booster Bundle",
      "cleanName": "Scarlet & Violet 151 Booster Bundle",
      "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/480002_200w.jpg",
      "categoryId": 3,
      "groupId": 23237,
      "url": "https://www.tcgplayer.com/product/480002",
      "modifiedOn": "2024-01-04T20:24:13.503",
      "imageCount": 1,
      "presale": false,
      "extendedData": []
    },
    {
      "productId": 490000,
      "name": "Charizard ex - 199/091",
      "cleanName": "Charizard ex 199 091",
      "imageUrl": "https://tcgplayer-cdn.tcgplayer.com/product/490000_200w.jpg",
      "categoryId": 3,
      "groupId": 23237,
      "url": "https://www.tcgplayer.com/product/490000",
      "modifiedOn": "2024-01-04T20:24:13.503",
      "imageCount": 1,
      "presale": false,
      "extendedData": [
        { "name": "Number", "displayName": "Number", "value": "199/091" },
        { "name": "Rarity", "displayName": "Rarity", "value": "Special Illustration Rare" }
      ]
    }
  ]
}
```

Create `tests/fixtures/tcgcsv-sv151-prices.csv` (TCGCSV serves prices as CSV):

```csv
productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName
480000,69.99,79.99,89.99,74.50,72.00,Normal
480001,159.99,179.99,219.99,189.99,175.00,Normal
480002,28.99,32.99,39.99,33.50,31.00,Normal
490000,150.00,170.00,220.00,189.00,165.00,Normal
490000,950.00,1050.00,1200.00,1100.00,1000.00,Holofoil
```

- [ ] **Step 2: Add tests for sealed search**

Append to `lib/services/tcgcsv.test.ts` (keep existing imports / describe; add a new describe block):

```ts
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchSealed } from './tcgcsv';

const sv151PricesCsv = readFileSync(
  join(__dirname, '..', '..', 'tests', 'fixtures', 'tcgcsv-sv151-prices.csv'),
  'utf8'
);

describe('tcgcsv.searchSealed', () => {
  beforeEach(() => __resetGroupCacheForTests());

  function mockApi() {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/23244/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/23244/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/1234/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/1234/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
  }

  it('returns SV151 ETB for "151 etb" query', async () => {
    mockApi();
    const results = await searchSealed('151 etb', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toMatch(/Elite Trainer Box/i);
    expect(results[0].setName).toBe('Scarlet & Violet 151');
    expect(results[0].marketCents).toBe(7450);
  });

  it('excludes singles like "Charizard ex - 199/091"', async () => {
    mockApi();
    const results = await searchSealed('charizard', 10);
    expect(results.find((r) => /199/.test(r.name))).toBeUndefined();
  });

  it('classifies productType from name', async () => {
    mockApi();
    const all = await searchSealed('151', 10);
    const types = new Set(all.map((r) => r.productType));
    expect(types.has('Elite Trainer Box')).toBe(true);
    expect(types.has('Booster Box')).toBe(true);
    expect(types.has('Booster Bundle')).toBe(true);
  });

  it('returns empty for nonsense query', async () => {
    mockApi();
    const results = await searchSealed('zzzzzzzz', 10);
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- lib/services/tcgcsv
```

Expected: FAIL on `searchSealed` not exported.

- [ ] **Step 4: Implement**

Append to `lib/services/tcgcsv.ts` (this is the full sealed-search block — no follow-up edits needed):

```ts
import Papa from 'papaparse';

const SEALED_PATTERNS: Array<{ pattern: RegExp; productType: string }> = [
  { pattern: /\bElite Trainer Box\b/i, productType: 'Elite Trainer Box' },
  { pattern: /\bBooster Box\b/i, productType: 'Booster Box' },
  { pattern: /\bBooster Bundle\b/i, productType: 'Booster Bundle' },
  { pattern: /\bPremium Collection\b/i, productType: 'Premium Collection' },
  { pattern: /\bBuild & Battle\b/i, productType: 'Build & Battle' },
  { pattern: /\bCollection Box\b/i, productType: 'Collection Box' },
  { pattern: /\bCollection\b/i, productType: 'Collection' },
  { pattern: /\bTin\b/i, productType: 'Tin' },
  { pattern: /\bBlister\b/i, productType: 'Blister' },
];

const SINGLES_REJECT = /\b(Single Card|Promo Card|Code Card)\b|\b\d+\/\d+\b/i;

export type TcgcsvProduct = {
  productId: number;
  name: string;
  cleanName: string;
  imageUrl: string | null;
  groupId: number;
  modifiedOn: string;
  extendedData?: Array<{ name: string; value: string }>;
};

export type TcgcsvPriceRow = {
  productId: number;
  marketPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  subTypeName: string;
};

export type SealedSearchHit = {
  tcgplayerProductId: number;
  name: string;
  setName: string;
  setCode: string | null;
  productType: string;
  imageUrl: string | null;
  marketCents: number | null;
  releaseDate: string | null;
  groupId: number;
};

async function fetchProducts(groupId: number): Promise<TcgcsvProduct[]> {
  const res = await fetch(`${TCGCSV_BASE}/${groupId}/products`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`tcgcsv products ${groupId} ${res.status}`);
  const body = (await res.json()) as { results: TcgcsvProduct[] };
  return body.results;
}

async function fetchPrices(groupId: number): Promise<TcgcsvPriceRow[]> {
  const res = await fetch(`${TCGCSV_BASE}/${groupId}/prices`, { headers: { Accept: 'text/csv' } });
  if (!res.ok) throw new Error(`tcgcsv prices ${groupId} ${res.status}`);
  const csv = await res.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  return parsed.data
    .filter((r) => r.productId)
    .map((r) => ({
      productId: Number(r.productId),
      marketPrice: r.marketPrice ? Number(r.marketPrice) : null,
      lowPrice: r.lowPrice ? Number(r.lowPrice) : null,
      highPrice: r.highPrice ? Number(r.highPrice) : null,
      subTypeName: r.subTypeName ?? 'Normal',
    }));
}

function classifySealedType(name: string): string | null {
  for (const { pattern, productType } of SEALED_PATTERNS) {
    if (pattern.test(name)) return productType;
  }
  return null;
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function score(name: string, setName: string, tokens: string[]): number {
  const haystack = `${name} ${setName}`.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(haystack)) s += 10;
    else if (haystack.includes(t)) s += 3;
  }
  return s;
}

export async function searchSealed(query: string, limit: number): Promise<SealedSearchHit[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const groups = await getGroups();
  // Filter groups whose name shares any token (broad — narrows hot-path fetches).
  const candidateGroups = groups.filter((g) => {
    const lower = g.name.toLowerCase();
    return tokens.some((t) => lower.includes(t));
  });
  // If no group name matches, scan all groups (rare, e.g. user types "ETB").
  const groupsToFetch = candidateGroups.length > 0 ? candidateGroups : groups;

  const results: SealedSearchHit[] = [];
  await Promise.all(
    groupsToFetch.map(async (g) => {
      const [products, prices] = await Promise.all([fetchProducts(g.groupId), fetchPrices(g.groupId)]);
      const priceByProduct = new Map<number, TcgcsvPriceRow>();
      for (const p of prices) {
        const existing = priceByProduct.get(p.productId);
        if (!existing || (existing.subTypeName !== 'Normal' && p.subTypeName === 'Normal')) {
          priceByProduct.set(p.productId, p);
        }
      }
      for (const product of products) {
        if (SINGLES_REJECT.test(product.name)) continue;
        const productType = classifySealedType(product.name);
        if (!productType) continue;
        const price = priceByProduct.get(product.productId);
        results.push({
          tcgplayerProductId: product.productId,
          name: product.name,
          setName: g.name,
          setCode: g.abbreviation ? g.abbreviation.toLowerCase() : null,
          productType,
          imageUrl: product.imageUrl,
          marketCents: price?.marketPrice != null ? Math.round(price.marketPrice * 100) : null,
          releaseDate: g.publishedOn ? g.publishedOn.slice(0, 10) : null,
          groupId: g.groupId,
        });
      }
    })
  );

  return results
    .map((r) => ({ r, s: score(r.name, r.setName, tokens) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => r);
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npm test -- lib/services/tcgcsv
```

Expected: 7 tests pass (3 group + 4 sealed).

- [ ] **Step 6: Commit**

```bash
git add lib/services/tcgcsv.ts lib/services/tcgcsv.test.ts tests/fixtures
git commit -m "feat(services): add tcgcsv sealed search with product/price fetch and scoring"
```

---

## Task 8: TCGCSV client — fetch a single product price (on-demand)

Used by `/api/catalog/[id]` to refresh prices when no recent snapshot exists. Hits `/tcgplayer/3/{groupId}/prices` and filters by `productId` (or `skuId` for cards).

**Files:**
- Modify: `lib/services/tcgcsv.ts`, `lib/services/tcgcsv.test.ts`

- [ ] **Step 1: Add the test**

Append to `lib/services/tcgcsv.test.ts`:

```ts
import { fetchSinglePrice } from './tcgcsv';

describe('tcgcsv.fetchSinglePrice', () => {
  beforeEach(() => __resetGroupCacheForTests());

  it('returns the market price in cents for a known product', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      )
    );
    const price = await fetchSinglePrice({ groupId: 23237, productId: 480001, subType: 'Normal' });
    expect(price?.marketCents).toBe(18999);
    expect(price?.lowCents).toBe(15999);
    expect(price?.highCents).toBe(21999);
  });

  it('returns null when productId is not in the prices CSV', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      )
    );
    const price = await fetchSinglePrice({ groupId: 23237, productId: 99999, subType: 'Normal' });
    expect(price).toBeNull();
  });

  it('throws on 5xx', async () => {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () => new HttpResponse(null, { status: 502 }))
    );
    await expect(fetchSinglePrice({ groupId: 23237, productId: 1 })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/services/tcgcsv
```

Expected: FAIL on `fetchSinglePrice` not exported.

- [ ] **Step 3: Implement**

Append to `lib/services/tcgcsv.ts`:

```ts
export type SinglePriceResult = {
  marketCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  subTypeName: string;
};

export async function fetchSinglePrice(args: {
  groupId: number;
  productId: number;
  subType?: string;
}): Promise<SinglePriceResult | null> {
  const rows = await fetchPrices(args.groupId);
  const candidates = rows.filter((r) => r.productId === args.productId);
  if (candidates.length === 0) return null;
  const preferred =
    candidates.find((r) => r.subTypeName === (args.subType ?? 'Normal')) ?? candidates[0];
  return {
    marketCents: preferred.marketPrice != null ? Math.round(preferred.marketPrice * 100) : null,
    lowCents: preferred.lowPrice != null ? Math.round(preferred.lowPrice * 100) : null,
    highCents: preferred.highPrice != null ? Math.round(preferred.highPrice * 100) : null,
    subTypeName: preferred.subTypeName,
  };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/services/tcgcsv
```

Expected: all 10 tcgcsv tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/tcgcsv.ts lib/services/tcgcsv.test.ts
git commit -m "feat(services): add fetchSinglePrice for on-demand price refresh"
```

---

## Task 9: Pokémon TCG API client

Card metadata + high-quality images. Used during card search.

**Files:**
- Create: `lib/services/pokemontcg.ts`, `lib/services/pokemontcg.test.ts`
- Create: `tests/fixtures/pokemontcg-charizard.json`

- [ ] **Step 1: Add fixture**

Create `tests/fixtures/pokemontcg-charizard.json`:

```json
{
  "data": [
    {
      "id": "sv3pt5-199",
      "name": "Charizard ex",
      "supertype": "Pokémon",
      "subtypes": ["Stage 2", "ex"],
      "rarity": "Special Illustration Rare",
      "number": "199",
      "set": {
        "id": "sv3pt5",
        "name": "Scarlet & Violet 151",
        "ptcgoCode": "MEW",
        "printedTotal": 165,
        "total": 207,
        "releaseDate": "2023/09/22"
      },
      "images": {
        "small": "https://images.pokemontcg.io/sv3pt5/199.png",
        "large": "https://images.pokemontcg.io/sv3pt5/199_hires.png"
      }
    },
    {
      "id": "sv3pt5-200",
      "name": "Charizard ex",
      "supertype": "Pokémon",
      "subtypes": ["Stage 2", "ex"],
      "rarity": "Special Illustration Rare",
      "number": "200",
      "set": {
        "id": "sv3pt5",
        "name": "Scarlet & Violet 151",
        "ptcgoCode": "MEW",
        "printedTotal": 165,
        "total": 207,
        "releaseDate": "2023/09/22"
      },
      "images": {
        "small": "https://images.pokemontcg.io/sv3pt5/200.png",
        "large": "https://images.pokemontcg.io/sv3pt5/200_hires.png"
      }
    }
  ],
  "page": 1,
  "pageSize": 50,
  "count": 2,
  "totalCount": 2
}
```

- [ ] **Step 2: Write tests**

Create `lib/services/pokemontcg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';
import { searchCards } from './pokemontcg';

describe('pokemontcg.searchCards', () => {
  it('builds q=name:* number:* from text+number tokens', async () => {
    let lastUrl = '';
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', ({ request }) => {
        lastUrl = request.url;
        return HttpResponse.json(charizardFixture);
      })
    );
    const results = await searchCards({ text: ['charizard'], cardNumberPartial: '199' });
    expect(lastUrl).toContain('q=');
    expect(decodeURIComponent(lastUrl)).toContain('name:*charizard*');
    expect(decodeURIComponent(lastUrl)).toContain('number:199');
    expect(results).toHaveLength(2);
    expect(results[0].cardId).toBe('sv3pt5-199');
    expect(results[0].imageUrl).toBe('https://images.pokemontcg.io/sv3pt5/199_hires.png');
    expect(results[0].setCode).toBe('sv3pt5');
  });

  it('returns empty array on 404', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json({ data: [] }))
    );
    const results = await searchCards({ text: ['nonsense'] });
    expect(results).toEqual([]);
  });

  it('throws on 5xx', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 503 }))
    );
    await expect(searchCards({ text: ['charizard'] })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- lib/services/pokemontcg
```

Expected: FAIL, module not found.

- [ ] **Step 4: Implement**

Create `lib/services/pokemontcg.ts`:

```ts
const POKEMONTCG_BASE = 'https://api.pokemontcg.io/v2';

export type PokemonTcgCard = {
  cardId: string;            // 'sv3pt5-199'
  name: string;
  rarity: string | null;
  number: string;            // '199'
  setName: string | null;
  setCode: string | null;    // 'sv3pt5'
  releaseDate: string | null;// 'YYYY-MM-DD'
  imageUrl: string | null;   // images.large
};

type RawCard = {
  id: string;
  name: string;
  rarity?: string;
  number: string;
  set: { id: string; name: string; releaseDate?: string };
  images: { small?: string; large?: string };
};

export async function searchCards(args: {
  text?: string[];
  cardNumberPartial?: string | null;
  cardNumberFull?: string | null;
  setCode?: string | null;
  pageSize?: number;
}): Promise<PokemonTcgCard[]> {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  const parts: string[] = [];
  for (const t of args.text ?? []) {
    parts.push(`name:*${t}*`);
  }
  if (args.cardNumberFull) {
    const [n] = args.cardNumberFull.split('/');
    parts.push(`number:${n}`);
  } else if (args.cardNumberPartial) {
    parts.push(`number:${args.cardNumberPartial}`);
  }
  if (args.setCode) {
    parts.push(`set.id:${args.setCode}`);
  }
  if (parts.length === 0) return [];
  const params = new URLSearchParams({
    q: parts.join(' '),
    pageSize: String(args.pageSize ?? 50),
    orderBy: '-set.releaseDate,number',
  });
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const res = await fetch(`${POKEMONTCG_BASE}/cards?${params.toString()}`, { headers });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`pokemontcg cards ${res.status}`);
  const body = (await res.json()) as { data: RawCard[] };
  return body.data.map((c) => ({
    cardId: c.id,
    name: c.name,
    rarity: c.rarity ?? null,
    number: c.number,
    setName: c.set.name ?? null,
    setCode: c.set.id ?? null,
    releaseDate: c.set.releaseDate ? c.set.releaseDate.replaceAll('/', '-') : null,
    imageUrl: c.images.large ?? c.images.small ?? null,
  }));
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npm test -- lib/services/pokemontcg
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/services/pokemontcg.ts lib/services/pokemontcg.test.ts tests/fixtures/pokemontcg-charizard.json
git commit -m "feat(services): add pokemontcg client for card metadata + images"
```

---

## Task 10: Search service — tokenizer

The single piece of pure logic that classifies query tokens into `text` / `card_number_full` / `card_number_partial` / `set_code`.

**Files:**
- Create: `lib/services/search.ts`, `lib/services/search.test.ts`

- [ ] **Step 1: Write tests**

Create `lib/services/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tokenizeQuery } from './search';

describe('tokenizeQuery', () => {
  it('classifies a card_number_full token', () => {
    expect(tokenizeQuery('199/091')).toEqual({
      text: [],
      cardNumberFull: '199/091',
      cardNumberPartial: null,
      setCode: null,
    });
  });

  it('classifies a 1-3 digit numeric as card_number_partial', () => {
    expect(tokenizeQuery('199').cardNumberPartial).toBe('199');
    expect(tokenizeQuery('74').cardNumberPartial).toBe('74');
  });

  it('classifies a set code', () => {
    expect(tokenizeQuery('sv3pt5').setCode).toBe('sv3pt5');
    expect(tokenizeQuery('SWSH11').setCode).toBe('swsh11');
  });

  it('classifies plain words as text', () => {
    expect(tokenizeQuery('charizard ex').text).toEqual(['charizard', 'ex']);
  });

  it('handles a mixed query', () => {
    const t = tokenizeQuery('charizard ex 199');
    expect(t.text).toEqual(['charizard', 'ex']);
    expect(t.cardNumberPartial).toBe('199');
  });

  it('handles set code + full card number', () => {
    const t = tokenizeQuery('sv3pt5 199/091');
    expect(t.setCode).toBe('sv3pt5');
    expect(t.cardNumberFull).toBe('199/091');
  });

  it('lowercases and trims', () => {
    expect(tokenizeQuery('  Charizard  EX  ').text).toEqual(['charizard', 'ex']);
  });

  it('returns all-empty for empty input', () => {
    expect(tokenizeQuery('')).toEqual({
      text: [],
      cardNumberFull: null,
      cardNumberPartial: null,
      setCode: null,
    });
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/services/search
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/services/search.ts`:

```ts
export type Tokens = {
  text: string[];
  cardNumberFull: string | null;
  cardNumberPartial: string | null;
  setCode: string | null;
};

const RE_CARD_FULL = /^\d+\/\d+$/;
const RE_CARD_PARTIAL = /^\d{1,3}$/;
const RE_SET_CODE = /^[a-z]{2,4}\d+(?:pt\d+)?$/i;

export function tokenizeQuery(q: string): Tokens {
  const tokens = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const out: Tokens = { text: [], cardNumberFull: null, cardNumberPartial: null, setCode: null };
  for (const t of tokens) {
    if (RE_CARD_FULL.test(t)) {
      out.cardNumberFull = t;
    } else if (RE_CARD_PARTIAL.test(t)) {
      out.cardNumberPartial = t;
    } else if (RE_SET_CODE.test(t)) {
      out.setCode = t;
    } else {
      out.text.push(t);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/services/search
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/search.ts lib/services/search.test.ts
git commit -m "feat(services): add search query tokenizer"
```

---

## Task 11: Search service — sealed search wrapper + lazy-import upsert

Wraps `tcgcsv.searchSealed`, upserts each result into `catalog_items`, returns the result with `catalogItemId` populated.

**Files:**
- Modify: `lib/services/search.ts`, `lib/services/search.test.ts`
- Create: `lib/db/upserts/catalogItems.ts`

- [ ] **Step 1: Create the upsert helper**

Create `lib/db/upserts/catalogItems.ts`:

```ts
import 'server-only';
import { db, schema } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

export type SealedUpsertInput = {
  kind: 'sealed';
  name: string;
  setName: string | null;
  setCode: string | null;
  tcgplayerProductId: number;
  productType: string;
  imageUrl: string | null;
  releaseDate: string | null;
};

export type CardUpsertInput = {
  kind: 'card';
  name: string;
  setName: string | null;
  setCode: string | null;
  pokemonTcgCardId: string | null;
  tcgplayerSkuId: number | null;
  cardNumber: string;
  rarity: string | null;
  variant: string;
  imageUrl: string | null;
  releaseDate: string | null;
};

export async function upsertSealed(input: SealedUpsertInput): Promise<number> {
  const rows = await db
    .insert(schema.catalogItems)
    .values({
      kind: 'sealed',
      name: input.name,
      setName: input.setName,
      setCode: input.setCode,
      tcgplayerProductId: input.tcgplayerProductId,
      productType: input.productType,
      imageUrl: input.imageUrl,
      releaseDate: input.releaseDate,
    })
    .onConflictDoUpdate({
      target: schema.catalogItems.tcgplayerProductId,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        setCode: sql`excluded.set_code`,
        productType: sql`excluded.product_type`,
        imageUrl: sql`COALESCE(${schema.catalogItems.imageUrl}, excluded.image_url)`,
        releaseDate: sql`excluded.release_date`,
      },
    })
    .returning({ id: schema.catalogItems.id });
  return rows[0].id;
}

export async function upsertCard(input: CardUpsertInput): Promise<number> {
  const rows = await db
    .insert(schema.catalogItems)
    .values({
      kind: 'card',
      name: input.name,
      setName: input.setName,
      setCode: input.setCode,
      pokemonTcgCardId: input.pokemonTcgCardId,
      tcgplayerSkuId: input.tcgplayerSkuId,
      cardNumber: input.cardNumber,
      rarity: input.rarity,
      variant: input.variant,
      imageUrl: input.imageUrl,
      releaseDate: input.releaseDate,
    })
    .onConflictDoUpdate({
      target: [schema.catalogItems.setCode, schema.catalogItems.cardNumber, schema.catalogItems.variant],
      targetWhere: sql`kind = 'card'`,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        pokemonTcgCardId: sql`COALESCE(${schema.catalogItems.pokemonTcgCardId}, excluded.pokemon_tcg_card_id)`,
        tcgplayerSkuId: sql`COALESCE(excluded.tcgplayer_sku_id, ${schema.catalogItems.tcgplayerSkuId})`,
        rarity: sql`COALESCE(excluded.rarity, ${schema.catalogItems.rarity})`,
        imageUrl: sql`COALESCE(${schema.catalogItems.imageUrl}, excluded.image_url)`,
        releaseDate: sql`excluded.release_date`,
      },
    })
    .returning({ id: schema.catalogItems.id });
  return rows[0].id;
}
```

- [ ] **Step 2: Add a search service test that mocks the upsert**

Append to `lib/services/search.test.ts`:

```ts
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import groupsFixture from '../../tests/fixtures/tcgcsv-groups.json';
import productsFixture from '../../tests/fixtures/tcgcsv-sv151-products.json';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

const sv151PricesCsv = readFileSync(
  join(__dirname, '..', '..', 'tests', 'fixtures', 'tcgcsv-sv151-prices.csv'),
  'utf8'
);

vi.mock('@/lib/db/upserts/catalogItems', () => ({
  upsertSealed: vi.fn(async (i: { tcgplayerProductId: number }) => i.tcgplayerProductId), // id == productId for tests
  upsertCard: vi.fn(async () => 1),
}));

import { searchSealedWithImport } from './search';
import { __resetGroupCacheForTests } from './tcgcsv';

describe('searchSealedWithImport', () => {
  beforeEach(() => __resetGroupCacheForTests());

  function mockApi() {
    server.use(
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
  }

  it('returns sealed search hits with catalogItemId populated', async () => {
    mockApi();
    const hits = await searchSealedWithImport('151 etb', 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].catalogItemId).toBeDefined();
    expect(hits[0].name).toMatch(/Elite Trainer Box/i);
  });
});
```

- [ ] **Step 3: Run, confirm fail**

```bash
npm test -- lib/services/search
```

Expected: FAIL, `searchSealedWithImport` not exported.

- [ ] **Step 4: Implement**

Append to `lib/services/search.ts`:

```ts
import { searchSealed, type SealedSearchHit } from './tcgcsv';
import { upsertSealed } from '@/lib/db/upserts/catalogItems';

export type SealedResult = SealedSearchHit & { catalogItemId: number };

export async function searchSealedWithImport(query: string, limit: number): Promise<SealedResult[]> {
  const hits = await searchSealed(query, limit);
  const results = await Promise.all(
    hits.map(async (h) => {
      const id = await upsertSealed({
        kind: 'sealed',
        name: h.name,
        setName: h.setName,
        setCode: h.setCode,
        tcgplayerProductId: h.tcgplayerProductId,
        productType: h.productType,
        imageUrl: h.imageUrl,
        releaseDate: h.releaseDate,
      });
      return { ...h, catalogItemId: id };
    })
  );
  return results;
}
```

- [ ] **Step 5: Run, confirm pass**

```bash
npm test -- lib/services/search
```

Expected: 9 tests pass total (8 tokenizer + 1 sealed).

- [ ] **Step 6: Commit**

```bash
git add lib/services/search.ts lib/services/search.test.ts lib/db/upserts
git commit -m "feat(services): add searchSealedWithImport with lazy-import upsert"
```

---

## Task 12: Search service — card search wrapper + merge + lazy-import

This is the most complex task in the plan. Cards come from two upstream sources, must be merged by `(card_number, set_code)`, and each variant becomes its own `catalog_items` row.

For Plan 2, **TCGCSV variants for cards are simplified to a single `normal` variant per card** based on the Pokémon TCG API metadata. We do this because the TCGCSV `subTypeName` field on card prices uses values like `Normal` / `Holofoil` / `Reverse Holofoil`, and the parent spec's variant taxonomy (`alt_art`, `illustration_rare`, etc.) is rarity-driven, not subType-driven. Reconciling them properly is bigger than Plan 2.

The compromise: every card returned from Pokémon TCG API becomes ONE catalog row with `variant = 'normal'`, plus an additional row with `variant = 'reverse_holo'` if TCGCSV has a `Reverse Holofoil` SKU at that productId. Special rarities (illustration rare, hyper rare, etc.) are surfaced via `rarity` on the canonical card; they don't multiply variant rows. This is documented as a known v1 limitation; finer-grained variant handling lands in a future plan.

**Files:**
- Modify: `lib/services/search.ts`, `lib/services/search.test.ts`

- [ ] **Step 1: Add a card search test**

Append to `lib/services/search.test.ts`:

```ts
import charizardFixture from '../../tests/fixtures/pokemontcg-charizard.json';
import { searchCardsWithImport } from './search';

describe('searchCardsWithImport', () => {
  beforeEach(() => __resetGroupCacheForTests());

  function mockApi() {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
  }

  it('returns one row per print with at least a normal variant', async () => {
    mockApi();
    const { results, warnings } = await searchCardsWithImport('charizard 199', 20);
    expect(warnings).toEqual([]);
    expect(results).toHaveLength(2); // sv3pt5-199 and sv3pt5-200
    const r0 = results[0];
    expect(r0.cardNumber).toBe('199');
    expect(r0.setCode).toBe('sv3pt5');
    expect(r0.imageUrl).toContain('199_hires.png');
    expect(r0.variants.length).toBeGreaterThanOrEqual(1);
    expect(r0.variants[0].variant).toBe('normal');
  });

  it('attaches reverse_holo variant when TCGCSV reports a Reverse Holofoil SKU at the same productId', async () => {
    // The fixture has productId 490000 with both Normal and Holofoil rows; we treat Holofoil as reverse_holo proxy in v1.
    mockApi();
    const { results } = await searchCardsWithImport('charizard 199', 20);
    const charizard199 = results.find((r) => r.cardNumber === '199');
    expect(charizard199).toBeDefined();
    const variants = charizard199!.variants.map((v) => v.variant);
    expect(variants).toContain('reverse_holo');
  });

  it('falls back to pokemontcg-only when tcgcsv times out', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => new HttpResponse(null, { status: 503 }))
    );
    const { results, warnings } = await searchCardsWithImport('charizard', 20);
    expect(results.length).toBe(2);
    expect(results[0].variants[0].variant).toBe('normal');
    expect(results[0].variants[0].marketCents).toBeNull();
    expect(warnings.find((w) => w.source === 'tcgcsv')).toBeDefined();
  });

  it('returns empty + warning when both sources fail', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => new HttpResponse(null, { status: 503 })),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => new HttpResponse(null, { status: 503 }))
    );
    const { results, warnings } = await searchCardsWithImport('charizard', 20);
    expect(results).toEqual([]);
    expect(warnings.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/services/search
```

Expected: FAIL, `searchCardsWithImport` not exported.

- [ ] **Step 3: Implement**

Append to `lib/services/search.ts`:

```ts
import { searchCards, type PokemonTcgCard } from './pokemontcg';
import { getGroups } from './tcgcsv';
import type { TcgcsvProduct, TcgcsvPriceRow } from './tcgcsv';
import { upsertCard } from '@/lib/db/upserts/catalogItems';

export type CardVariantResult = {
  catalogItemId: number;
  variant: string;
  marketCents: number | null;
  tcgplayerSkuId: number | null;
};

export type CardResult = {
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string | null;
  variants: CardVariantResult[];
};

export type Warning = { source: 'tcgcsv' | 'pokemontcg'; message: string };

const TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error('upstream timeout')), TIMEOUT_MS)
    ),
  ]);
}

async function findTcgcsvCardPrice(args: {
  setCode: string | null;
  cardNumber: string;
}): Promise<{ normal?: TcgcsvPriceRow; reverseHolo?: TcgcsvPriceRow; productId?: number }> {
  if (!args.setCode) return {};
  const groups = await getGroups();
  const group = groups.find((g) => (g.abbreviation ?? '').toLowerCase() === args.setCode);
  if (!group) return {};
  // Fetch products for this group, find the one whose name contains the card number.
  const productsRes = await fetch(`https://tcgcsv.com/tcgplayer/3/${group.groupId}/products`, {
    headers: { Accept: 'application/json' },
  });
  if (!productsRes.ok) return {};
  const productsBody = (await productsRes.json()) as { results: TcgcsvProduct[] };
  const product = productsBody.results.find((p) => {
    const num = (p.extendedData ?? []).find((d) => d.name === 'Number')?.value;
    return num?.startsWith(`${args.cardNumber}/`);
  });
  if (!product) return {};
  const pricesRes = await fetch(`https://tcgcsv.com/tcgplayer/3/${group.groupId}/prices`, {
    headers: { Accept: 'text/csv' },
  });
  if (!pricesRes.ok) return { productId: product.productId };
  const csv = await pricesRes.text();
  const Papa = (await import('papaparse')).default;
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows = parsed.data
    .filter((r) => Number(r.productId) === product.productId)
    .map((r) => ({
      productId: Number(r.productId),
      marketPrice: r.marketPrice ? Number(r.marketPrice) : null,
      lowPrice: r.lowPrice ? Number(r.lowPrice) : null,
      highPrice: r.highPrice ? Number(r.highPrice) : null,
      subTypeName: r.subTypeName ?? 'Normal',
    } as TcgcsvPriceRow));
  return {
    normal: rows.find((r) => r.subTypeName === 'Normal'),
    reverseHolo: rows.find((r) => /Reverse Holofoil/i.test(r.subTypeName)),
    productId: product.productId,
  };
}

export async function searchCardsWithImport(
  query: string,
  limit: number
): Promise<{ results: CardResult[]; warnings: Warning[] }> {
  const tokens = tokenizeQuery(query);
  const warnings: Warning[] = [];

  let pokemonCards: PokemonTcgCard[] = [];
  try {
    pokemonCards = await withTimeout(
      searchCards({
        text: tokens.text,
        cardNumberPartial: tokens.cardNumberPartial,
        cardNumberFull: tokens.cardNumberFull,
        setCode: tokens.setCode,
        pageSize: 50,
      })
    );
  } catch (e) {
    warnings.push({ source: 'pokemontcg', message: (e as Error).message });
  }

  if (pokemonCards.length === 0 && warnings.find((w) => w.source === 'pokemontcg')) {
    // Try a TCGCSV-only fallback later if we want to. For v1, return empty + warning.
  }

  // Per-print enrichment: try to find a TCGCSV product/price for each.
  const enriched = await Promise.all(
    pokemonCards.slice(0, limit).map(async (card) => {
      let tcgcsvResult: Awaited<ReturnType<typeof findTcgcsvCardPrice>> = {};
      try {
        tcgcsvResult = await withTimeout(
          findTcgcsvCardPrice({ setCode: card.setCode, cardNumber: card.number })
        );
      } catch (e) {
        if (!warnings.find((w) => w.source === 'tcgcsv')) {
          warnings.push({ source: 'tcgcsv', message: (e as Error).message });
        }
      }
      const variants: CardVariantResult[] = [];
      // Normal variant always present (driven by Pokémon TCG API).
      const normalCatalogId = await upsertCard({
        kind: 'card',
        name: card.name,
        setName: card.setName,
        setCode: card.setCode,
        pokemonTcgCardId: card.cardId,
        tcgplayerSkuId: null,
        cardNumber: card.number,
        rarity: card.rarity,
        variant: 'normal',
        imageUrl: card.imageUrl,
        releaseDate: card.releaseDate,
      });
      variants.push({
        catalogItemId: normalCatalogId,
        variant: 'normal',
        marketCents:
          tcgcsvResult.normal?.marketPrice != null
            ? Math.round(tcgcsvResult.normal.marketPrice * 100)
            : null,
        tcgplayerSkuId: null,
      });
      if (tcgcsvResult.reverseHolo) {
        const reverseId = await upsertCard({
          kind: 'card',
          name: card.name,
          setName: card.setName,
          setCode: card.setCode,
          pokemonTcgCardId: card.cardId,
          tcgplayerSkuId: null,
          cardNumber: card.number,
          rarity: card.rarity,
          variant: 'reverse_holo',
          imageUrl: card.imageUrl,
          releaseDate: card.releaseDate,
        });
        variants.push({
          catalogItemId: reverseId,
          variant: 'reverse_holo',
          marketCents:
            tcgcsvResult.reverseHolo.marketPrice != null
              ? Math.round(tcgcsvResult.reverseHolo.marketPrice * 100)
              : null,
          tcgplayerSkuId: null,
        });
      }
      return {
        cardNumber: card.number,
        setName: card.setName,
        setCode: card.setCode,
        rarity: card.rarity,
        imageUrl: card.imageUrl,
        variants,
      } satisfies CardResult;
    })
  );

  return { results: enriched, warnings };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/services/search
```

Expected: all tests pass (some flake risk on the "reverse_holo" test if your fixture's `subTypeName` differs — adjust fixture to use literal `Reverse Holofoil` if needed).

If the reverse_holo test fails because the fixture uses `Holofoil` rather than `Reverse Holofoil`, edit `tests/fixtures/tcgcsv-sv151-prices.csv` to:

```csv
productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName
480000,69.99,79.99,89.99,74.50,72.00,Normal
480001,159.99,179.99,219.99,189.99,175.00,Normal
480002,28.99,32.99,39.99,33.50,31.00,Normal
490000,150.00,170.00,220.00,189.00,165.00,Normal
490000,950.00,1050.00,1200.00,1100.00,1000.00,Reverse Holofoil
```

- [ ] **Step 5: Commit**

```bash
git add lib/services/search.ts lib/services/search.test.ts tests/fixtures/tcgcsv-sv151-prices.csv
git commit -m "feat(services): add card search with TCGCSV/PokemonTCG merge + lazy-import"
```

---

## Task 13: Search service — `searchAll` interleave for `kind=all`

**Files:**
- Modify: `lib/services/search.ts`, `lib/services/search.test.ts`

- [ ] **Step 1: Add a small test**

Append to `lib/services/search.test.ts`:

```ts
import { searchAll } from './search';

describe('searchAll', () => {
  it('returns interleaved sealed + card results', async () => {
    server.use(
      http.get('https://api.pokemontcg.io/v2/cards', () => HttpResponse.json(charizardFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/groups', () => HttpResponse.json(groupsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/products', () => HttpResponse.json(productsFixture)),
      http.get('https://tcgcsv.com/tcgplayer/3/23237/prices', () =>
        new HttpResponse(sv151PricesCsv, { headers: { 'Content-Type': 'text/csv' } })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/products', () =>
        HttpResponse.json({ totalItems: 0, success: true, errors: [], results: [] })
      ),
      http.get('https://tcgcsv.com/tcgplayer/3/:groupId/prices', () =>
        new HttpResponse('productId,lowPrice,midPrice,highPrice,marketPrice,directLowPrice,subTypeName\n', {
          headers: { 'Content-Type': 'text/csv' },
        })
      )
    );
    const { results, warnings } = await searchAll('charizard 199', 'all', 20);
    const types = new Set(results.map((r) => r.type));
    expect(types.has('card')).toBe(true);
    // Sealed may or may not show up given the sealed scoring; query has 'charizard'+199 so sealed should not match by name.
    expect(warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/services/search
```

Expected: FAIL, `searchAll` not exported.

- [ ] **Step 3: Implement**

Append to `lib/services/search.ts`:

```ts
export type SearchKind = 'all' | 'sealed' | 'card';

export type SealedResultDto = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  imageUrl: string | null;
  marketCents: number | null;
};

export type CardResultDto = { type: 'card' } & CardResult;

export type SearchResponse = {
  query: string;
  kind: SearchKind;
  results: Array<SealedResultDto | CardResultDto>;
  warnings: Warning[];
};

export async function searchAll(query: string, kind: SearchKind, limit: number): Promise<SearchResponse> {
  const warnings: Warning[] = [];
  const tasks: Array<Promise<unknown>> = [];

  let sealed: SealedResult[] = [];
  let cards: { results: CardResult[]; warnings: Warning[] } = { results: [], warnings: [] };

  if (kind === 'sealed' || kind === 'all') {
    tasks.push(
      searchSealedWithImport(query, limit)
        .then((r) => {
          sealed = r;
        })
        .catch((e: Error) => {
          warnings.push({ source: 'tcgcsv', message: e.message });
        })
    );
  }
  if (kind === 'card' || kind === 'all') {
    tasks.push(
      searchCardsWithImport(query, limit)
        .then((r) => {
          cards = r;
          warnings.push(...r.warnings);
        })
        .catch((e: Error) => {
          warnings.push({ source: 'pokemontcg', message: e.message });
        })
    );
  }

  await Promise.all(tasks);

  const sealedDtos: SealedResultDto[] = sealed.map((s) => ({
    type: 'sealed',
    catalogItemId: s.catalogItemId,
    name: s.name,
    setName: s.setName,
    setCode: s.setCode,
    productType: s.productType,
    imageUrl: s.imageUrl,
    marketCents: s.marketCents,
  }));
  const cardDtos: CardResultDto[] = cards.results.map((c) => ({ type: 'card' as const, ...c }));

  // Simple interleave: alternate sealed/card up to limit.
  const interleaved: Array<SealedResultDto | CardResultDto> = [];
  let i = 0;
  while (interleaved.length < limit && (i < sealedDtos.length || i < cardDtos.length)) {
    if (i < sealedDtos.length) interleaved.push(sealedDtos[i]);
    if (interleaved.length < limit && i < cardDtos.length) interleaved.push(cardDtos[i]);
    i++;
  }

  return { query, kind, results: interleaved, warnings };
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/services/search
```

Expected: all search tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/services/search.ts lib/services/search.test.ts
git commit -m "feat(services): add searchAll interleave for kind=all"
```

---

## Task 14: Image download service (`lib/services/images.ts`)

`downloadIfMissing(catalogItemId)`: idempotent, fire-and-forget, sharp re-encodes to WebP, uploads to Supabase Storage.

**Files:**
- Create: `lib/services/images.ts`, `lib/services/images.test.ts`
- Create: `tests/fixtures/sample-card.png`
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create the service-role Supabase client**

Create `lib/supabase/admin.ts`:

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service-role env vars missing');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Add a small fixture image**

Create a 200x280 PNG at `tests/fixtures/sample-card.png`. You can use any small Pokémon card image. To generate a placeholder one quickly, use sharp via Node:

```bash
node -e "require('sharp')({create:{width:200,height:280,channels:3,background:'#1e293b'}}).png().toFile('tests/fixtures/sample-card.png').then(()=>console.log('ok'))"
```

- [ ] **Step 3: Write tests**

Create `lib/services/images.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../tests/msw/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { __resetInflightForTests, downloadIfMissing } from './images';

const samplePng = readFileSync(join(__dirname, '..', '..', 'tests', 'fixtures', 'sample-card.png'));

const dbCalls: Array<{ kind: string; payload: unknown }> = [];
vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      catalogItems: {
        findFirst: vi.fn(async ({ where }: { where: unknown }) => {
          dbCalls.push({ kind: 'find', payload: where });
          return { id: 42, imageUrl: 'https://images.pokemontcg.io/sv3pt5/199_hires.png', imageStoragePath: null };
        }),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => {
          dbCalls.push({ kind: 'update', payload: 'set image_storage_path' });
          return [];
        }),
      })),
    })),
  },
  schema: {
    catalogItems: { id: 'id', imageStoragePath: 'imageStoragePath' },
  },
}));

const uploads: Array<{ path: string; size: number }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: vi.fn(async (path: string, body: ArrayBuffer | Uint8Array) => {
          uploads.push({ path, size: body.byteLength });
          return { data: { path }, error: null };
        }),
      }),
    },
  }),
}));

describe('images.downloadIfMissing', () => {
  beforeEach(() => {
    __resetInflightForTests();
    dbCalls.length = 0;
    uploads.length = 0;
  });

  it('downloads upstream, re-encodes to webp, uploads, updates db', async () => {
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () =>
        HttpResponse.arrayBuffer(samplePng, { headers: { 'Content-Type': 'image/png' } })
      )
    );
    await downloadIfMissing(42);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toBe('catalog/42.webp');
    expect(uploads[0].size).toBeGreaterThan(0);
    expect(uploads[0].size).toBeLessThan(samplePng.byteLength); // webp at q85 should be smaller for a flat color
  });

  it('shares a single in-flight promise for concurrent calls', async () => {
    let upstreamHits = 0;
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () => {
        upstreamHits++;
        return HttpResponse.arrayBuffer(samplePng, { headers: { 'Content-Type': 'image/png' } });
      })
    );
    await Promise.all([downloadIfMissing(42), downloadIfMissing(42), downloadIfMissing(42)]);
    expect(upstreamHits).toBe(1);
    expect(uploads).toHaveLength(1);
  });

  it('does not throw when upstream fetch fails', async () => {
    server.use(
      http.get('https://images.pokemontcg.io/sv3pt5/199_hires.png', () => new HttpResponse(null, { status: 500 }))
    );
    await expect(downloadIfMissing(42)).resolves.toBeUndefined();
    expect(uploads).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run, confirm fail**

```bash
npm test -- lib/services/images
```

Expected: FAIL, module not found.

- [ ] **Step 5: Implement**

Create `lib/services/images.ts`:

```ts
import 'server-only';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { createAdminClient } from '@/lib/supabase/admin';

const inflight = new Map<number, Promise<void>>();

export function __resetInflightForTests() {
  inflight.clear();
}

export async function downloadIfMissing(catalogItemId: number): Promise<void> {
  const existing = inflight.get(catalogItemId);
  if (existing) return existing;
  const p = doDownload(catalogItemId).finally(() => inflight.delete(catalogItemId));
  inflight.set(catalogItemId, p);
  return p;
}

async function doDownload(catalogItemId: number): Promise<void> {
  try {
    const row = await db.query.catalogItems.findFirst({
      where: eq(schema.catalogItems.id, catalogItemId),
    });
    if (!row) return;
    if (row.imageStoragePath) return;
    if (!row.imageUrl) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(row.imageUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;

    const upstream = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(upstream).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();

    const supabase = createAdminClient();
    const path = `catalog/${catalogItemId}.webp`;
    const { error } = await supabase.storage.from('catalog').upload(path, webp, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) {
      console.error('[images.downloadIfMissing] upload failed', { catalogItemId, error });
      return;
    }

    await db
      .update(schema.catalogItems)
      .set({ imageStoragePath: path })
      .where(eq(schema.catalogItems.id, catalogItemId));
  } catch (err) {
    console.error('[images.downloadIfMissing] failed', { catalogItemId, err });
  }
}
```

- [ ] **Step 6: Run, confirm pass**

```bash
npm test -- lib/services/images
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/services/images.ts lib/services/images.test.ts lib/supabase/admin.ts tests/fixtures/sample-card.png
git commit -m "feat(services): add images.downloadIfMissing with sharp + supabase storage upload"
```

---

## Task 15: `GET /api/search` route

**Files:**
- Create: `app/api/search/route.ts`

- [ ] **Step 1: Implement**

Create `app/api/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll } from '@/lib/services/search';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit } = parsed.data;
  const result = await searchAll(q.trim(), kind, limit);
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  });
}
```

- [ ] **Step 2: Smoke test by hand**

Run dev server:

```bash
npm run dev
```

In another terminal:

```bash
curl -s "http://localhost:3000/api/search?q=151+ETB&kind=sealed&limit=5" | head -c 500
```

Expected: a JSON object with `results` containing at least one sealed item whose name matches "Elite Trainer Box". If you get a 401/redirect, check that you're signed in as the middleware gates `/api/*` routes — if so, you'll need to either sign in via the browser first and reuse cookies, or add `/api/search` to the public-paths matcher temporarily for testing. For Plan 2, leave the matcher alone; verify via the UI in Task 18 instead.

- [ ] **Step 3: Stop dev server**

`Ctrl+C`.

- [ ] **Step 4: Commit**

```bash
git add app/api/search
git commit -m "feat(api): add GET /api/search with zod-validated params"
```

---

## Task 16: `GET /api/catalog/[id]` route

Returns a single catalog item with the latest market price (fetched on demand if stale), and triggers an async image download.

**Files:**
- Create: `app/api/catalog/[id]/route.ts`
- Create: `lib/services/prices.ts`

- [ ] **Step 1: Create a tiny prices service for on-demand snapshot**

Create `lib/services/prices.ts`:

```ts
import 'server-only';
import { db, schema } from '@/lib/db/client';
import { and, desc, eq, gte } from 'drizzle-orm';
import { fetchSinglePrice, getGroups } from './tcgcsv';

const FRESH_WINDOW_HOURS = 24;
const STALE_THRESHOLD_DAYS = 7;

export type LatestPrice = {
  marketCents: number | null;
  snapshotDate: string;
  source: 'tcgcsv';
  isStale: boolean;
};

export async function getOrRefreshLatestPrice(item: {
  id: number;
  kind: string;
  setCode: string | null;
  cardNumber: string | null;
  tcgplayerProductId: number | null;
}): Promise<LatestPrice | null> {
  const cutoff = new Date(Date.now() - FRESH_WINDOW_HOURS * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const fresh = await db.query.marketPrices.findFirst({
    where: and(eq(schema.marketPrices.catalogItemId, item.id), gte(schema.marketPrices.snapshotDate, cutoff)),
    orderBy: [desc(schema.marketPrices.snapshotDate)],
  });
  if (fresh) {
    return {
      marketCents: fresh.marketPriceCents,
      snapshotDate: fresh.snapshotDate,
      source: 'tcgcsv',
      isStale: ageDays(fresh.snapshotDate) > STALE_THRESHOLD_DAYS,
    };
  }

  // Refresh: only sealed (productId-keyed) on-demand for v1; cards depend on group lookup which is heavier.
  if (item.kind !== 'sealed' || !item.tcgplayerProductId) {
    const last = await db.query.marketPrices.findFirst({
      where: eq(schema.marketPrices.catalogItemId, item.id),
      orderBy: [desc(schema.marketPrices.snapshotDate)],
    });
    return last
      ? {
          marketCents: last.marketPriceCents,
          snapshotDate: last.snapshotDate,
          source: 'tcgcsv',
          isStale: ageDays(last.snapshotDate) > STALE_THRESHOLD_DAYS,
        }
      : null;
  }

  // Sealed on-demand.
  const groups = await getGroups();
  const group = item.setCode
    ? groups.find((g) => (g.abbreviation ?? '').toLowerCase() === item.setCode)
    : null;
  if (!group) return null;
  try {
    const price = await fetchSinglePrice({ groupId: group.groupId, productId: item.tcgplayerProductId });
    if (!price) return null;
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.marketPrices)
      .values({
        catalogItemId: item.id,
        snapshotDate: today,
        condition: null,
        marketPriceCents: price.marketCents,
        lowPriceCents: price.lowCents,
        highPriceCents: price.highCents,
        source: 'tcgcsv',
      })
      .onConflictDoNothing();
    return { marketCents: price.marketCents, snapshotDate: today, source: 'tcgcsv', isStale: false };
  } catch (err) {
    console.error('[prices.getOrRefresh] failed', err);
    return null;
  }
}

function ageDays(snapshotDate: string): number {
  const ms = Date.now() - Date.parse(`${snapshotDate}T00:00:00Z`);
  return ms / (24 * 60 * 60 * 1000);
}
```

- [ ] **Step 2: Implement the route**

Create `app/api/catalog/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { getOrRefreshLatestPrice } from '@/lib/services/prices';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // Fire-and-forget image download.
  if (!item.imageStoragePath) {
    void downloadIfMissing(item.id);
  }

  const latestPrice = await getOrRefreshLatestPrice({
    id: item.id,
    kind: item.kind,
    setCode: item.setCode,
    cardNumber: item.cardNumber,
    tcgplayerProductId: item.tcgplayerProductId ?? null,
  });

  return NextResponse.json({
    id: item.id,
    kind: item.kind as 'sealed' | 'card',
    name: item.name,
    setName: item.setName,
    setCode: item.setCode,
    productType: item.productType,
    cardNumber: item.cardNumber,
    rarity: item.rarity,
    variant: item.variant,
    imageUrl: getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl }),
    msrpCents: item.msrpCents,
    latestPrice,
  });
}
```

- [ ] **Step 3: Type-check compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/catalog lib/services/prices.ts
git commit -m "feat(api): add GET /api/catalog/[id] with on-demand price refresh"
```

---

## Task 17: SearchBox + SearchResultRow components

**Files:**
- Create: `components/catalog/SearchBox.tsx`, `components/catalog/SearchResultRow.tsx`, `components/catalog/PriceLabel.tsx`
- Modify: `components/ui` (add `input` if not present)

- [ ] **Step 1: Add the shadcn Input**

```bash
npx shadcn@latest add input
```

If prompted, accept overwrite. Confirm `components/ui/input.tsx` now exists.

- [ ] **Step 2: Create PriceLabel**

Create `components/catalog/PriceLabel.tsx`:

```tsx
function formatCents(cents: number | null): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PriceLabel({ cents, className }: { cents: number | null; className?: string }) {
  return <span className={className}>{formatCents(cents)}</span>;
}
```

- [ ] **Step 3: Create SearchResultRow**

Create `components/catalog/SearchResultRow.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { PriceLabel } from './PriceLabel';

type SealedResult = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  productType: string | null;
  imageUrl: string | null;
  marketCents: number | null;
};

type CardResult = {
  type: 'card';
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  imageUrl: string | null;
  variants: Array<{
    catalogItemId: number;
    variant: string;
    marketCents: number | null;
  }>;
};

export type ResultRow = SealedResult | CardResult;

const VARIANT_LABEL: Record<string, string> = {
  normal: 'Normal',
  reverse_holo: 'Reverse Holo',
  holo: 'Holo',
  illustration_rare: 'Illustration Rare',
  special_illustration_rare: 'Special Illustration Rare',
  alt_art: 'Alt Art',
  hyper_rare: 'Hyper Rare',
};

function variantLabel(v: string): string {
  return VARIANT_LABEL[v] ?? v;
}

export function SearchResultRow({ row }: { row: ResultRow }) {
  if (row.type === 'sealed') {
    return (
      <Link
        href={`/catalog/${row.catalogItemId}`}
        className="flex items-center gap-4 rounded-lg border p-3 hover:bg-muted/50"
      >
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.setName ?? '—'} · {row.productType ?? 'Sealed'}
          </div>
        </div>
        <PriceLabel cents={row.marketCents} className="text-sm font-medium" />
      </Link>
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-4">
        <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
          {row.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="size-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {row.cardNumber} {row.rarity ? `· ${row.rarity}` : ''}
          </div>
          <div className="text-xs text-muted-foreground">{row.setName ?? '—'}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.variants.map((v) => (
          <Link
            key={v.catalogItemId}
            href={`/catalog/${v.catalogItemId}`}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted/50"
          >
            <span>{variantLabel(v.variant)}</span>
            <span className="text-muted-foreground">
              <PriceLabel cents={v.marketCents} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create SearchBox**

Create `components/catalog/SearchBox.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultRow, type ResultRow } from './SearchResultRow';

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  results: ResultRow[];
  warnings: Array<{ source: string; message: string }>;
};

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

export function SearchBox() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'all' | 'sealed' | 'card'>('all');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const enabled = debounced.length > 0;
  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ['search', debounced, kind],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(debounced)}&kind=${kind}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-4">
      <Input
        autoFocus
        placeholder="Search Pokemon products and cards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={`rounded-full border px-3 py-1 text-sm ${
              kind === k.key ? 'bg-foreground text-background' : 'hover:bg-muted/50'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          Try &ldquo;151 ETB&rdquo; or &ldquo;charizard 199&rdquo;.
        </p>
      )}

      {enabled && isFetching && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Couldn&rsquo;t reach pricing source. Try again.
        </p>
      )}

      {data && data.warnings.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Some sources are slow: {data.warnings.map((w) => w.source).join(', ')}.
        </p>
      )}

      {data && data.results.length === 0 && enabled && !isFetching && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      {data && data.results.length > 0 && (
        <div className="space-y-2">
          {data.results.map((row, i) => (
            <SearchResultRow key={i} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/catalog components/ui/input.tsx
git commit -m "feat(ui): add SearchBox, SearchResultRow, PriceLabel components"
```

---

## Task 18: `/catalog` page

**Files:**
- Create: `app/(authenticated)/catalog/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(authenticated)/catalog/page.tsx`:

```tsx
import { SearchBox } from '@/components/catalog/SearchBox';

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Search Pokemon sealed product and singles.
        </p>
      </div>
      <SearchBox />
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

```bash
npm run dev
```

Sign in if needed, visit `http://localhost:3000/catalog`. Expected:
- Search input is focused.
- Tip text is visible.
- Type "151 ETB", wait 300ms, see at least one sealed result with thumbnail.
- Click `[Sealed]` chip — same query re-runs, only sealed results.
- Type "charizard 199" — see grouped card row(s) with variant chips.

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add app/\(authenticated\)/catalog
git commit -m "feat(ui): add /catalog search-and-pick page"
```

---

## Task 19: `/catalog/[id]` preview page

**Files:**
- Create: `app/(authenticated)/catalog/[id]/page.tsx`

- [ ] **Step 1: Implement**

Create `app/(authenticated)/catalog/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { getImageUrl } from '@/lib/utils/images';
import { downloadIfMissing } from '@/lib/services/images';
import { getOrRefreshLatestPrice } from '@/lib/services/prices';
import { buttonVariants } from '@/components/ui/button';
import { PriceLabel } from '@/components/catalog/PriceLabel';

const VARIANT_LABEL: Record<string, string> = {
  normal: 'Normal',
  reverse_holo: 'Reverse Holo',
  holo: 'Holo',
  illustration_rare: 'Illustration Rare',
  special_illustration_rare: 'Special Illustration Rare',
};

export default async function CatalogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, numericId),
  });
  if (!item) notFound();

  if (!item.imageStoragePath) {
    void downloadIfMissing(item.id);
  }

  const latestPrice = await getOrRefreshLatestPrice({
    id: item.id,
    kind: item.kind,
    setCode: item.setCode,
    cardNumber: item.cardNumber,
    tcgplayerProductId: item.tcgplayerProductId ?? null,
  });

  const imageUrl = getImageUrl({ imageStoragePath: item.imageStoragePath, imageUrl: item.imageUrl });
  const subtitle = item.kind === 'sealed' ? item.productType : VARIANT_LABEL[item.variant ?? 'normal'] ?? item.variant;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <Link href="/catalog" className="text-sm text-muted-foreground hover:underline">
        Back to catalog
      </Link>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={item.name} className="size-full object-cover" />
        </div>

        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{item.name}</h1>
            <p className="text-sm text-muted-foreground">{subtitle ?? '—'}</p>
            <p className="text-sm text-muted-foreground">{item.setName ?? '—'}</p>
            {item.cardNumber && <p className="text-sm text-muted-foreground">#{item.cardNumber}</p>}
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Latest market price</p>
            <p className="text-2xl font-semibold">
              <PriceLabel cents={latestPrice?.marketCents ?? null} />
            </p>
            {latestPrice && (
              <p className="text-xs text-muted-foreground">
                as of {latestPrice.snapshotDate}
                {latestPrice.isStale && ' · Stale'}
              </p>
            )}
          </div>

          <Link
            href={`/purchases/new?catalogItemId=${item.id}`}
            className={buttonVariants({ variant: 'default' })}
          >
            Log purchase
          </Link>
        </div>
      </div>
    </div>
  );
}
```

Per the stack-gotchas memory, shadcn 4.x dropped `asChild`. The `buttonVariants` helper is the styled-Link pattern this project uses.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Sign in, go to `/catalog`, search "151 ETB", click a result. Expected:
- Lands on `/catalog/{id}` showing the upstream image, name, set, and a market price.
- Refresh after ~5 seconds. Image should now load from Supabase Storage (look at the `<img src>` in DevTools — it should start with your Supabase project URL).
- Click "Log purchase". Lands on `/purchases/new?catalogItemId=...` (Plan 1 stub, "Coming in Plan 3" message is fine).

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add app/\(authenticated\)/catalog/\[id\]
git commit -m "feat(ui): add /catalog/[id] preview page with image + latest price"
```

---

## Task 20: Repoint `+ Add` nav buttons to `/catalog`

**Files:**
- Modify: `components/nav/TopNav.tsx`, `components/nav/BottomTabBar.tsx`

- [ ] **Step 1: Replace TopNav**

Open `components/nav/TopNav.tsx`. Replace its contents with:

```tsx
import Link from 'next/link';
import { SignOutButton } from '@/components/auth/SignOutButton';

export function TopNav() {
  return (
    <header className="hidden md:flex sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">
          Pokestonks
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-muted">Dashboard</Link>
          <Link href="/holdings" className="px-3 py-1.5 rounded-md hover:bg-muted">Holdings</Link>
          <Link href="/sales" className="px-3 py-1.5 rounded-md hover:bg-muted">Sales</Link>
          <Link href="/settings" className="px-3 py-1.5 rounded-md hover:bg-muted">Settings</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/catalog"
            className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:bg-foreground/90"
          >
            + Add
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Modify BottomTabBar**

Open `components/nav/BottomTabBar.tsx`. Find the `tabs` array; change the `Add` tab's `href`:

```tsx
const tabs = [
  { href: '/', label: 'Dashboard' },
  { href: '/holdings', label: 'Holdings' },
  { href: '/catalog', label: 'Add' },
  { href: '/sales', label: 'Sales' },
  { href: '/settings', label: 'Settings' },
];
```

- [ ] **Step 3: Manual check**

```bash
npm run dev
```

Sign in. Confirm:
- Desktop top nav has `+ Add` linking to `/catalog`.
- Resize narrow: bottom tab bar's `Add` tab links to `/catalog`.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add components/nav
git commit -m "feat(nav): repoint + Add buttons from /purchases/new to /catalog"
```

---

## Task 21: Final acceptance verification

No new files. Walk through the acceptance checklist end-to-end against a real Supabase database, then commit a tag-style empty commit.

- [ ] **Step 1: Full test suite**

```bash
npm test
```

Expected: all unit tests pass (search, tcgcsv, pokemontcg, images, getImageUrl, middleware from Plan 1).

- [ ] **Step 2: Type-check + production build**

```bash
npx tsc --noEmit
npx next build
```

Expected: both clean. Build emits no warnings about missing env vars beyond the known Supabase ones.

- [ ] **Step 3: Manual acceptance against the live DB**

```bash
npm run dev
```

Walk through this checklist; check off each item only when verified:

- [ ] `/catalog` page renders, search box focused.
- [ ] Typing "151 ETB" returns at least one sealed result with thumbnail and "Scarlet & Violet 151" set name.
- [ ] Typing "charizard ex 199" returns at least one card result grouped with variant chip(s).
- [ ] Clicking the `[Sealed]` chip filters to sealed-only.
- [ ] Picking a sealed result navigates to `/catalog/[id]` showing image, name, set, latest price, "Log purchase" button.
- [ ] Picking a card variant chip navigates to `/catalog/[id]` for *that variant's* row.
- [ ] After refreshing `/catalog/[id]` once, `image_storage_path` is populated in the DB (check via Drizzle Studio or Supabase Table Editor) and the rendered image URL points at Supabase Storage (`/storage/v1/object/public/...`).
- [ ] Clicking "Log purchase" navigates to `/purchases/new?catalogItemId=...` (Plan 1 stub).
- [ ] Top nav `+ Add` and bottom tab bar `Add` both go to `/catalog`.
- [ ] No console errors. No Supabase RLS errors in network tab.

- [ ] **Step 4: Push to GitHub + verify Vercel deploy**

```bash
git push
```

Wait for Vercel build. Visit the production URL, sign in, walk through the acceptance checklist again against production data. The first search will be slower (cold start + first group fetch). Subsequent searches should be snappy.

- [ ] **Step 5: Empty marker commit**

```bash
git commit --allow-empty -m "chore: plan 2 (catalog + search + images) complete"
git push
```

---

## Done — Plan 2 Acceptance

When all of the above are checked, the following is true:

- [ ] Both upstream clients (`tcgcsv.ts`, `pokemontcg.ts`) are tested and live.
- [ ] Search returns correct grouped results with prices for known queries.
- [ ] Picking a result creates a catalog row, downloads the image to Supabase Storage on first view, and fetches a price snapshot.
- [ ] The whole flow is reachable from the nav without dropping into the DB.
- [ ] `npm test` passes; `npx next build` succeeds; `/catalog` and `/catalog/[id]` work in production.

When all the above are true, we move on to **Plan 3 — Purchases**.

---

## Self-Review Notes

**Spec coverage:**
- §1 Goal — Task 18 + 19 + 21 deliver it.
- §3.1 New surfaces — every file listed exists in some task.
- §4 Tokenizer — Task 10.
- §5 Sealed search — Tasks 6, 7, 11.
- §6 Card search + merge — Tasks 9, 12.
- §7 `kind=all` — Task 13.
- §8 Image pipeline — Task 14.
- §9 UI — Tasks 17, 18, 19.
- §10 API contracts — Tasks 15, 16.
- §11 Edge cases — covered by tests and route logic in Tasks 12, 14, 15, 16.
- §12 Tests — present in Tasks 4, 6, 7, 8, 9, 10, 11, 12, 13, 14.
- §14 Migrations — Task 3 (card unique index), Manual Prerequisites (storage bucket).

**Placeholder scan:** No "TBD" / "TODO" / "implement later". Each step has full code or a full command. The `<Button asChild>` warning in Task 19 is an explicit either/or (with full alternative code), not a placeholder.

**Type consistency:**
- `searchSealedWithImport` returns `SealedResult[]`; `searchAll` consumes via `sealed`. Match.
- `searchCardsWithImport` returns `{ results: CardResult[]; warnings: Warning[] }`; `searchAll` reads `r.results`. Match.
- `upsertSealed` / `upsertCard` are imported in search.ts via `@/lib/db/upserts/catalogItems`. Path matches Task 11.
- `downloadIfMissing(id: number)` consumed unchanged in Task 16 (`/api/catalog/[id]`) and Task 19 (`/catalog/[id]/page.tsx`). Match.
- `getImageUrl` signature stable across Tasks 4, 16, 19.

**Manual steps clearly labeled:** Manual Prerequisites and Task 21 Step 3 are the human-eyes verifications. Task 7 Step 4 includes a known-edge-case fixture-edit instruction (Reverse Holofoil literal).

**Known v1 limitations documented:**
- Card variants in Plan 2 are limited to `normal` plus optional `reverse_holo` — fuller variant taxonomy deferred (called out in Task 12 preamble).
- On-demand price refresh works for sealed only; cards rely on whatever snapshot exists or `null` (called out in `lib/services/prices.ts`).
- Daily refresh cron is Plan 6.
- Manual catalog entry is Plan 6.
