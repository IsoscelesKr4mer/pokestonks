# Pokestonks DB-First Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subsequent searches of any query that's been run before return instantly from `catalog_items` instead of re-fetching upstream. A new Refresh button forces an upstream fetch on demand. Closes the "lazy hybrid" promise from Plan 2.

**Architecture:** Add `last_market_cents` + `last_market_at` columns to `catalog_items`. New `searchLocalCatalog` reads those rows via Postgres ILIKE on name/setName/cardNumber. `/api/search` dispatches local-first with upstream fallback only on zero matches. New `/api/search/refresh` endpoint always runs upstream. Frontend gets a Refresh button and an "Updated" relative-time caption.

**Tech Stack:** Drizzle ORM, Supabase Postgres, Next.js App Router, TanStack Query, Vitest.

**Spec reference:** `docs/superpowers/specs/2026-04-26-pokestonks-db-first-search-design.md`. Sections referenced inline.

---

## File Structure

After this plan completes:

```
lib/
├── db/
│   ├── schema/catalogItems.ts           # MODIFIED: add lastMarketCents, lastMarketAt fields
│   └── upserts/catalogItems.ts          # MODIFIED: write the new columns; types add lastMarketCents; UpsertResult adds lastMarketAt
├── services/
│   ├── search.ts                         # MODIFIED: export applySort; pass marketCents into upsert input; DTO carries lastMarketAt
│   ├── search.test.ts                    # MODIFIED: updated upsert mock to return lastMarketAt
│   ├── searchLocal.ts                    # CREATED: searchLocalCatalog
│   └── searchLocal.test.ts               # CREATED: predicate + query tests
└── utils/
    ├── time.ts                           # CREATED: formatRelativeTime helper
    └── time.test.ts                      # CREATED

app/api/
├── search/route.ts                       # MODIFIED: local-first dispatch
└── search/refresh/route.ts               # CREATED: POST refresh endpoint

components/catalog/
├── SearchBox.tsx                         # MODIFIED: integrate Refresh + "Updated" caption
└── RefreshButton.tsx                     # CREATED

drizzle/
└── 0003_*.sql                            # GENERATED: migration adding the two columns
```

**Boundaries enforced:**

- `searchLocal.ts` — read-only against `catalog_items`. No upstream fetches, no upserts.
- `search.ts` — upstream-only path. Stays as-is besides the upsert plumbing for the new columns.
- The route file orchestrates local-first dispatch. Services don't know about each other.

---

## Task 1: Add `last_market_cents` and `last_market_at` to `catalog_items`

**Files:**
- Modify: `lib/db/schema/catalogItems.ts`
- Generate: `drizzle/0003_*.sql`

- [ ] **Step 1: Update the Drizzle schema**

Open `lib/db/schema/catalogItems.ts`. Add two new fields next to the existing ones (keep all current fields and indexes intact):

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
    // New for DB-first search: latest TCGCSV/Pokémon TCG market price written
    // by the upstream-import path so local search can read it without a join.
    lastMarketCents: integer('last_market_cents'),
    lastMarketAt: timestamp('last_market_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    kindSetCodeIdx: index('catalog_items_kind_set_code_idx').on(t.kind, t.setCode),
    nameSearchIdx: index('catalog_items_name_search_idx').using('gin', sql`to_tsvector('english', ${t.name})`),
    cardNumberIdx: index('catalog_items_card_number_idx').on(t.cardNumber).where(sql`${t.kind} = 'card'`),
    // NULLS NOT DISTINCT applied via migration 0002; drizzle-orm 0.45 can't express it on partial indexes
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

Expected: a new file `drizzle/0003_*.sql` is created containing exactly two `ALTER TABLE` statements:

```sql
ALTER TABLE "catalog_items" ADD COLUMN "last_market_cents" integer;
ALTER TABLE "catalog_items" ADD COLUMN "last_market_at" timestamp with time zone;
```

Open it and confirm. If the diff shows other changes (drops, alters of existing columns), abort and reconcile schema with the live DB before continuing.

- [ ] **Step 3: Apply the migration**

```bash
npm run db:migrate
```

Expected: applies `0003_*.sql` against Supabase. No prompts, no errors.

- [ ] **Step 4: Verify both columns exist**

```bash
cat > /tmp/check-cols.ts << 'EOF'
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL_DIRECT!);
const r = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'catalog_items'
    AND column_name IN ('last_market_cents', 'last_market_at')
  ORDER BY column_name`;
console.log(r);
await sql.end();
EOF
npx tsx /tmp/check-cols.ts
```

Expected output: two rows — `last_market_at | timestamp with time zone` and `last_market_cents | integer`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema/catalogItems.ts drizzle
git commit -m "feat(db): add last_market_cents and last_market_at to catalog_items"
```

---

## Task 2: Wire upsert helpers to write the new columns

**Files:**
- Modify: `lib/db/upserts/catalogItems.ts`

- [ ] **Step 1: Update input types and result type**

Open `lib/db/upserts/catalogItems.ts`. Change the type definitions (keep file structure, only modify the types and the upsertSealed/bulkUpsertCards bodies):

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
  // Latest market price (cents) for this product. Written to catalog_items
  // so the DB-first search can read it without a join with market_prices.
  lastMarketCents: number | null;
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
  lastMarketCents: number | null;
};

export type UpsertResult = {
  id: number;
  imageStoragePath: string | null;
  lastMarketAt: Date | null;
};
```

- [ ] **Step 2: Update upsertSealed**

Replace the existing `upsertSealed` with:

```ts
export async function upsertSealed(input: SealedUpsertInput): Promise<UpsertResult> {
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
      lastMarketCents: input.lastMarketCents,
      lastMarketAt: sql`NOW()`,
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
        lastMarketCents: sql`excluded.last_market_cents`,
        lastMarketAt: sql`NOW()`,
      },
    })
    .returning({
      id: schema.catalogItems.id,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketAt: schema.catalogItems.lastMarketAt,
    });
  return rows[0];
}
```

- [ ] **Step 3: Update upsertCard and bulkUpsertCards**

Replace `upsertCard` and `bulkUpsertCards` with:

```ts
export async function upsertCard(input: CardUpsertInput): Promise<UpsertResult> {
  const rows = await bulkUpsertCards([input]);
  return rows[0];
}

export async function bulkUpsertCards(inputs: CardUpsertInput[]): Promise<UpsertResult[]> {
  if (inputs.length === 0) return [];
  const values = inputs.map((input) => ({
    kind: 'card' as const,
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
    lastMarketCents: input.lastMarketCents,
    lastMarketAt: sql`NOW()`,
  }));
  const rows = await db
    .insert(schema.catalogItems)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.catalogItems.setCode, schema.catalogItems.cardNumber, schema.catalogItems.variant],
      targetWhere: sql`kind = 'card'`,
      set: {
        name: sql`excluded.name`,
        setName: sql`excluded.set_name`,
        pokemonTcgCardId: sql`COALESCE(${schema.catalogItems.pokemonTcgCardId}, excluded.pokemon_tcg_card_id)`,
        // prefer incoming: SKU IDs can rotate; imageUrl is preserved once downloaded
        tcgplayerSkuId: sql`COALESCE(excluded.tcgplayer_sku_id, ${schema.catalogItems.tcgplayerSkuId})`,
        rarity: sql`COALESCE(excluded.rarity, ${schema.catalogItems.rarity})`,
        imageUrl: sql`COALESCE(${schema.catalogItems.imageUrl}, excluded.image_url)`,
        releaseDate: sql`excluded.release_date`,
        lastMarketCents: sql`excluded.last_market_cents`,
        lastMarketAt: sql`NOW()`,
      },
    })
    .returning({
      id: schema.catalogItems.id,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketAt: schema.catalogItems.lastMarketAt,
    });
  return rows;
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors will appear in `lib/services/search.ts` and `lib/services/search.test.ts` (callers of these upserts). Those are fixed in the next task. Confirm the errors are confined to those files.

- [ ] **Step 5: Commit**

```bash
git add lib/db/upserts/catalogItems.ts
git commit -m "feat(db): upsert helpers write last_market_cents and last_market_at"
```

---

## Task 3: Plumb `marketCents` and `lastMarketAt` through search.ts

**Files:**
- Modify: `lib/services/search.ts`, `lib/services/search.test.ts`

- [ ] **Step 1: Export `applySort` from `search.ts`**

`searchLocal.ts` will need to call the same sort. Open `lib/services/search.ts` and add `export` to the existing `applySort` function:

```ts
// (find the existing line)
export function applySort(rows: AnyDto[], sortBy: SortBy): AnyDto[] {
```

Also export `AnyDto` and `Tokens` if they aren't already (`searchLocal` will need them):

```ts
export type AnyDto = SealedResultDto | CardResultDto;
```

(`Tokens` is already exported.)

- [ ] **Step 2: Add `lastMarketAt` to result DTOs**

In `search.ts`, modify the DTO types:

```ts
export type SealedResultDto = {
  type: 'sealed';
  catalogItemId: number;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  imageUrl: string | null;
  marketCents: number | null;
  lastMarketAt: string | null;
};

export type CardResultDto = { type: 'card' } & CardVariantHit & { lastMarketAt: string | null };
```

`CardVariantHit` already carries the price/image; we extend with the timestamp at the DTO layer.

- [ ] **Step 3: Pass `marketCents` and surface `lastMarketAt` from sealed upserts**

Find `searchSealedWithImport` in `search.ts`. Update the `upsertSealed` call to pass `lastMarketCents` and capture `lastMarketAt`:

```ts
export async function searchSealedWithImport(query: string, limit: number): Promise<SealedResult[]> {
  const hits = await searchSealed(query, limit);
  const results = await Promise.all(
    hits.map(async (h) => {
      const upserted = await UPSERT_LIMIT(() =>
        upsertSealed({
          kind: 'sealed',
          name: h.name,
          setName: h.setName,
          setCode: h.setCode,
          tcgplayerProductId: h.tcgplayerProductId,
          productType: h.productType,
          imageUrl: h.imageUrl,
          releaseDate: h.releaseDate,
          lastMarketCents: h.marketCents,
        })
      );
      const resolvedImageUrl = getImageUrl({
        imageStoragePath: upserted.imageStoragePath,
        imageUrl: h.imageUrl,
      });
      return {
        ...h,
        catalogItemId: upserted.id,
        imageUrl: resolvedImageUrl,
        imageStoragePath: upserted.imageStoragePath,
        lastMarketAt: upserted.lastMarketAt?.toISOString() ?? null,
      };
    })
  );
  return results;
}
```

Update the `SealedResult` type:

```ts
export type SealedResult = SealedSearchHit & {
  catalogItemId: number;
  imageStoragePath: string | null;
  lastMarketAt: string | null;
};
```

- [ ] **Step 4: Pass `marketCents` and surface `lastMarketAt` from card bulk upsert**

Find `searchCardsWithImport`. Locate the `pendingToInput` helper and add `lastMarketCents`:

```ts
function pendingToInput(p: PendingVariant): CardUpsertInput {
  return {
    kind: 'card',
    name: p.card.name,
    setName: p.card.setName,
    setCode: p.card.setCode,
    pokemonTcgCardId: p.card.cardId,
    tcgplayerSkuId: null,
    cardNumber: p.card.number,
    rarity: p.card.rarity,
    variant: p.variant,
    imageUrl: p.card.imageUrl,
    releaseDate: p.card.releaseDate,
    lastMarketCents: p.marketCents,
  };
}
```

Then in the function's tail where DTOs are assembled, include `lastMarketAt`:

```ts
const results: CardVariantHit[] = pending.map((p, i) => {
  const upserted = upsertResults[i];
  return {
    catalogItemId: upserted.id,
    name: p.card.name,
    cardNumber: p.card.number,
    setName: p.card.setName,
    setCode: p.card.setCode,
    rarity: p.card.rarity,
    variant: p.variant,
    imageUrl: getImageUrl({ imageStoragePath: upserted.imageStoragePath, imageUrl: p.card.imageUrl }),
    imageStoragePath: upserted.imageStoragePath,
    marketCents: p.marketCents,
    lastMarketAt: upserted.lastMarketAt?.toISOString() ?? null,
  };
});
```

Update `CardVariantHit` to include `lastMarketAt`:

```ts
export type CardVariantHit = {
  catalogItemId: number;
  name: string;
  cardNumber: string;
  setName: string | null;
  setCode: string | null;
  rarity: string | null;
  variant: string;
  imageUrl: string | null;
  imageStoragePath: string | null;
  marketCents: number | null;
  lastMarketAt: string | null;
};
```

- [ ] **Step 5: Update `searchAll` to surface `lastMarketAt` on DTO mapping**

In `search.ts`, find the `searchAll` body where sealed → SealedResultDto. Update it to include `lastMarketAt`:

```ts
const sealedDtos: SealedResultDto[] = sealed.map((s) => ({
  type: 'sealed',
  catalogItemId: s.catalogItemId,
  name: s.name,
  setName: s.setName,
  setCode: s.setCode,
  productType: s.productType,
  imageUrl: s.imageUrl,
  marketCents: s.marketCents,
  lastMarketAt: s.lastMarketAt,
}));
```

The cards line `cards.results.map((c) => ({ type: 'card' as const, ...c }))` already carries `lastMarketAt` because we added it to `CardVariantHit` above.

- [ ] **Step 6: Update the test mock to return `lastMarketAt`**

Open `lib/services/search.test.ts`. Find the `vi.mock('@/lib/db/upserts/catalogItems', ...)` block and update it:

```ts
let cardUpsertCounter = 0;
vi.mock('@/lib/db/upserts/catalogItems', () => ({
  upsertSealed: vi.fn(async (i: { tcgplayerProductId: number }) => ({
    id: i.tcgplayerProductId,
    imageStoragePath: null,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  })),
  upsertCard: vi.fn(async () => ({
    id: ++cardUpsertCounter,
    imageStoragePath: null,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  })),
  bulkUpsertCards: vi.fn(async (inputs: unknown[]) =>
    inputs.map(() => ({
      id: ++cardUpsertCounter,
      imageStoragePath: null,
      lastMarketAt: new Date('2026-04-26T00:00:00Z'),
    }))
  ),
}));
```

- [ ] **Step 7: Run tests**

```bash
npm test
```

Expected: all 38 tests still pass. If new failures pop up, they're likely DTO assertions that need to be relaxed (e.g., `expect(r).toEqual({...})` with the old DTO shape). Use `expect.objectContaining(...)` to ignore the new field, or just add `lastMarketAt: '2026-04-26T00:00:00.000Z'` to the expected object.

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/services/search.ts lib/services/search.test.ts
git commit -m "feat(search): write last_market_cents on upsert, return lastMarketAt on DTOs"
```

---

## Task 4: Build `searchLocalCatalog` predicate construction (TDD)

**Files:**
- Create: `lib/services/searchLocal.ts`, `lib/services/searchLocal.test.ts`

- [ ] **Step 1: Write the failing test**

We can't unit-test the SQL-building paths without spinning up real Drizzle (the `eq`/`and`/`or` calls need genuine schema column metadata). What we CAN test cheaply: the early-return for empty tokens, and the row → DTO mapping. Manual acceptance in Task 10 covers the SQL paths against the live DB.

Create `lib/services/searchLocal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { searchLocalCatalog, __rowToDto } from './searchLocal';

describe('searchLocalCatalog', () => {
  it('returns empty when no tokens are present', async () => {
    const result = await searchLocalCatalog(
      { text: [], cardNumberFull: null, cardNumberPartial: null, setCode: null },
      'all',
      50,
      'price-desc'
    );
    expect(result.sealed).toEqual([]);
    expect(result.cards).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('__rowToDto', () => {
  const baseSealedRow = {
    id: 1,
    kind: 'sealed' as const,
    name: 'Scarlet & Violet 151 Elite Trainer Box',
    setName: 'SV: Scarlet & Violet 151',
    setCode: 'mew',
    productType: 'Elite Trainer Box',
    cardNumber: null,
    rarity: null,
    variant: null,
    imageUrl: 'https://upstream.example/etb.png',
    imageStoragePath: 'catalog/1.webp',
    lastMarketCents: 7450,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  };

  const baseCardRow = {
    id: 2,
    kind: 'card' as const,
    name: 'Charizard ex',
    setName: 'Scarlet & Violet 151',
    setCode: 'sv3pt5',
    productType: null,
    cardNumber: '199',
    rarity: 'Special Illustration Rare',
    variant: 'holo',
    imageUrl: 'https://upstream.example/199.png',
    imageStoragePath: null,
    lastMarketCents: 110000,
    lastMarketAt: new Date('2026-04-26T00:00:00Z'),
  };

  it('maps a sealed row to SealedResultDto', () => {
    const dto = __rowToDto(baseSealedRow);
    expect(dto?.type).toBe('sealed');
    expect(dto?.catalogItemId).toBe(1);
    expect(dto?.marketCents).toBe(7450);
    expect(dto?.lastMarketAt).toBe('2026-04-26T00:00:00.000Z');
  });

  it('maps a card row to CardResultDto', () => {
    const dto = __rowToDto(baseCardRow);
    expect(dto?.type).toBe('card');
    expect(dto?.catalogItemId).toBe(2);
    if (dto?.type === 'card') {
      expect(dto.variant).toBe('holo');
      expect(dto.cardNumber).toBe('199');
    }
    expect(dto?.marketCents).toBe(110000);
  });

  it('returns null for a card row missing card_number', () => {
    expect(__rowToDto({ ...baseCardRow, cardNumber: null })).toBeNull();
  });

  it('returns null for a card row missing variant', () => {
    expect(__rowToDto({ ...baseCardRow, variant: null })).toBeNull();
  });

  it('returns null lastMarketAt when the column is null', () => {
    const dto = __rowToDto({ ...baseSealedRow, lastMarketAt: null });
    expect(dto?.lastMarketAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/services/searchLocal
```

Expected: FAIL with "Cannot find module './searchLocal'".

- [ ] **Step 3: Implement the module**

Create `lib/services/searchLocal.ts`:

```ts
import 'server-only';
import { and, or, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import {
  applySort,
  type AnyDto,
  type CardResultDto,
  type SealedResultDto,
  type SearchKind,
  type SortBy,
  type Tokens,
  type Warning,
} from './search';
import { getImageUrl } from '@/lib/utils/images';

type LocalRow = {
  id: number;
  kind: string;
  name: string;
  setName: string | null;
  setCode: string | null;
  productType: string | null;
  cardNumber: string | null;
  rarity: string | null;
  variant: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  lastMarketCents: number | null;
  lastMarketAt: Date | null;
};

function buildConditions(tokens: Tokens, kind: SearchKind): SQL | undefined {
  const clauses: SQL[] = [];

  for (const t of tokens.text) {
    const pattern = `%${t}%`;
    clauses.push(
      or(ilike(schema.catalogItems.name, pattern), ilike(schema.catalogItems.setName, pattern))!
    );
  }

  if (tokens.cardNumberFull) {
    const head = tokens.cardNumberFull.split('/')[0];
    clauses.push(
      or(
        eq(schema.catalogItems.cardNumber, tokens.cardNumberFull),
        ilike(schema.catalogItems.cardNumber, `${head}/%`)
      )!
    );
  } else if (tokens.cardNumberPartial) {
    const n = tokens.cardNumberPartial;
    clauses.push(
      or(
        eq(schema.catalogItems.cardNumber, n),
        ilike(schema.catalogItems.cardNumber, `${n}/%`)
      )!
    );
  }

  if (tokens.setCode) {
    clauses.push(eq(schema.catalogItems.setCode, tokens.setCode));
  }

  if (kind === 'sealed') clauses.push(eq(schema.catalogItems.kind, 'sealed'));
  else if (kind === 'card') clauses.push(eq(schema.catalogItems.kind, 'card'));

  if (clauses.length === 0) return undefined;
  return and(...clauses);
}

// Exported with the __ prefix so unit tests can exercise the row-to-DTO
// mapping without standing up a real database. Not part of the public API.
export function __rowToDto(row: LocalRow): AnyDto | null {
  const lastMarketAt = row.lastMarketAt?.toISOString() ?? null;
  const imageUrl = getImageUrl({
    imageStoragePath: row.imageStoragePath,
    imageUrl: row.imageUrl,
  });
  if (row.kind === 'sealed') {
    return {
      type: 'sealed',
      catalogItemId: row.id,
      name: row.name,
      setName: row.setName,
      setCode: row.setCode,
      productType: row.productType,
      imageUrl,
      marketCents: row.lastMarketCents,
      lastMarketAt,
    } satisfies SealedResultDto;
  }
  if (row.kind === 'card' && row.cardNumber !== null && row.variant !== null) {
    return {
      type: 'card',
      catalogItemId: row.id,
      name: row.name,
      cardNumber: row.cardNumber,
      setName: row.setName,
      setCode: row.setCode,
      rarity: row.rarity,
      variant: row.variant,
      imageUrl,
      imageStoragePath: row.imageStoragePath,
      marketCents: row.lastMarketCents,
      lastMarketAt,
    } satisfies CardResultDto;
  }
  return null;
}

export async function searchLocalCatalog(
  tokens: Tokens,
  kind: SearchKind,
  limit: number,
  sortBy: SortBy
): Promise<{ sealed: SealedResultDto[]; cards: CardResultDto[]; warnings: Warning[] }> {
  const conditions = buildConditions(tokens, kind);
  if (!conditions) {
    return { sealed: [], cards: [], warnings: [] };
  }

  // Pull a generous superset (limit * 2, capped at 1000) so we can sort
  // in-memory and still leave headroom even after dropping rows the user
  // can't render (e.g., card rows missing variant/cardNumber).
  const fetchCap = Math.min(1000, Math.max(limit * 2, limit));
  const rows = (await db
    .select({
      id: schema.catalogItems.id,
      kind: schema.catalogItems.kind,
      name: schema.catalogItems.name,
      setName: schema.catalogItems.setName,
      setCode: schema.catalogItems.setCode,
      productType: schema.catalogItems.productType,
      cardNumber: schema.catalogItems.cardNumber,
      rarity: schema.catalogItems.rarity,
      variant: schema.catalogItems.variant,
      imageUrl: schema.catalogItems.imageUrl,
      imageStoragePath: schema.catalogItems.imageStoragePath,
      lastMarketCents: schema.catalogItems.lastMarketCents,
      lastMarketAt: schema.catalogItems.lastMarketAt,
    })
    .from(schema.catalogItems)
    .where(conditions)
    .limit(fetchCap)) as LocalRow[];

  const dtos = rows.map(__rowToDto).filter((d): d is AnyDto => d !== null);
  const sorted = applySort(dtos, sortBy).slice(0, limit);
  const sealed: SealedResultDto[] = [];
  const cards: CardResultDto[] = [];
  for (const d of sorted) {
    if (d.type === 'sealed') sealed.push(d);
    else cards.push(d);
  }
  return { sealed, cards, warnings: [] };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm test -- lib/services/searchLocal
```

Expected: 6 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/services/searchLocal.ts lib/services/searchLocal.test.ts
git commit -m "feat(search): add searchLocalCatalog reading from catalog_items"
```

---

## Task 5: Local-first dispatch in `/api/search` GET

**Files:**
- Modify: `app/api/search/route.ts`

- [ ] **Step 1: Update the route to call local first**

Replace the contents of `app/api/search/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll, applySort, tokenizeQuery } from '@/lib/services/search';
import { searchLocalCatalog } from '@/lib/services/searchLocal';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(600).default(60),
  sortBy: z
    .enum(['price-desc', 'price-asc', 'rarity-desc', 'relevance', 'released', 'name'])
    .default('price-desc'),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit, sortBy } = parsed.data;
  const trimmed = q.trim();

  // 1) Try local first. catalog_items already has every result we've ever
  //    fetched + cached prices — sub-second response when we hit.
  const tokens = tokenizeQuery(trimmed);
  const local = await searchLocalCatalog(tokens, kind, limit, sortBy);
  if (local.sealed.length + local.cards.length > 0) {
    const merged = applySort([...local.sealed, ...local.cards], sortBy).slice(0, limit);
    return NextResponse.json(
      {
        query: trimmed,
        kind,
        sortBy,
        results: merged,
        warnings: local.warnings,
        source: 'local',
      },
      {
        headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
      }
    );
  }

  // 2) Nothing in local. Fall back to the upstream-import path.
  const upstream = await searchAll(trimmed, kind, limit, sortBy);
  return NextResponse.json(
    { ...upstream, source: 'upstream' },
    {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800' },
    }
  );
}
```

- [ ] **Step 2: Type-check + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean, all 38 + 4 = 42 tests pass.

- [ ] **Step 3: Build verification**

```bash
npx next build
```

Expected: build succeeds. `/api/search` registered as dynamic route.

- [ ] **Step 4: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(api): GET /api/search dispatches local-first, falls back upstream"
```

---

## Task 6: New `/api/search/refresh` POST endpoint

**Files:**
- Create: `app/api/search/refresh/route.ts`

- [ ] **Step 1: Implement the route**

Create `app/api/search/refresh/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchAll } from '@/lib/services/search';

const querySchema = z.object({
  q: z.string().min(1).max(200),
  kind: z.enum(['all', 'sealed', 'card']).default('all'),
  limit: z.coerce.number().int().min(1).max(600).default(60),
  sortBy: z
    .enum(['price-desc', 'price-asc', 'rarity-desc', 'relevance', 'released', 'name'])
    .default('price-desc'),
});

export async function POST(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { q, kind, limit, sortBy } = parsed.data;

  // Always run upstream. searchAll's bulk-upsert path writes
  // last_market_cents and last_market_at = NOW() so the next GET reads
  // fresh data from local.
  const upstream = await searchAll(q.trim(), kind, limit, sortBy);
  return NextResponse.json(
    { ...upstream, source: 'refresh' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 2: Build**

```bash
npx next build
```

Expected: `/api/search/refresh` listed as dynamic route in the output.

- [ ] **Step 3: Manual smoke test**

Run dev server in one terminal:

```bash
npm run dev
```

In another (after signing in via the browser to get a session cookie, copy it from DevTools, replace `<COOKIE>` below):

```bash
curl -s -X POST -b "<COOKIE>" "http://localhost:3000/api/search/refresh?q=ascended+heroes&kind=card&sortBy=price-desc&limit=10" | head -c 400
```

Expected: a JSON response with `source:'refresh'` and `results` array. Stop dev server with Ctrl+C.

If the auth/cookie copy step is annoying, skip the manual test — Task 11's acceptance covers it via the UI.

- [ ] **Step 4: Commit**

```bash
git add app/api/search/refresh
git commit -m "feat(api): add POST /api/search/refresh that always runs upstream"
```

---

## Task 7: `formatRelativeTime` helper

**Files:**
- Create: `lib/utils/time.ts`, `lib/utils/time.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/utils/time.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from './time';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Last updated unknown" for null', () => {
    expect(formatRelativeTime(null)).toBe('Last updated unknown');
  });

  it('returns "Updated just now" for under 5 minutes', () => {
    const d = new Date('2026-04-26T11:58:00Z');
    expect(formatRelativeTime(d)).toBe('Updated just now');
  });

  it('returns minutes for 5-59 minutes', () => {
    const d = new Date('2026-04-26T11:30:00Z'); // 30 min ago
    expect(formatRelativeTime(d)).toMatch(/Updated 30 minutes ago/);
  });

  it('returns hours for 1-23 hours', () => {
    const d = new Date('2026-04-26T07:00:00Z'); // 5 hours ago
    expect(formatRelativeTime(d)).toMatch(/Updated 5 hours ago/);
  });

  it('returns days for 24+ hours', () => {
    const d = new Date('2026-04-23T12:00:00Z'); // 3 days ago
    expect(formatRelativeTime(d)).toMatch(/Updated 3 days ago/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

```bash
npm test -- lib/utils/time
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `lib/utils/time.ts`:

```ts
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Format a wall-clock time relative to now. Used by the SearchBox "Updated"
 * caption next to result counts.
 *
 *   under 5 min   -> "Updated just now"
 *   5-59 min      -> "Updated N minutes ago"
 *   1-23 hours    -> "Updated N hours ago"
 *   1+ days       -> "Updated N days ago"
 *   null          -> "Last updated unknown"
 */
export function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return 'Last updated unknown';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 5) return 'Updated just now';
  if (diffMin < 60) return `Updated ${rtf.format(-diffMin, 'minute')}`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${rtf.format(-diffHr, 'hour')}`;
  const diffDay = Math.floor(diffHr / 24);
  return `Updated ${rtf.format(-diffDay, 'day')}`;
}
```

- [ ] **Step 4: Run, confirm pass**

```bash
npm test -- lib/utils/time
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/time.ts lib/utils/time.test.ts
git commit -m "feat(utils): add formatRelativeTime helper"
```

---

## Task 8: `RefreshButton` component

**Files:**
- Create: `components/catalog/RefreshButton.tsx`

- [ ] **Step 1: Implement**

Create `components/catalog/RefreshButton.tsx`:

```tsx
'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function RefreshButton({
  query,
  kind,
  sortBy,
  disabled,
}: {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const url = `/api/search/refresh?q=${encodeURIComponent(query)}&kind=${kind}&sortBy=${sortBy}&limit=500`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `refresh failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Drop the cached search response so the next render picks up the
      // freshly-written rows from local.
      qc.invalidateQueries({ queryKey: ['search', query, kind, sortBy] });
      toast.success('Refreshed');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const isDisabled = disabled || isPending || query.length === 0;
  return (
    <button
      type="button"
      aria-label="Refresh search results"
      onClick={() => mutate()}
      disabled={isDisabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? (
        <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      )}
      <span>Refresh</span>
    </button>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/catalog/RefreshButton.tsx
git commit -m "feat(ui): add RefreshButton component"
```

---

## Task 9: Wire RefreshButton + "Updated" caption into SearchBox

**Files:**
- Modify: `components/catalog/SearchBox.tsx`

- [ ] **Step 1: Update SearchBox**

Open `components/catalog/SearchBox.tsx`. Add the refresh button next to the sort dropdown and the "Updated" caption next to the "Showing N of M" line.

Replace the current `SearchResponse` type to include `lastMarketAt` on results (so visible.results carry it), then add the helpers and button:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchResultRow, type ResultRow } from './SearchResultRow';
import { RefreshButton } from './RefreshButton';
import { formatRelativeTime } from '@/lib/utils/time';

type SortBy = 'price-desc' | 'price-asc' | 'rarity-desc' | 'relevance' | 'name';

type ResultRowWithMeta = ResultRow & { lastMarketAt?: string | null };

type SearchResponse = {
  query: string;
  kind: 'all' | 'sealed' | 'card';
  sortBy: SortBy;
  results: ResultRowWithMeta[];
  warnings: Array<{ source: string; message: string }>;
  source?: 'local' | 'upstream' | 'refresh';
};

const KINDS: Array<{ key: 'all' | 'sealed' | 'card'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sealed', label: 'Sealed' },
  { key: 'card', label: 'Cards' },
];

const SORTS: Array<{ key: SortBy; label: string }> = [
  { key: 'price-desc', label: 'Price (high to low)' },
  { key: 'price-asc', label: 'Price (low to high)' },
  { key: 'rarity-desc', label: 'Rarity (highest first)' },
  { key: 'name', label: 'Name (A-Z)' },
  { key: 'relevance', label: 'Best match' },
];

const ALL_RARITIES = '__all__';
const PAGE_SIZE = 24;

export function SearchBox() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState<'all' | 'sealed' | 'card'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('price-desc');
  const [rarity, setRarity] = useState<string>(ALL_RARITIES);
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [debounced, kind, sortBy, rarity]);

  useEffect(() => {
    setRarity(ALL_RARITIES);
  }, [debounced, kind]);

  const enabled = debounced.length > 0;
  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ['search', debounced, kind, sortBy],
    queryFn: async () => {
      const url = `/api/search?q=${encodeURIComponent(debounced)}&kind=${kind}&sortBy=${sortBy}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const rarityOptions = useMemo(() => {
    if (!data) return [] as string[];
    const seen = new Set<string>();
    for (const r of data.results) {
      if (r.type === 'card' && r.rarity) seen.add(r.rarity);
    }
    return Array.from(seen).sort();
  }, [data]);

  const filteredResults = useMemo(() => {
    if (!data) return [] as ResultRowWithMeta[];
    if (rarity === ALL_RARITIES) return data.results;
    return data.results.filter((r) => r.type === 'card' && r.rarity === rarity);
  }, [data, rarity]);

  const visible = filteredResults.slice(0, shown);
  const hasMore = filteredResults.length > shown;

  // "Updated" caption: oldest lastMarketAt among visible results = worst-case freshness.
  const oldestUpdated = useMemo(() => {
    if (visible.length === 0) return null;
    let oldest: Date | null = null;
    let anyMissing = false;
    for (const r of visible) {
      const ts = r.lastMarketAt;
      if (!ts) {
        anyMissing = true;
        continue;
      }
      const d = new Date(ts);
      if (!oldest || d < oldest) oldest = d;
    }
    return anyMissing ? null : oldest;
  }, [visible]);

  useEffect(() => {
    if (visible.length === 0) return;
    const ids = visible
      .filter((r) => !('imageStoragePath' in r) || !(r as { imageStoragePath?: string | null }).imageStoragePath)
      .map((r) => r.catalogItemId)
      .slice(0, 24);
    if (ids.length === 0) return;
    fetch('/api/cache-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, [visible]);

  return (
    <div className="space-y-4">
      <Input
        autoFocus
        placeholder="Search Pokemon products and cards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
          {rarityOptions.length > 0 && kind !== 'sealed' && (
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value)}
              className="rounded-full border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by rarity"
            >
              <option value={ALL_RARITIES}>All rarities</option>
              {rarityOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton
            query={debounced}
            kind={kind}
            sortBy={sortBy}
            disabled={!enabled}
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Sort results"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!enabled && (
        <p className="text-sm text-muted-foreground">
          Try &ldquo;ascended heroes&rdquo;, &ldquo;pikachu ascended heroes&rdquo;, or &ldquo;074/088&rdquo;.
        </p>
      )}

      {enabled && isFetching && !data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
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

      {data && filteredResults.length === 0 && enabled && !isFetching && (
        <p className="text-sm text-muted-foreground">No matches.</p>
      )}

      {visible.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((row, i) => (
              <SearchResultRow key={`${row.type}-${row.catalogItemId}-${i}`} row={row} />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {visible.length} of {filteredResults.length}
              {rarity !== ALL_RARITIES && data ? ` (filtered from ${data.results.length})` : ''}
              <span className="mx-2 text-muted-foreground/50">·</span>
              {formatRelativeTime(oldestUpdated)}
            </span>
            {hasMore && (
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE_SIZE)}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                Load more
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + tests**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean, all tests pass.

- [ ] **Step 3: Build**

```bash
npx next build
```

Expected: clean. New `/api/search/refresh` route appears in the route table.

- [ ] **Step 4: Commit**

```bash
git add components/catalog/SearchBox.tsx
git commit -m "feat(ui): add Refresh button and Updated caption to SearchBox"
```

---

## Task 10: Final acceptance verification

No new files. Walk the acceptance checklist end-to-end against the deployed app, then commit a marker.

- [ ] **Step 1: Push everything to main and wait for Vercel**

```bash
git push
```

Wait for Vercel build to finish (~1-2 min). Visit the production URL.

- [ ] **Step 2: First-ever-search test**

1. Sign in.
2. Click the **Search** tab.
3. Search for a query you've never run before, e.g. `destined rivals`.
4. Expect ~5 second wait (upstream fetch).
5. Open DevTools Network tab, find `/api/search?...` — confirm response payload contains `"source":"upstream"`.

- [ ] **Step 3: Cached-search test**

1. With "destined rivals" still showing, hard-refresh the page (Ctrl+F5).
2. Expect under 1 second to results.
3. In DevTools, the same `/api/search?...` request should show `"source":"local"`.

- [ ] **Step 4: Refresh-button test**

1. Click the **Refresh** button next to the sort dropdown.
2. Spinner appears for ~5 seconds.
3. Toast says "Refreshed".
4. Network tab shows a successful `POST /api/search/refresh?...`.
5. The `Updated just now` caption appears under the result count.

- [ ] **Step 5: Cross-query test**

1. Search `ascended heroes`. Results appear instantly (it's been imported many times in dev).
2. Sort by Price (high to low). Pikachu ex SIRs should be at the top.
3. Search `ascended heroes pikachu`. Instant — only Pikachu cards from the set, since they're already in catalog_items.

- [ ] **Step 6: DB sanity check**

```bash
cat > /tmp/check-last-market.ts << 'EOF'
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL_DIRECT!);
const r = await sql`
  SELECT
    set_code,
    COUNT(*) FILTER (WHERE last_market_cents IS NOT NULL) AS priced,
    COUNT(*) AS total,
    MAX(last_market_at) AS most_recent
  FROM catalog_items
  WHERE kind = 'card' AND set_code IN ('me2pt5', 'sv4pt5', 'sv3pt5')
  GROUP BY set_code
  ORDER BY set_code`;
console.log(r);
await sql.end();
EOF
npx tsx /tmp/check-last-market.ts
```

Expected: each set has `priced` close to `total` (most rows have a cached price), and `most_recent` is recent (within the last few minutes if you just refreshed).

- [ ] **Step 7: Marker commit**

```bash
git commit --allow-empty -m "chore: db-first search complete (Plan 2 capstone)"
git push
```

---

## Done — Acceptance criteria

When all of the above are checked, the following is true:

- [ ] Migration applied: `last_market_cents` and `last_market_at` columns live on `catalog_items` in production.
- [ ] `searchLocalCatalog` returns rows from `catalog_items` for queries that have been run before.
- [ ] `/api/search` GET serves local first, upstream only on zero matches.
- [ ] `/api/search/refresh` POST always hits upstream and updates rows.
- [ ] SearchBox has a Refresh button and a relative-time "Updated" caption.
- [ ] All unit tests pass; production build succeeds; manual checklist runs clean.

When this is true, **Plan 2 is truly done**. Plan 3 (Purchases) becomes the next focus.

---

## Self-Review Notes

**Spec coverage:**
- §3.1 New surfaces — Tasks 1, 2, 4, 5, 6, 8, 9 cover every file in the table.
- §3.2 Data flow — Tasks 5 (GET dispatch) + 6 (refresh) implement both paths.
- §4 Schema migration — Task 1.
- §5 Local search query — Task 4 implements predicate construction + result mapping + sorting.
- §6 Refresh flow — Task 6.
- §7 /api/search GET wiring — Task 5.
- §8 Frontend — Tasks 8 (button) + 9 (integration + caption) + 7 (helper).
- §9 Tests — Tasks 4, 7 ship with TDD; Task 10 is manual acceptance.
- §11 Done criteria — covered by Task 10's checklist.

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every step has either complete code or an exact command. Task 6 Step 3's manual smoke test is optional (skipped if cookie copy is annoying) and Task 10 covers the same path through the UI.

**Type consistency:**
- `UpsertResult` introduced in Task 2 with `{ id, imageStoragePath, lastMarketAt }`. Same shape used everywhere downstream.
- `SealedUpsertInput` and `CardUpsertInput` gain `lastMarketCents` in Task 2. Used in Task 3's `pendingToInput` and `searchSealedWithImport`.
- `SealedResultDto`, `CardResultDto`, `CardVariantHit` all gain `lastMarketAt` in Task 3. Consumed by `searchLocalCatalog` (Task 4) and SearchBox (Task 9).
- `formatRelativeTime` signature `(Date | null | undefined) => string` matches its caller's `oldestUpdated: Date | null` in Task 9.
- `RefreshButton` props `{ query, kind, sortBy, disabled }` match SearchBox's call site.

**Manual steps clearly labeled:** Task 1 Step 4 and Task 10 Steps 2-6 are human-eyes verifications.
