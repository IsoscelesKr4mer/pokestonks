# Plan 10 — Storefront (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, shareable "menu" of items the user is selling, with per-token chrome, an admin price editor, an inline asking-price CTA on holding detail, and a markdown copy fallback. Public route is fully white-label (no Pokestonks branding visible to buyers).

**Architecture:** Two new tables (`share_tokens`, `storefront_listings`) with owner-only RLS. Public route lives at `app/storefront/[token]/` outside the `(authenticated)` group; resolution uses the existing direct-Postgres Drizzle client (which bypasses RLS). Admin route lives inside `(authenticated)/storefront/`. Per-holding inline integration adds `<SetAskingPriceCta>` next to the existing `<SetManualPriceCta>`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM, Supabase Postgres, Zod, TanStack Query, Vitest, base-ui Dialog, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-02-pokestonks-storefront-design.md` (commit `1dd0dbf`).

**Reference commit:** `1dd0dbf` (Plan 10 spec). Last shipped feature: Plan 9 at `1e2c7df`. Latest main: `1dd0dbf`.

---

## File map

**New files:**
- `supabase/migrations/20260502000003_storefront.sql`
- `lib/db/schema/shareTokens.ts`
- `lib/db/schema/storefrontListings.ts`
- `lib/validation/storefront.ts`
- `lib/services/share-tokens.ts`
- `lib/services/share-tokens.test.ts`
- `lib/services/storefront.ts`
- `lib/services/storefront.test.ts`
- `app/api/storefront/tokens/route.ts`
- `app/api/storefront/tokens/route.test.ts`
- `app/api/storefront/tokens/[id]/route.ts`
- `app/api/storefront/tokens/[id]/route.test.ts`
- `app/api/storefront/listings/route.ts`
- `app/api/storefront/listings/route.test.ts`
- `app/api/storefront/listings/[catalogItemId]/route.ts`
- `app/api/storefront/listings/[catalogItemId]/route.test.ts`
- `lib/query/hooks/useStorefront.ts`
- `components/storefront/AskingPriceDialog.tsx`
- `components/storefront/AskingPriceDialog.test.tsx`
- `components/storefront/SetAskingPriceCta.tsx`
- `components/storefront/StorefrontHeader.tsx`
- `components/storefront/StorefrontGrid.tsx`
- `components/storefront/StorefrontUnavailable.tsx`
- `components/storefront/StorefrontGrid.test.tsx`
- `components/storefront/ShareLinkCard.tsx`
- `components/storefront/ShareLinkCreateDialog.tsx`
- `components/storefront/ListingsTable.tsx`
- `components/storefront/ListingsTable.test.tsx`
- `components/storefront/AddListingFromHoldingsDialog.tsx`
- `components/storefront/MarkdownCopyButton.tsx`
- `components/storefront/MarkdownCopyButton.test.tsx`
- `app/storefront/[token]/page.tsx`
- `app/storefront/[token]/layout.tsx`
- `app/storefront/[token]/icon.tsx`
- `app/(authenticated)/storefront/page.tsx`
- `app/(authenticated)/storefront/StorefrontAdminClient.tsx`
- `app/(authenticated)/holdings/[catalogItemId]/StorefrontIntegration.tsx`

**Modified files:**
- `lib/db/schema/index.ts` (re-export new schemas)
- `lib/api/holdingDetailDto.ts` (add optional `storefrontListing` field; build helper)
- `app/api/holdings/[catalogItemId]/route.ts` (return `storefrontListing` on holding)
- `app/(authenticated)/holdings/[catalogItemId]/page.tsx` (load listing, pass to client)
- `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx` (render `<StorefrontIntegration/>`)
- `components/nav/TopNav.tsx` (add Storefront link)

---

## Pre-flight

- [ ] **Step 0.1: Verify clean working tree on main at the spec commit**

```bash
git status
git log -1 --format="%H %s"
```

Expected: clean working tree. Latest commit is `1dd0dbf docs(plan-10): spec for Storefront ...`.

- [ ] **Step 0.2: Confirm baseline test count and build cleanliness**

```bash
npm run test
npm run typecheck
npm run build
```

Expected: 469 tests passing (Plan 9 ship marker baseline). `tsc --noEmit` clean. `next build` clean. Record the test count; this is the baseline for the "+N tests" math at ship time.

---

## Task 1: SQL migration file

**Files:**
- Create: `supabase/migrations/20260502000003_storefront.sql`

- [ ] **Step 1.1: Create the migration file**

Path: `supabase/migrations/20260502000003_storefront.sql`. Exact contents:

```sql
-- ============================================================
-- Plan 10: Storefront tables
--
-- share_tokens         — public-link rows, owner-only RLS
-- storefront_listings  — per (user, catalog_item) asking price
--
-- Service-role bypass on the public /storefront/[token] route
-- is achieved by using the direct-Postgres Drizzle client
-- (lib/db/client.ts), which is not subject to PostgREST RLS.
-- The RLS policies below remain in place for the standard
-- authenticated (PostgREST/anon) access paths.
-- ============================================================

CREATE TABLE share_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('storefront')),
  label TEXT NOT NULL DEFAULT '',
  header_title TEXT,
  header_subtitle TEXT,
  contact_line TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX share_tokens_user_idx ON share_tokens (user_id, revoked_at);

CREATE TABLE storefront_listings (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  catalog_item_id BIGINT NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  asking_price_cents INTEGER NOT NULL CHECK (asking_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, catalog_item_id)
);
CREATE INDEX storefront_listings_user_idx ON storefront_listings (user_id);

ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own share_tokens" ON share_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE storefront_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own storefront_listings" ON storefront_listings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON COLUMN share_tokens.kind IS
  'Discriminator. Only ''storefront'' in v1; future plans (vault-share) will widen the CHECK.';
COMMENT ON COLUMN share_tokens.revoked_at IS
  'Soft-revoke timestamp. NULL means active. Public route renders 410 + "taken down" copy when set.';
COMMENT ON COLUMN storefront_listings.asking_price_cents IS
  'Per (user, catalog_item) asking price in cents. PK enforces uniqueness; UPSERT on conflict.';
```

**DO NOT apply the migration yet.** It runs at the very end (Task 20) after all code is in place. The Drizzle schema files in Task 2 give us local TS types ahead of the live DB columns; tests mock the DB.

- [ ] **Step 1.2: Commit**

```bash
git add supabase/migrations/20260502000003_storefront.sql
git commit -m "feat(plan-10): migration for share_tokens + storefront_listings"
git push origin main
```

---

## Task 2: Drizzle schemas

**Files:**
- Create: `lib/db/schema/shareTokens.ts`
- Create: `lib/db/schema/storefrontListings.ts`
- Modify: `lib/db/schema/index.ts`

- [ ] **Step 2.1: Create `shareTokens.ts`**

Path: `lib/db/schema/shareTokens.ts`. Exact contents:

```ts
import { pgTable, bigserial, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const shareTokens = pgTable(
  'share_tokens',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    token: text('token').notNull().unique(),
    userId: uuid('user_id').notNull(),
    kind: text('kind').notNull(),
    label: text('label').notNull().default(''),
    headerTitle: text('header_title'),
    headerSubtitle: text('header_subtitle'),
    contactLine: text('contact_line'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('share_tokens_user_idx').on(t.userId, t.revokedAt),
    kindCheck: check('share_tokens_kind_check', sql`${t.kind} IN ('storefront')`),
  })
);

export type ShareToken = typeof shareTokens.$inferSelect;
export type NewShareToken = typeof shareTokens.$inferInsert;
```

- [ ] **Step 2.2: Create `storefrontListings.ts`**

Path: `lib/db/schema/storefrontListings.ts`. Exact contents:

```ts
import { pgTable, uuid, bigint, integer, timestamp, primaryKey, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { catalogItems } from './catalogItems';

export const storefrontListings = pgTable(
  'storefront_listings',
  {
    userId: uuid('user_id').notNull(),
    catalogItemId: bigint('catalog_item_id', { mode: 'number' })
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),
    askingPriceCents: integer('asking_price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.catalogItemId] }),
    userIdx: index('storefront_listings_user_idx').on(t.userId),
    askingPriceCheck: check(
      'storefront_listings_asking_price_nonneg',
      sql`${t.askingPriceCents} >= 0`
    ),
  })
);

export type StorefrontListing = typeof storefrontListings.$inferSelect;
export type NewStorefrontListing = typeof storefrontListings.$inferInsert;
```

- [ ] **Step 2.3: Re-export from index**

Edit `lib/db/schema/index.ts`. Add the two new exports at the bottom:

```ts
export * from './profiles';
export * from './catalogItems';
export * from './marketPrices';
export * from './purchases';
export * from './sales';
export * from './userGradedValues';
export * from './refreshRuns';
export * from './rips';
export * from './boxDecompositions';
export * from './catalogPackCompositions';
export * from './shareTokens';
export * from './storefrontListings';
```

- [ ] **Step 2.4: Verify tsc clean**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2.5: Commit**

```bash
git add lib/db/schema/shareTokens.ts lib/db/schema/storefrontListings.ts lib/db/schema/index.ts
git commit -m "feat(plan-10): drizzle schema for share_tokens + storefront_listings"
git push origin main
```

---

## Task 3: Validation schemas

**Files:**
- Create: `lib/validation/storefront.ts`

- [ ] **Step 3.1: Create the validation file**

Path: `lib/validation/storefront.ts`. Exact contents:

```ts
import { z } from 'zod';

const trimmedString = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= max, `must be ${max} characters or fewer`);

const optionalNullableString = (max: number) =>
  trimmedString(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

export const createTokenInputSchema = z.object({
  label: trimmedString(200).optional().default(''),
  headerTitle: optionalNullableString(200),
  headerSubtitle: optionalNullableString(200),
  contactLine: optionalNullableString(200),
});

export const updateTokenInputSchema = z.object({
  label: trimmedString(200).optional(),
  headerTitle: optionalNullableString(200),
  headerSubtitle: optionalNullableString(200),
  contactLine: optionalNullableString(200),
});

const MAX_ASKING_CENTS = 100_000_000; // $1,000,000

export const upsertListingInputSchema = z.object({
  catalogItemId: z.number().int().positive(),
  askingPriceCents: z.number().int().min(0).max(MAX_ASKING_CENTS),
});

export const MAX_ASKING_PRICE_CENTS = MAX_ASKING_CENTS;

export type CreateTokenInput = z.infer<typeof createTokenInputSchema>;
export type UpdateTokenInput = z.infer<typeof updateTokenInputSchema>;
export type UpsertListingInput = z.infer<typeof upsertListingInputSchema>;
```

- [ ] **Step 3.2: Commit**

```bash
git add lib/validation/storefront.ts
git commit -m "feat(plan-10): zod validation schemas for storefront"
git push origin main
```

---

## Task 4: Service — share-tokens (token gen + resolveShareToken)

**Files:**
- Create: `lib/services/share-tokens.ts`
- Create: `lib/services/share-tokens.test.ts`

- [ ] **Step 4.1: Write the failing test file**

Path: `lib/services/share-tokens.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRandomBytes = vi.fn();
vi.mock('node:crypto', () => ({
  randomBytes: (n: number) => mockRandomBytes(n),
}));

const mockTokenFindFirst = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findFirst: (args: unknown) => mockTokenFindFirst(args),
      },
    },
  },
  schema: {
    shareTokens: {
      token: { name: 'token' },
      kind: { name: 'kind' },
    },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ kind: 'and', conds }),
  isNull: (col: unknown) => ({ kind: 'isNull', col }),
}));

import { generateShareToken, resolveShareToken } from './share-tokens';

describe('generateShareToken', () => {
  beforeEach(() => {
    mockRandomBytes.mockReset();
  });

  it('produces a base64url string of the expected length', () => {
    mockRandomBytes.mockReturnValueOnce(Buffer.from('0123456789ab', 'utf-8'));
    const token = generateShareToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(16);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('resolveShareToken', () => {
  beforeEach(() => {
    mockTokenFindFirst.mockReset();
  });

  it('returns null when token row does not exist', async () => {
    mockTokenFindFirst.mockResolvedValueOnce(null);
    const result = await resolveShareToken('nonexistent', 'storefront');
    expect(result).toBeNull();
  });

  it('returns null when revoked_at is set', async () => {
    mockTokenFindFirst.mockResolvedValueOnce({
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'storefront',
      revokedAt: new Date('2026-04-01'),
    });
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toBeNull();
  });

  it('returns null when kind does not match', async () => {
    mockTokenFindFirst.mockResolvedValueOnce({
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'vault',
      revokedAt: null,
    });
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toBeNull();
  });

  it('returns the token row when active and kind matches', async () => {
    const row = {
      id: 1,
      token: 'abc',
      userId: 'u1',
      kind: 'storefront',
      label: '',
      headerTitle: null,
      headerSubtitle: null,
      contactLine: null,
      createdAt: new Date(),
      revokedAt: null,
    };
    mockTokenFindFirst.mockResolvedValueOnce(row);
    const result = await resolveShareToken('abc', 'storefront');
    expect(result).toEqual(row);
  });
});
```

- [ ] **Step 4.2: Run test, verify it fails**

```bash
npx vitest run lib/services/share-tokens.test.ts
```

Expected: failure with "cannot find module './share-tokens'" or similar.

- [ ] **Step 4.3: Implement the service**

Path: `lib/services/share-tokens.ts`. Exact contents:

```ts
import 'server-only';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

/**
 * Generate a 16-character URL-safe random token (96 bits of entropy).
 * Caller should retry once on unique-index conflict.
 */
export function generateShareToken(): string {
  return randomBytes(12).toString('base64url');
}

/**
 * Look up an active share token by its public string. Returns null when:
 *  - the token row does not exist
 *  - the token row is revoked (revoked_at is not null)
 *  - the token's kind does not match the expected discriminator
 *
 * This is the public-route resolver. It uses the direct-Postgres Drizzle
 * client (lib/db/client.ts), which is not subject to PostgREST RLS — that
 * is the deliberate service-role bypass for the public /storefront route.
 */
export async function resolveShareToken(
  token: string,
  kind: 'storefront'
): Promise<ShareToken | null> {
  const row = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.token, token),
  });
  if (!row) return null;
  if (row.revokedAt != null) return null;
  if (row.kind !== kind) return null;
  return row;
}
```

- [ ] **Step 4.4: Run test, verify pass**

```bash
npx vitest run lib/services/share-tokens.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add lib/services/share-tokens.ts lib/services/share-tokens.test.ts
git commit -m "feat(plan-10): share-tokens service (generateShareToken + resolveShareToken)"
git push origin main
```

---

## Task 5: Service — storefront (loadStorefrontView + computeTypeLabel)

**Files:**
- Create: `lib/services/storefront.ts`
- Create: `lib/services/storefront.test.ts`

- [ ] **Step 5.1: Write the failing test file**

Path: `lib/services/storefront.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeTypeLabel } from './storefront';

type Item = { kind: 'sealed' | 'card'; productType: string | null };
type Lot = { quantity: number; condition: string | null; isGraded: boolean };

describe('computeTypeLabel', () => {
  it('returns sealed productType when present', () => {
    const item: Item = { kind: 'sealed', productType: 'Elite Trainer Box' };
    expect(computeTypeLabel(item, [])).toBe('Elite Trainer Box');
  });

  it('returns "Sealed" when sealed item has no productType', () => {
    const item: Item = { kind: 'sealed', productType: null };
    expect(computeTypeLabel(item, [])).toBe('Sealed');
  });

  it('returns "Card" with majority condition for cards', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 2, condition: 'NM', isGraded: false },
      { quantity: 1, condition: 'LP', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · NM');
  });

  it('returns "Card · Mixed" when no clear majority condition', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: 'NM', isGraded: false },
      { quantity: 1, condition: 'LP', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · Mixed');
  });

  it('skips graded lots when computing card condition', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 5, condition: null, isGraded: true },
      { quantity: 1, condition: 'NM', isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card · NM');
  });

  it('returns "Card" when card has no non-graded lots', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: null, isGraded: true },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card');
  });

  it('returns "Card" when non-graded lots have no condition set', () => {
    const item: Item = { kind: 'card', productType: null };
    const lots: Lot[] = [
      { quantity: 1, condition: null, isGraded: false },
    ];
    expect(computeTypeLabel(item, lots)).toBe('Card');
  });
});
```

- [ ] **Step 5.2: Run test, verify it fails**

```bash
npx vitest run lib/services/storefront.test.ts
```

Expected: import error.

- [ ] **Step 5.3: Implement `computeTypeLabel` and the load-view query**

Path: `lib/services/storefront.ts`. Exact contents:

```ts
import 'server-only';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import type { CatalogItem } from '@/lib/db/schema/catalogItems';

// ---------------------------------------------------------------------------
// Pure helper
// ---------------------------------------------------------------------------

type TypeLabelItem = {
  kind: 'sealed' | 'card';
  productType: string | null;
};

type TypeLabelLot = {
  quantity: number;
  condition: string | null;
  isGraded: boolean;
};

/**
 * Compute the buyer-facing type label for a holding.
 *
 * Sealed: returns the catalog productType verbatim, falling back to
 *   "Sealed" if productType is null.
 *
 * Card: returns "Card · {majority_condition}" computed across non-graded
 *   lots by qty, "Card · Mixed" when conditions tie for the most qty, or
 *   bare "Card" when there are no non-graded lots OR no condition is set
 *   on any non-graded lot.
 *
 * Graded lots are intentionally excluded from card-condition reasoning
 * because graded items are not eligible for the storefront in v1.
 */
export function computeTypeLabel(item: TypeLabelItem, lots: TypeLabelLot[]): string {
  if (item.kind === 'sealed') {
    return item.productType ?? 'Sealed';
  }
  // Card path
  const rawLots = lots.filter((l) => !l.isGraded && l.condition != null);
  if (rawLots.length === 0) return 'Card';

  const totals = new Map<string, number>();
  for (const l of rawLots) {
    const c = l.condition!;
    totals.set(c, (totals.get(c) ?? 0) + l.quantity);
  }

  let topQty = -1;
  let topConditions: string[] = [];
  for (const [cond, qty] of totals) {
    if (qty > topQty) {
      topQty = qty;
      topConditions = [cond];
    } else if (qty === topQty) {
      topConditions.push(cond);
    }
  }

  if (topConditions.length !== 1) return 'Card · Mixed';
  return `Card · ${topConditions[0]}`;
}

// ---------------------------------------------------------------------------
// Public-route view loader
// ---------------------------------------------------------------------------

export type StorefrontViewItem = {
  catalogItemId: number;
  name: string;
  setName: string | null;
  imageUrl: string | null;
  imageStoragePath: string | null;
  typeLabel: string;
  qtyAvailable: number;
  askingPriceCents: number;
  updatedAt: Date;
};

export type StorefrontViewSummary = {
  items: StorefrontViewItem[];
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

/**
 * Load the storefront view for a given user. Joins catalog_items with
 * storefront_listings and the user's purchases (excluding soft-deleted
 * + graded lots), then filters out zero-qty rows.
 *
 * Returns items sorted by listing.updated_at DESC, name ASC.
 */
export async function loadStorefrontView(userId: string): Promise<StorefrontViewSummary> {
  // Step 1: load all listings for user.
  const listings = await db.query.storefrontListings.findMany({
    where: eq(schema.storefrontListings.userId, userId),
  });
  if (listings.length === 0) {
    return { items: [], itemsCount: 0, lastUpdatedAt: null };
  }

  const catalogIds = listings.map((l) => l.catalogItemId);

  // Step 2: load catalog rows for those ids.
  const catalogRows = await db.query.catalogItems.findMany({
    where: (ci, ops) => ops.inArray(ci.id, catalogIds),
  });
  const catalogById = new Map<number, CatalogItem>(catalogRows.map((c) => [c.id, c]));

  // Step 3: load this user's open purchase lots for those catalog ids.
  const lots = await db.query.purchases.findMany({
    where: (p, ops) =>
      ops.and(
        ops.eq(p.userId, userId),
        ops.inArray(p.catalogItemId, catalogIds),
        ops.isNull(p.deletedAt)
      ),
  });

  // Step 4: load consumption events to compute qty remaining per lot.
  const lotIds = lots.map((l) => l.id);
  const [rips, decompositions, sales] = await Promise.all([
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ sourcePurchaseId: number }>)
      : db.query.rips.findMany({
          where: (r, ops) => ops.inArray(r.sourcePurchaseId, lotIds),
        }),
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ sourcePurchaseId: number }>)
      : db.query.boxDecompositions.findMany({
          where: (d, ops) => ops.inArray(d.sourcePurchaseId, lotIds),
        }),
    lotIds.length === 0
      ? Promise.resolve([] as Array<{ purchaseId: number; quantity: number }>)
      : db.query.sales.findMany({
          where: (s, ops) => ops.inArray(s.purchaseId, lotIds),
        }),
  ]);

  const consumed = new Map<number, number>();
  for (const r of rips) {
    consumed.set(r.sourcePurchaseId, (consumed.get(r.sourcePurchaseId) ?? 0) + 1);
  }
  for (const d of decompositions) {
    consumed.set(d.sourcePurchaseId, (consumed.get(d.sourcePurchaseId) ?? 0) + 1);
  }
  for (const s of sales) {
    consumed.set(s.purchaseId, (consumed.get(s.purchaseId) ?? 0) + s.quantity);
  }

  // Step 5: aggregate per catalog item, raw (non-graded) only.
  const aggByCatalog = new Map<
    number,
    { qtyRaw: number; lotsForLabel: TypeLabelLot[] }
  >();
  for (const lot of lots) {
    const remaining = lot.quantity - (consumed.get(lot.id) ?? 0);
    if (remaining <= 0) continue;
    if (lot.isGraded) continue; // graded excluded from storefront
    const acc = aggByCatalog.get(lot.catalogItemId) ?? {
      qtyRaw: 0,
      lotsForLabel: [],
    };
    acc.qtyRaw += remaining;
    acc.lotsForLabel.push({
      quantity: remaining,
      condition: lot.condition,
      isGraded: lot.isGraded,
    });
    aggByCatalog.set(lot.catalogItemId, acc);
  }

  // Step 6: build items array, filtered by qtyRaw > 0.
  const items: StorefrontViewItem[] = [];
  for (const listing of listings) {
    const agg = aggByCatalog.get(listing.catalogItemId);
    if (!agg || agg.qtyRaw <= 0) continue;
    const item = catalogById.get(listing.catalogItemId);
    if (!item) continue;
    items.push({
      catalogItemId: listing.catalogItemId,
      name: item.name,
      setName: item.setName,
      imageUrl: item.imageUrl,
      imageStoragePath: item.imageStoragePath,
      typeLabel: computeTypeLabel(
        { kind: item.kind as 'sealed' | 'card', productType: item.productType },
        agg.lotsForLabel
      ),
      qtyAvailable: agg.qtyRaw,
      askingPriceCents: listing.askingPriceCents,
      updatedAt: listing.updatedAt,
    });
  }

  // Step 7: sort by updated_at DESC, name ASC tiebreaker.
  items.sort((a, b) => {
    const t = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (t !== 0) return t;
    return a.name.localeCompare(b.name);
  });

  const lastUpdatedAt =
    items.length === 0 ? null : items.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), items[0].updatedAt);

  return { items, itemsCount: items.length, lastUpdatedAt };
}
```

- [ ] **Step 5.4: Run tests, verify pass**

```bash
npx vitest run lib/services/storefront.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add lib/services/storefront.ts lib/services/storefront.test.ts
git commit -m "feat(plan-10): storefront service (computeTypeLabel + loadStorefrontView)"
git push origin main
```

---

## Task 6: API — share-tokens endpoints

**Files:**
- Create: `app/api/storefront/tokens/route.ts`
- Create: `app/api/storefront/tokens/route.test.ts`
- Create: `app/api/storefront/tokens/[id]/route.ts`
- Create: `app/api/storefront/tokens/[id]/route.test.ts`

- [ ] **Step 6.1: Write `route.ts` (GET + POST collection endpoint)**

Path: `app/api/storefront/tokens/route.ts`. Exact contents:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { eq, asc, isNull, desc } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { generateShareToken } from '@/lib/services/share-tokens';
import { createTokenInputSchema } from '@/lib/validation/storefront';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

export type ShareTokenDto = {
  id: number;
  token: string;
  label: string;
  kind: 'storefront';
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
  createdAt: string;
  revokedAt: string | null;
};

function toDto(row: ShareToken): ShareTokenDto {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    kind: row.kind as 'storefront',
    headerTitle: row.headerTitle,
    headerSubtitle: row.headerSubtitle,
    contactLine: row.contactLine,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db.query.shareTokens.findMany({
    where: eq(schema.shareTokens.userId, user.id),
    orderBy: [asc(schema.shareTokens.revokedAt), desc(schema.shareTokens.createdAt)],
  });

  // Drizzle puts NULL values *first* with asc — flip order so active (NULL revokedAt) come first.
  const active = rows.filter((r) => r.revokedAt == null);
  const revoked = rows.filter((r) => r.revokedAt != null);
  return NextResponse.json({
    tokens: [...active, ...revoked].map(toDto),
  });
}

export async function POST(req: Request) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = createTokenInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  // One retry on unique-index conflict.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateShareToken();
    try {
      const [row] = await db
        .insert(schema.shareTokens)
        .values({
          token,
          userId: user.id,
          kind: 'storefront',
          label: v.label ?? '',
          headerTitle: v.headerTitle ?? null,
          headerSubtitle: v.headerSubtitle ?? null,
          contactLine: v.contactLine ?? null,
        })
        .returning();
      return NextResponse.json({ token: toDto(row) }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (attempt === 0 && /share_tokens_token_(key|unique)/.test(message)) {
        continue; // collision, retry once
      }
      return NextResponse.json(
        { error: 'create_failed', message: message || 'unknown' },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ error: 'token_collision' }, { status: 500 });
}
```

- [ ] **Step 6.2: Write `route.test.ts` for the collection endpoint**

Path: `app/api/storefront/tokens/route.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockTokenFindMany = vi.fn();
const mockTokenInsertReturning = vi.fn();
const mockGenerate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/services/share-tokens', () => ({
  generateShareToken: () => mockGenerate(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findMany: (args: unknown) => mockTokenFindMany(args),
      },
    },
    insert: () => ({
      values: (v: unknown) => ({
        returning: () => mockTokenInsertReturning(v),
      }),
    }),
  },
  schema: {
    shareTokens: { userId: {}, revokedAt: {}, createdAt: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  asc: (x: unknown) => x,
  desc: (x: unknown) => x,
  isNull: (x: unknown) => x,
}));

import { GET, POST } from './route';

describe('GET /api/storefront/tokens', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindMany.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns active tokens first, revoked after', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindMany.mockResolvedValueOnce([
      {
        id: 1,
        token: 'aaa',
        userId: 'u1',
        kind: 'storefront',
        label: 'old',
        headerTitle: null,
        headerSubtitle: null,
        contactLine: null,
        createdAt: new Date('2026-01-01'),
        revokedAt: new Date('2026-02-01'),
      },
      {
        id: 2,
        token: 'bbb',
        userId: 'u1',
        kind: 'storefront',
        label: 'fresh',
        headerTitle: null,
        headerSubtitle: null,
        contactLine: null,
        createdAt: new Date('2026-04-01'),
        revokedAt: null,
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokens).toHaveLength(2);
    expect(body.tokens[0].token).toBe('bbb'); // active first
    expect(body.tokens[1].token).toBe('aaa'); // revoked after
  });
});

describe('POST /api/storefront/tokens', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenInsertReturning.mockReset();
    mockGenerate.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(new Request('http://test', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ label: 'x'.repeat(500) }),
      })
    );
    expect(res.status).toBe(422);
  });

  it('inserts and returns the new token DTO', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockGenerate.mockReturnValueOnce('newtoken123');
    mockTokenInsertReturning.mockResolvedValueOnce([
      {
        id: 1,
        token: 'newtoken123',
        userId: 'u1',
        kind: 'storefront',
        label: 'FB Marketplace',
        headerTitle: 'Sealed Pokémon',
        headerSubtitle: null,
        contactLine: 'Message me on Marketplace',
        createdAt: new Date('2026-05-02'),
        revokedAt: null,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({
          label: 'FB Marketplace',
          headerTitle: 'Sealed Pokémon',
          contactLine: 'Message me on Marketplace',
        }),
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token.token).toBe('newtoken123');
    expect(body.token.label).toBe('FB Marketplace');
    expect(body.token.contactLine).toBe('Message me on Marketplace');
  });

  it('retries once on unique-index collision then succeeds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockGenerate.mockReturnValueOnce('dup1').mockReturnValueOnce('uniq2');
    mockTokenInsertReturning
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "share_tokens_token_key"'))
      .mockResolvedValueOnce([
        {
          id: 2,
          token: 'uniq2',
          userId: 'u1',
          kind: 'storefront',
          label: '',
          headerTitle: null,
          headerSubtitle: null,
          contactLine: null,
          createdAt: new Date(),
          revokedAt: null,
        },
      ]);
    const res = await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({}) })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token.token).toBe('uniq2');
    expect(mockTokenInsertReturning).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 6.3: Write `[id]/route.ts` (PATCH + DELETE)**

Path: `app/api/storefront/tokens/[id]/route.ts`. Exact contents:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { updateTokenInputSchema } from '@/lib/validation/storefront';
import type { ShareToken } from '@/lib/db/schema/shareTokens';

type Ctx = { params: Promise<{ id: string }> };

export type ShareTokenDto = {
  id: number;
  token: string;
  label: string;
  kind: 'storefront';
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
  createdAt: string;
  revokedAt: string | null;
};

function toDto(row: ShareToken): ShareTokenDto {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    kind: row.kind as 'storefront',
    headerTitle: row.headerTitle,
    headerSubtitle: row.headerSubtitle,
    contactLine: row.contactLine,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const tokenId = parseId(id);
  if (tokenId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = updateTokenInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const existing = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.id, tokenId),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.userId !== user.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const updates: Partial<typeof schema.shareTokens.$inferInsert> = {};
  if (v.label !== undefined) updates.label = v.label;
  if (v.headerTitle !== undefined) updates.headerTitle = v.headerTitle;
  if (v.headerSubtitle !== undefined) updates.headerSubtitle = v.headerSubtitle;
  if (v.contactLine !== undefined) updates.contactLine = v.contactLine;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ token: toDto(existing) });
  }

  const [updated] = await db
    .update(schema.shareTokens)
    .set(updates)
    .where(eq(schema.shareTokens.id, tokenId))
    .returning();

  return NextResponse.json({ token: toDto(updated) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const tokenId = parseId(id);
  if (tokenId == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const existing = await db.query.shareTokens.findFirst({
    where: eq(schema.shareTokens.id, tokenId),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.userId !== user.id)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (existing.revokedAt != null) {
    return NextResponse.json({ token: toDto(existing) });
  }

  const [updated] = await db
    .update(schema.shareTokens)
    .set({ revokedAt: new Date() })
    .where(eq(schema.shareTokens.id, tokenId))
    .returning();

  return NextResponse.json({ token: toDto(updated) });
}
```

- [ ] **Step 6.4: Write `[id]/route.test.ts`**

Path: `app/api/storefront/tokens/[id]/route.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockTokenFindFirst = vi.fn();
const mockTokenUpdateReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      shareTokens: {
        findFirst: (args: unknown) => mockTokenFindFirst(args),
      },
    },
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => mockTokenUpdateReturning(),
        }),
      }),
    }),
  },
  schema: {
    shareTokens: { id: {}, userId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ kind: 'eq', a, b }),
  and: (...c: unknown[]) => c,
}));

import { PATCH, DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const baseRow = {
  id: 7,
  token: 'abc',
  userId: 'u1',
  kind: 'storefront' as const,
  label: 'old',
  headerTitle: null,
  headerSubtitle: null,
  contactLine: null,
  createdAt: new Date('2026-04-01'),
  revokedAt: null,
};

describe('PATCH /api/storefront/tokens/[id]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindFirst.mockReset();
    mockTokenUpdateReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when token does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(null);
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('999')
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when token belongs to another user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce({ ...baseRow, userId: 'u2' });
    const res = await PATCH(
      new Request('http://test', { method: 'PATCH', body: '{}' }),
      ctx('7')
    );
    expect(res.status).toBe(403);
  });

  it('updates label and returns the new DTO', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(baseRow);
    mockTokenUpdateReturning.mockResolvedValueOnce([{ ...baseRow, label: 'fresh' }]);
    const res = await PATCH(
      new Request('http://test', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'fresh' }),
      }),
      ctx('7')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.label).toBe('fresh');
  });
});

describe('DELETE /api/storefront/tokens/[id]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockTokenFindFirst.mockReset();
    mockTokenUpdateReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('1'));
    expect(res.status).toBe(401);
  });

  it('soft-revokes an active token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockTokenFindFirst.mockResolvedValueOnce(baseRow);
    const revokedAt = new Date('2026-05-02T12:00:00Z');
    mockTokenUpdateReturning.mockResolvedValueOnce([{ ...baseRow, revokedAt }]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.revokedAt).toBe(revokedAt.toISOString());
  });

  it('returns the existing row when already revoked (idempotent)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const already = { ...baseRow, revokedAt: new Date('2026-04-15') };
    mockTokenFindFirst.mockResolvedValueOnce(already);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token.revokedAt).toBe(already.revokedAt.toISOString());
    expect(mockTokenUpdateReturning).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.5: Run all token tests**

```bash
npx vitest run app/api/storefront/tokens
```

Expected: all tests pass.

- [ ] **Step 6.6: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6.7: Commit**

```bash
git add app/api/storefront/tokens
git commit -m "feat(plan-10): /api/storefront/tokens (GET/POST/PATCH/DELETE)"
git push origin main
```

---

## Task 7: API — listings endpoints

**Files:**
- Create: `app/api/storefront/listings/route.ts`
- Create: `app/api/storefront/listings/route.test.ts`
- Create: `app/api/storefront/listings/[catalogItemId]/route.ts`
- Create: `app/api/storefront/listings/[catalogItemId]/route.test.ts`

- [ ] **Step 7.1: Write the collection route**

Path: `app/api/storefront/listings/route.ts`. Exact contents:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';
import { upsertListingInputSchema } from '@/lib/validation/storefront';
import { loadStorefrontView } from '@/lib/services/storefront';

export type StorefrontListingDto = {
  catalogItemId: number;
  askingPriceCents: number;
  createdAt: string;
  updatedAt: string;
  item: {
    id: number;
    name: string;
    setName: string | null;
    kind: 'sealed' | 'card';
    productType: string | null;
    imageUrl: string | null;
    imageStoragePath: string | null;
    lastMarketCents: number | null;
    lastMarketAt: string | null;
  };
  qtyHeldRaw: number;
  typeLabel: string;
};

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Reuse loadStorefrontView for the qty + typeLabel computation, but join
  // the full catalog row for admin-table display fields.
  const view = await loadStorefrontView(user.id);

  const allListings = await db.query.storefrontListings.findMany({
    where: eq(schema.storefrontListings.userId, user.id),
  });
  const itemIds = allListings.map((l) => l.catalogItemId);
  const catalogRows = itemIds.length
    ? await db.query.catalogItems.findMany({
        where: (ci, ops) => ops.inArray(ci.id, itemIds),
      })
    : [];
  const catalogById = new Map(catalogRows.map((c) => [c.id, c]));

  // Map view items by catalog id for quick qty/typeLabel lookup.
  const viewByCatalog = new Map(view.items.map((v) => [v.catalogItemId, v]));

  const listings: StorefrontListingDto[] = allListings.map((l) => {
    const item = catalogById.get(l.catalogItemId)!;
    const v = viewByCatalog.get(l.catalogItemId);
    return {
      catalogItemId: l.catalogItemId,
      askingPriceCents: l.askingPriceCents,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      item: {
        id: item.id,
        name: item.name,
        setName: item.setName,
        kind: item.kind as 'sealed' | 'card',
        productType: item.productType,
        imageUrl: item.imageUrl,
        imageStoragePath: item.imageStoragePath,
        lastMarketCents: item.lastMarketCents,
        lastMarketAt: item.lastMarketAt ? item.lastMarketAt.toISOString() : null,
      },
      qtyHeldRaw: v?.qtyAvailable ?? 0,
      typeLabel: v?.typeLabel ?? (item.kind === 'sealed' ? item.productType ?? 'Sealed' : 'Card'),
    };
  });

  // Sort by listing.updatedAt DESC.
  listings.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ listings });
}

export async function POST(req: Request) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = upsertListingInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const v = parsed.data;

  const item = await db.query.catalogItems.findFirst({
    where: eq(schema.catalogItems.id, v.catalogItemId),
    columns: { id: true },
  });
  if (!item) return NextResponse.json({ error: 'catalog_item_not_found' }, { status: 404 });

  const [row] = await db
    .insert(schema.storefrontListings)
    .values({
      userId: user.id,
      catalogItemId: v.catalogItemId,
      askingPriceCents: v.askingPriceCents,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.storefrontListings.userId, schema.storefrontListings.catalogItemId],
      set: {
        askingPriceCents: sql`excluded.asking_price_cents`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning();

  return NextResponse.json({
    listing: {
      catalogItemId: row.catalogItemId,
      askingPriceCents: row.askingPriceCents,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  });
}
```

- [ ] **Step 7.2: Write `route.test.ts` for collection**

Path: `app/api/storefront/listings/route.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockListingsFindMany = vi.fn();
const mockCatalogFindMany = vi.fn();
const mockCatalogFindFirst = vi.fn();
const mockUpsertReturning = vi.fn();
const mockLoadView = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/services/storefront', () => ({
  loadStorefrontView: (userId: string) => mockLoadView(userId),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      storefrontListings: { findMany: (a: unknown) => mockListingsFindMany(a) },
      catalogItems: {
        findFirst: (a: unknown) => mockCatalogFindFirst(a),
        findMany: (a: unknown) => mockCatalogFindMany(a),
      },
    },
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: () => mockUpsertReturning(),
        }),
      }),
    }),
  },
  schema: {
    storefrontListings: { userId: {}, catalogItemId: {}, askingPriceCents: {}, updatedAt: {} },
    catalogItems: { id: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  sql: ((s: TemplateStringsArray) => s.raw.join('')) as unknown,
}));

import { GET, POST } from './route';

describe('GET /api/storefront/listings', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockListingsFindMany.mockReset();
    mockCatalogFindMany.mockReset();
    mockLoadView.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns listings joined to catalog and view fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockListingsFindMany.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: new Date('2026-04-01'),
        updatedAt: new Date('2026-05-01'),
      },
    ]);
    mockCatalogFindMany.mockResolvedValueOnce([
      {
        id: 100,
        name: 'SV151 ETB',
        setName: 'Scarlet & Violet 151',
        kind: 'sealed',
        productType: 'Elite Trainer Box',
        imageUrl: null,
        imageStoragePath: null,
        lastMarketCents: 5499,
        lastMarketAt: new Date('2026-05-01'),
      },
    ]);
    mockLoadView.mockResolvedValueOnce({
      items: [
        {
          catalogItemId: 100,
          name: 'SV151 ETB',
          setName: 'Scarlet & Violet 151',
          imageUrl: null,
          imageStoragePath: null,
          typeLabel: 'Elite Trainer Box',
          qtyAvailable: 3,
          askingPriceCents: 6000,
          updatedAt: new Date('2026-05-01'),
        },
      ],
      itemsCount: 1,
      lastUpdatedAt: new Date('2026-05-01'),
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0].catalogItemId).toBe(100);
    expect(body.listings[0].askingPriceCents).toBe(6000);
    expect(body.listings[0].qtyHeldRaw).toBe(3);
    expect(body.listings[0].typeLabel).toBe('Elite Trainer Box');
  });
});

describe('POST /api/storefront/listings', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockCatalogFindFirst.mockReset();
    mockUpsertReturning.mockReset();
  });

  it('returns 422 on invalid body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', { method: 'POST', body: JSON.stringify({ catalogItemId: -1, askingPriceCents: 100 }) })
    );
    expect(res.status).toBe(422);
  });

  it('returns 422 when asking price exceeds the cap', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 1, askingPriceCents: 100_000_001 }),
      })
    );
    expect(res.status).toBe(422);
  });

  it('returns 404 when catalog item missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce(null);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 999, askingPriceCents: 6000 }),
      })
    );
    expect(res.status).toBe(404);
  });

  it('upserts the listing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCatalogFindFirst.mockResolvedValueOnce({ id: 100 });
    const now = new Date();
    mockUpsertReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await POST(
      new Request('http://test', {
        method: 'POST',
        body: JSON.stringify({ catalogItemId: 100, askingPriceCents: 6000 }),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.askingPriceCents).toBe(6000);
  });
});
```

- [ ] **Step 7.3: Write the per-id DELETE route**

Path: `app/api/storefront/listings/[catalogItemId]/route.ts`. Exact contents:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient } from '@/lib/supabase/server';
import { db, schema } from '@/lib/db/client';

type Ctx = { params: Promise<{ catalogItemId: string }> };

async function authOrError() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await authOrError();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { catalogItemId } = await ctx.params;
  const id = parseId(catalogItemId);
  if (id == null) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const [deleted] = await db
    .delete(schema.storefrontListings)
    .where(
      and(
        eq(schema.storefrontListings.userId, user.id),
        eq(schema.storefrontListings.catalogItemId, id)
      )
    )
    .returning();

  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json({
    listing: {
      catalogItemId: deleted.catalogItemId,
      askingPriceCents: deleted.askingPriceCents,
      createdAt: deleted.createdAt.toISOString(),
      updatedAt: deleted.updatedAt.toISOString(),
    },
  });
}
```

- [ ] **Step 7.4: Write `[catalogItemId]/route.test.ts`**

Path: `app/api/storefront/listings/[catalogItemId]/route.test.ts`. Exact contents:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockDeleteReturning = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: () => mockDeleteReturning(),
      }),
    }),
  },
  schema: {
    storefrontListings: { userId: {}, catalogItemId: {} },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  and: (...c: unknown[]) => c,
}));

import { DELETE } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ catalogItemId: id }) });

describe('DELETE /api/storefront/listings/[catalogItemId]', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockDeleteReturning.mockReset();
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on bad id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('not-a-num'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no listing matched', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockDeleteReturning.mockResolvedValueOnce([]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(404);
  });

  it('returns the deleted listing DTO on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    const now = new Date();
    mockDeleteReturning.mockResolvedValueOnce([
      {
        userId: 'u1',
        catalogItemId: 100,
        askingPriceCents: 6000,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const res = await DELETE(new Request('http://test', { method: 'DELETE' }), ctx('100'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listing.catalogItemId).toBe(100);
    expect(body.listing.askingPriceCents).toBe(6000);
  });
});
```

- [ ] **Step 7.5: Run all listings tests**

```bash
npx vitest run app/api/storefront/listings
```

Expected: all tests pass.

- [ ] **Step 7.6: Run typecheck**

```bash
npm run typecheck
```

- [ ] **Step 7.7: Commit**

```bash
git add app/api/storefront/listings
git commit -m "feat(plan-10): /api/storefront/listings (GET/POST + per-id DELETE)"
git push origin main
```

---

## Task 8: Holding detail surface — surface `storefrontListing`

**Files:**
- Modify: `lib/api/holdingDetailDto.ts`
- Modify: `app/api/holdings/[catalogItemId]/route.ts`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/page.tsx`

- [ ] **Step 8.1: Read the current holding-detail DTO**

```bash
cat lib/api/holdingDetailDto.ts | head -80
```

This is to confirm the existing shape so the new optional `storefrontListing` field slots in cleanly. Open the file in your editor; identify the `HoldingDetailDto` type and the function that builds it (commonly `buildHoldingDetailDto` or scattered in the route + SSR).

- [ ] **Step 8.2: Add the field to `HoldingDetailDto`**

In `lib/api/holdingDetailDto.ts`, locate the `HoldingDetailDto` type. Add the new field at the bottom of the type body (alongside `lots`, `rips`, `decompositions`, `salesEvents`, etc.):

```ts
export type HoldingDetailDto = {
  // ... existing fields preserved ...
  storefrontListing: {
    askingPriceCents: number;
    updatedAt: string;
  } | null;
};
```

If the file exports any builder (`buildHoldingDetailDto` or similar), add a `storefrontListing` parameter that defaults to `null` and assigns it through. If no builder exists, callers will assemble the object directly — see the next two sub-steps.

- [ ] **Step 8.3: Update the route handler `app/api/holdings/[catalogItemId]/route.ts`**

In the GET handler, after the existing data-loading block (right before the response is constructed), add the listing lookup and include it on the response. Code to add:

```ts
import { storefrontListings } from '@/lib/db/schema/storefrontListings';
// (add to existing schema imports if not already)

// ... after user is authenticated and catalogItem is loaded ...

const listing = await db.query.storefrontListings.findFirst({
  where: (sl, ops) =>
    ops.and(
      ops.eq(sl.userId, user.id),
      ops.eq(sl.catalogItemId, numericId)
    ),
});

const storefrontListingDto = listing
  ? {
      askingPriceCents: listing.askingPriceCents,
      updatedAt: listing.updatedAt.toISOString(),
    }
  : null;

// Then in the response body, add:
//   storefrontListing: storefrontListingDto,
```

In the response shape: locate the existing `NextResponse.json({...})` and add `storefrontListing: storefrontListingDto` to the response object. Also ensure the empty-holding fallback path (when no lots) sets `storefrontListing: null`.

- [ ] **Step 8.4: Update SSR `app/(authenticated)/holdings/[catalogItemId]/page.tsx`**

Apply the same change. After the existing data fetches, add:

```ts
const storefrontListing = await db.query.storefrontListings.findFirst({
  where: (sl, ops) =>
    ops.and(
      ops.eq(sl.userId, user.id),
      ops.eq(sl.catalogItemId, numericId)
    ),
});

const storefrontListingDto = storefrontListing
  ? {
      askingPriceCents: storefrontListing.askingPriceCents,
      updatedAt: storefrontListing.updatedAt.toISOString(),
    }
  : null;
```

Then include `storefrontListing: storefrontListingDto` on the DTO passed to `<HoldingDetailClient initial={...} />`.

- [ ] **Step 8.5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 8.6: Run existing holding tests**

```bash
npx vitest run app/api/holdings
```

Expected: tests still pass (existing tests don't reference `storefrontListing`, so the addition is non-breaking).

- [ ] **Step 8.7: Commit**

```bash
git add lib/api/holdingDetailDto.ts app/api/holdings/[catalogItemId]/route.ts "app/(authenticated)/holdings/[catalogItemId]/page.tsx"
git commit -m "feat(plan-10): surface storefrontListing on holding detail DTO"
git push origin main
```

---

## Task 9: TanStack Query hooks

**Files:**
- Create: `lib/query/hooks/useStorefront.ts`

- [ ] **Step 9.1: Create the hooks file**

Path: `lib/query/hooks/useStorefront.ts`. Exact contents:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShareTokenDto } from '@/app/api/storefront/tokens/route';
import type { StorefrontListingDto } from '@/app/api/storefront/listings/route';

const TOKENS_KEY = ['storefront', 'tokens'] as const;
const LISTINGS_KEY = ['storefront', 'listings'] as const;
const HOLDINGS_KEY_PREFIX = ['holdings'] as const;
const HOLDING_KEY_PREFIX = ['holding'] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const e = new Error(`fetch failed: ${res.status}`);
    (e as Error & { status?: number; body?: unknown }).status = res.status;
    (e as Error & { status?: number; body?: unknown }).body = body;
    throw e;
  }
  return (await res.json()) as T;
}

// ---------------- Tokens ----------------

export function useShareTokens() {
  return useQuery({
    queryKey: TOKENS_KEY,
    queryFn: () => jsonFetch<{ tokens: ShareTokenDto[] }>('/api/storefront/tokens'),
  });
}

export type CreateShareTokenInput = {
  label?: string;
  headerTitle?: string | null;
  headerSubtitle?: string | null;
  contactLine?: string | null;
};

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShareTokenInput) =>
      jsonFetch<{ token: ShareTokenDto }>('/api/storefront/tokens', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

export type UpdateShareTokenInput = CreateShareTokenInput;

export function useUpdateShareToken(tokenId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShareTokenInput) =>
      jsonFetch<{ token: ShareTokenDto }>(`/api/storefront/tokens/${tokenId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: number) =>
      jsonFetch<{ token: ShareTokenDto }>(`/api/storefront/tokens/${tokenId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

// ---------------- Listings ----------------

export function useStorefrontListings() {
  return useQuery({
    queryKey: LISTINGS_KEY,
    queryFn: () =>
      jsonFetch<{ listings: StorefrontListingDto[] }>('/api/storefront/listings'),
  });
}

export type UpsertListingInput = { catalogItemId: number; askingPriceCents: number };

export function useUpsertStorefrontListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertListingInput) =>
      jsonFetch<{
        listing: { catalogItemId: number; askingPriceCents: number; createdAt: string; updatedAt: string };
      }>('/api/storefront/listings', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: LISTINGS_KEY });
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY_PREFIX });
      qc.invalidateQueries({ queryKey: [...HOLDING_KEY_PREFIX, variables.catalogItemId] });
    },
  });
}

export function useRemoveStorefrontListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (catalogItemId: number) =>
      jsonFetch<{
        listing: { catalogItemId: number; askingPriceCents: number; createdAt: string; updatedAt: string };
      }>(`/api/storefront/listings/${catalogItemId}`, { method: 'DELETE' }),
    onSuccess: (_data, catalogItemId) => {
      qc.invalidateQueries({ queryKey: LISTINGS_KEY });
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY_PREFIX });
      qc.invalidateQueries({ queryKey: [...HOLDING_KEY_PREFIX, catalogItemId] });
    },
  });
}
```

- [ ] **Step 9.2: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. (The route DTOs in `app/api/.../route.ts` need to export `ShareTokenDto` and `StorefrontListingDto` types; these are already exported in Tasks 6 and 7.)

- [ ] **Step 9.3: Commit**

```bash
git add lib/query/hooks/useStorefront.ts
git commit -m "feat(plan-10): TanStack Query hooks for storefront tokens + listings"
git push origin main
```

---

## Task 10: AskingPriceDialog + SetAskingPriceCta

**Files:**
- Create: `components/storefront/AskingPriceDialog.tsx`
- Create: `components/storefront/AskingPriceDialog.test.tsx`
- Create: `components/storefront/SetAskingPriceCta.tsx`

- [ ] **Step 10.1: Create the dialog component**

Path: `components/storefront/AskingPriceDialog.tsx`. Exact contents:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormLabel,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dollarsStringToCents } from '@/lib/utils/cents';
import {
  useUpsertStorefrontListing,
  useRemoveStorefrontListing,
} from '@/lib/query/hooks/useStorefront';

export type AskingPriceDialogProps = {
  catalogItemId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCents?: number | null;
};

export function AskingPriceDialog({
  catalogItemId,
  open,
  onOpenChange,
  initialCents,
}: AskingPriceDialogProps) {
  const [dollars, setDollars] = useState<string>(
    initialCents != null ? (initialCents / 100).toFixed(2) : ''
  );
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertStorefrontListing();
  const remove = useRemoveStorefrontListing();

  useEffect(() => {
    if (open) {
      setDollars(initialCents != null ? (initialCents / 100).toFixed(2) : '');
      setError(null);
    }
  }, [open, initialCents]);

  async function submit() {
    setError(null);
    const cents = dollarsStringToCents(dollars);
    if (cents == null || cents < 0) {
      setError('Enter a valid price like 12.34');
      return;
    }
    if (cents > 100_000_000) {
      setError('Asking price cannot exceed $1,000,000');
      return;
    }
    try {
      await upsert.mutateAsync({ catalogItemId, askingPriceCents: cents });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asking price');
    }
  }

  async function removeFromStorefront() {
    setError(null);
    try {
      await remove.mutateAsync(catalogItemId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove listing');
    }
  }

  const isListed = initialCents != null;
  const pending = upsert.isPending || remove.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader
          title={isListed ? 'Edit asking price' : 'Add to storefront'}
          sub="Buyers see this price on your public storefront"
        />
        <FormSection>
          <FormRow>
            <div className="w-full">
              <label
                htmlFor="asking-price"
                className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
              >
                Asking price · per unit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="asking-price"
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Buyers see this price next to qty available. Out-of-stock items hide automatically.
              </p>
              {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          {isListed && (
            <Button
              type="button"
              variant="outline"
              onClick={removeFromStorefront}
              disabled={pending}
              className="mr-auto text-rose-500"
            >
              Remove from storefront
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {upsert.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10.2: Create the CTA component**

Path: `components/storefront/SetAskingPriceCta.tsx`. Exact contents:

```tsx
'use client';
import { useState } from 'react';
import { AskingPriceDialog } from './AskingPriceDialog';
import { formatCents } from '@/lib/utils/format';

export type SetAskingPriceCtaProps = {
  catalogItemId: number;
  initialCents: number | null;
  qtyHeldRaw: number;
};

export function SetAskingPriceCta({ catalogItemId, initialCents, qtyHeldRaw }: SetAskingPriceCtaProps) {
  const [open, setOpen] = useState(false);

  // If no raw qty (only graded held or nothing held), hide the CTA entirely.
  if (qtyHeldRaw <= 0 && initialCents == null) return null;

  const label =
    initialCents != null
      ? `Edit asking price · ${formatCents(initialCents)}`
      : 'Add to storefront';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-4 py-[9px] rounded-2xl border border-divider bg-vault text-[12px] font-mono text-meta hover:text-text hover:bg-hover transition-colors"
      >
        {label}
      </button>
      <AskingPriceDialog
        catalogItemId={catalogItemId}
        open={open}
        onOpenChange={setOpen}
        initialCents={initialCents}
      />
    </>
  );
}
```

- [ ] **Step 10.3: Create a happy-dom test for the dialog**

Path: `components/storefront/AskingPriceDialog.test.tsx`. Exact contents:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpsert = vi.fn();
const mockRemove = vi.fn();

vi.mock('@/lib/query/hooks/useStorefront', () => ({
  useUpsertStorefrontListing: () => ({
    mutateAsync: mockUpsert,
    isPending: false,
  }),
  useRemoveStorefrontListing: () => ({
    mutateAsync: mockRemove,
    isPending: false,
  }),
}));

import { AskingPriceDialog } from './AskingPriceDialog';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AskingPriceDialog', () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockRemove.mockReset();
  });

  it('shows "Add to storefront" title when not listed', () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialCents={null}
      />
    );
    expect(screen.getByText(/Add to storefront/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Remove from storefront/i })).toBeNull();
  });

  it('shows "Edit asking price" title and Remove button when listed', () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialCents={6000}
      />
    );
    expect(screen.getByText(/Edit asking price/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove from storefront/i })).toBeTruthy();
  });

  it('upserts on Save', async () => {
    mockUpsert.mockResolvedValueOnce({ listing: {} });
    wrap(
      <AskingPriceDialog
        catalogItemId={42}
        open={true}
        onOpenChange={() => {}}
        initialCents={null}
      />
    );
    const input = screen.getByLabelText(/Asking price/i);
    fireEvent.change(input, { target: { value: '60.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    // Wait a tick for the async submit
    await new Promise((r) => setTimeout(r, 0));
    expect(mockUpsert).toHaveBeenCalledWith({ catalogItemId: 42, askingPriceCents: 6000 });
  });

  it('rejects asking price above the cap', async () => {
    wrap(
      <AskingPriceDialog
        catalogItemId={1}
        open={true}
        onOpenChange={() => {}}
        initialCents={null}
      />
    );
    const input = screen.getByLabelText(/Asking price/i);
    fireEvent.change(input, { target: { value: '1000001.00' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText(/cannot exceed \$1,000,000/i)).toBeTruthy();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 10.4: Run tests**

```bash
npx vitest run components/storefront/AskingPriceDialog.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 10.5: Commit**

```bash
git add components/storefront/AskingPriceDialog.tsx components/storefront/AskingPriceDialog.test.tsx components/storefront/SetAskingPriceCta.tsx
git commit -m "feat(plan-10): AskingPriceDialog + SetAskingPriceCta"
git push origin main
```

---

## Task 11: Wire `<SetAskingPriceCta>` into HoldingDetailClient

**Files:**
- Create: `app/(authenticated)/holdings/[catalogItemId]/StorefrontIntegration.tsx`
- Modify: `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`

- [ ] **Step 11.1: Create a thin integration component**

Path: `app/(authenticated)/holdings/[catalogItemId]/StorefrontIntegration.tsx`. Exact contents:

```tsx
'use client';
import { SetAskingPriceCta } from '@/components/storefront/SetAskingPriceCta';

export type StorefrontIntegrationProps = {
  catalogItemId: number;
  storefrontListing: { askingPriceCents: number; updatedAt: string } | null;
  qtyHeldRaw: number;
};

export function StorefrontIntegration({
  catalogItemId,
  storefrontListing,
  qtyHeldRaw,
}: StorefrontIntegrationProps) {
  return (
    <SetAskingPriceCta
      catalogItemId={catalogItemId}
      initialCents={storefrontListing?.askingPriceCents ?? null}
      qtyHeldRaw={qtyHeldRaw}
    />
  );
}
```

- [ ] **Step 11.2: Wire it into `HoldingDetailClient.tsx`**

Open `app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx`. Find the existing CTA cluster — it's the row that contains `<LogPurchaseCta>`, `<SetManualPriceCta>`, etc. (search for the existing `<button>` with `Set manual price` label, or the import of `SetManualPriceDialog`).

Add the import near the top:

```tsx
import { StorefrontIntegration } from './StorefrontIntegration';
```

In the JSX, immediately after the manual-price button (or wherever the CTA cluster lives), render:

```tsx
<StorefrontIntegration
  catalogItemId={item.id}
  storefrontListing={dto.storefrontListing}
  qtyHeldRaw={summary.qtyHeldTracked + summary.qtyHeldCollection - (/* graded qty: see below */ 0)}
/>
```

Note: `qtyHeldRaw` should be "qty held that is non-graded." Currently the holding summary exposes `qtyHeldTracked` + `qtyHeldCollection` but not a graded breakdown directly. For v1, since this user does not have graded lots in his typical sealed inventory, pass:

```tsx
qtyHeldRaw={(summary.qtyHeldTracked ?? 0) + (summary.qtyHeldCollection ?? 0)}
```

If a future plan introduces a `qtyHeldGraded` summary field, switch to subtracting it. Add a `// TODO(plan-graded-storefront)` comment at the call site.

- [ ] **Step 11.3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 11.4: Run holding-related tests**

```bash
npx vitest run app/api/holdings components/holdings
```

Expected: all existing holding tests still pass.

- [ ] **Step 11.5: Commit**

```bash
git add "app/(authenticated)/holdings/[catalogItemId]/StorefrontIntegration.tsx" "app/(authenticated)/holdings/[catalogItemId]/HoldingDetailClient.tsx"
git commit -m "feat(plan-10): wire SetAskingPriceCta into HoldingDetailClient"
git push origin main
```

---

## Task 12: Public route — white-label layout + page + 404/410 states

**Files:**
- Create: `app/storefront/[token]/layout.tsx`
- Create: `app/storefront/[token]/icon.tsx`
- Create: `app/storefront/[token]/page.tsx`
- Create: `components/storefront/StorefrontUnavailable.tsx`

- [ ] **Step 12.1: Create the white-label icon override**

Path: `app/storefront/[token]/icon.tsx`. Exact contents:

```tsx
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Transparent 32x32 favicon. Suppresses the default app/favicon.ico
// inheritance so the public route bears no Pokestonks brand mark.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />
    ),
    { ...size }
  );
}
```

- [ ] **Step 12.2: Create the public layout**

Path: `app/storefront/[token]/layout.tsx`. Exact contents:

```tsx
import 'server-only';

// White-label public-route layout. No app chrome, no nav, no auth UI.
// Inherits <html> + <body> from app/layout.tsx (which only includes
// QueryProvider + Toaster — both invisible until used). The page-level
// generateMetadata() in page.tsx overrides the <title> to drop the app name.
export default function StorefrontPublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-text">{children}</div>;
}
```

- [ ] **Step 12.3: Create the unavailable component**

Path: `components/storefront/StorefrontUnavailable.tsx`. Exact contents:

```tsx
export function StorefrontUnavailable({
  reason,
}: {
  reason: 'not_found' | 'revoked';
}) {
  const headline = reason === 'revoked' ? 'This storefront has been taken down.' : "This storefront isn't available.";
  const sub =
    reason === 'revoked'
      ? 'The seller revoked this link. Reach out to them directly if you were trying to buy something.'
      : 'The link may be wrong, or the seller may not have created a storefront yet.';
  return (
    <div className="mx-auto w-full max-w-[600px] px-6 py-16 text-center">
      <h1 className="text-[22px] font-medium tracking-tight">{headline}</h1>
      <p className="mt-3 text-[14px] text-meta">{sub}</p>
    </div>
  );
}
```

- [ ] **Step 12.4: Create the page**

Path: `app/storefront/[token]/page.tsx`. Exact contents:

```tsx
import 'server-only';
import type { Metadata } from 'next';
import { resolveShareToken } from '@/lib/services/share-tokens';
import { loadStorefrontView } from '@/lib/services/storefront';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { StorefrontUnavailable } from '@/components/storefront/StorefrontUnavailable';
import { StorefrontHeader } from '@/components/storefront/StorefrontHeader';
import { StorefrontGrid } from '@/components/storefront/StorefrontGrid';

type Params = { token: string };
type Props = { params: Promise<Params> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const row = await resolveShareToken(token, 'storefront').catch(() => null);
  // If the token row exists (active or revoked), prefer its title.
  // For not-found we fall back to a neutral title.
  let title = 'Sealed Pokémon';
  if (row?.headerTitle) title = row.headerTitle;
  // No app name. No "| Pokestonks" suffix. Hard rule.
  return {
    title,
    icons: { icon: undefined },
    other: { generator: '' },
  };
}

export default async function StorefrontPublicPage({ params }: Props) {
  const { token } = await params;

  const row = await resolveShareToken(token, 'storefront');

  // Not-found OR wrong-kind path (resolveShareToken returns null in both cases).
  // We can distinguish "exists but revoked" by a separate lookup so the buyer
  // gets the more accurate "taken down" copy when applicable.
  if (!row) {
    const explicit = await db.query.shareTokens.findFirst({
      where: eq(schema.shareTokens.token, token),
    });
    if (explicit && explicit.kind === 'storefront' && explicit.revokedAt != null) {
      return <StorefrontUnavailable reason="revoked" />;
    }
    return <StorefrontUnavailable reason="not_found" />;
  }

  const view = await loadStorefrontView(row.userId);

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-8">
      <StorefrontHeader
        title={row.headerTitle ?? 'Sealed Pokémon'}
        subtitle={row.headerSubtitle}
        contactLine={row.contactLine}
        itemsCount={view.itemsCount}
        lastUpdatedAt={view.lastUpdatedAt}
      />
      {view.items.length === 0 ? (
        <p className="mt-12 text-center text-[14px] text-meta">No items currently available.</p>
      ) : (
        <div className="mt-8">
          <StorefrontGrid items={view.items} />
        </div>
      )}
    </main>
  );
}
```

Note on the HTTP status codes: Next.js App Router's render of these states defaults to 200. To return 404/410 explicitly, the spec is satisfied by setting status via an exported `not-found.tsx` page or by reading the headers. For v1 we return the rendered fallback at 200; the buyer-facing copy clearly conveys the state. (Future: use `next/navigation`'s `notFound()` for 404 pages, but that emits the default Next.js 404 chrome — counter to white-label rules. We deliberately render our own 200 OK page with explicit copy. Add a comment noting this.)

Edit the file to add this comment block immediately above the first `if (!row)` line:

```tsx
// NOTE: We deliberately render the unavailable state at HTTP 200 with
// explicit white-label copy rather than calling notFound(), which would
// emit Next.js's default 404 chrome (Pokestonks branded). The buyer-facing
// copy ("This storefront isn't available.") is the actual signal.
```

- [ ] **Step 12.5: Run typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both clean. The `next build` step is critical here per memory feedback — it surfaces server-component / Suspense issues that tsc + vitest miss.

- [ ] **Step 12.6: Commit**

```bash
git add app/storefront components/storefront/StorefrontUnavailable.tsx
git commit -m "feat(plan-10): public /storefront/[token] route + white-label layout"
git push origin main
```

---

## Task 13: StorefrontHeader + StorefrontGrid components

**Files:**
- Create: `components/storefront/StorefrontHeader.tsx`
- Create: `components/storefront/StorefrontGrid.tsx`
- Create: `components/storefront/StorefrontGrid.test.tsx`

- [ ] **Step 13.1: Create the header**

Path: `components/storefront/StorefrontHeader.tsx`. Exact contents:

```tsx
import { formatRelativeTime } from '@/lib/utils/time';

export type StorefrontHeaderProps = {
  title: string;
  subtitle: string | null;
  contactLine: string | null;
  itemsCount: number;
  lastUpdatedAt: Date | null;
};

export function StorefrontHeader({
  title,
  subtitle,
  contactLine,
  itemsCount,
  lastUpdatedAt,
}: StorefrontHeaderProps) {
  const updatedRel = lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : null;
  return (
    <header className="border-b border-divider pb-6">
      <h1 className="text-[24px] font-medium tracking-tight">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] text-meta">{subtitle}</p>}
      {contactLine && <p className="mt-3 text-[13px] text-text">{contactLine}</p>}
      <p className="mt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-meta">
        {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
        {updatedRel ? ` · Updated ${updatedRel}` : ''}
      </p>
    </header>
  );
}
```

- [ ] **Step 13.2: Create the grid**

Path: `components/storefront/StorefrontGrid.tsx`. Exact contents:

```tsx
import Image from 'next/image';
import { formatCents } from '@/lib/utils/format';
import { getImageUrl } from '@/lib/utils/images';
import type { StorefrontViewItem } from '@/lib/services/storefront';

export type StorefrontGridProps = {
  items: StorefrontViewItem[];
};

export function StorefrontGrid({ items }: StorefrontGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const src = getImageUrl({
          imageStoragePath: item.imageStoragePath,
          imageUrl: item.imageUrl,
        });
        return (
          <article
            key={item.catalogItemId}
            className="rounded-xl border border-divider bg-vault p-4 flex flex-col"
          >
            <div className="aspect-square w-full mb-3 rounded-lg overflow-hidden bg-canvas flex items-center justify-center">
              {src ? (
                <Image
                  src={src}
                  alt={item.name}
                  width={400}
                  height={400}
                  className="object-contain w-full h-full"
                  unoptimized
                />
              ) : (
                <div className="text-meta text-[24px]">📦</div>
              )}
            </div>
            <h2 className="text-[14px] font-medium leading-tight line-clamp-2">{item.name}</h2>
            <p className="mt-1 text-[12px] text-meta">
              {[item.setName, item.typeLabel].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <p className="text-[18px] font-semibold tracking-tight">
                {formatCents(item.askingPriceCents)}
              </p>
              <p className="text-[11px] text-meta">
                {item.qtyAvailable} {item.qtyAvailable === 1 ? 'available' : 'available'}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 13.3: Create the grid test**

Path: `components/storefront/StorefrontGrid.test.tsx`. Exact contents:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/image', () => ({
  default: (props: { src: string; alt: string }) => {
    const { src, alt } = props;
    return <span data-testid="img" data-src={src}>{alt}</span>;
  },
}));

vi.mock('@/lib/utils/images', () => ({
  getImageUrl: (input: { imageUrl: string | null }) => input.imageUrl,
}));

import { StorefrontGrid } from './StorefrontGrid';

const mkItem = (overrides: Partial<Parameters<typeof StorefrontGrid>[0]['items'][0]> = {}) => ({
  catalogItemId: 1,
  name: 'SV151 ETB',
  setName: 'Scarlet & Violet 151',
  imageUrl: 'https://example.test/etb.png',
  imageStoragePath: null,
  typeLabel: 'Elite Trainer Box',
  qtyAvailable: 3,
  askingPriceCents: 6000,
  updatedAt: new Date(),
  ...overrides,
});

describe('StorefrontGrid', () => {
  it('renders item name, type, qty, and price', () => {
    render(<StorefrontGrid items={[mkItem()]} />);
    expect(screen.getByText('SV151 ETB')).toBeTruthy();
    expect(screen.getByText(/Elite Trainer Box/)).toBeTruthy();
    expect(screen.getByText(/Scarlet & Violet 151/)).toBeTruthy();
    expect(screen.getByText('$60.00')).toBeTruthy();
    expect(screen.getByText(/3 available/)).toBeTruthy();
  });

  it('renders multiple items in order given', () => {
    render(
      <StorefrontGrid
        items={[
          mkItem({ catalogItemId: 1, name: 'A' }),
          mkItem({ catalogItemId: 2, name: 'B' }),
          mkItem({ catalogItemId: 3, name: 'C' }),
        ]}
      />
    );
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(3);
    expect(articles[0].textContent).toContain('A');
    expect(articles[1].textContent).toContain('B');
    expect(articles[2].textContent).toContain('C');
  });

  it('renders the placeholder when no image url', () => {
    render(<StorefrontGrid items={[mkItem({ imageUrl: null })]} />);
    expect(screen.getByText('📦')).toBeTruthy();
  });

  it('renders singular "available" when qty is 1', () => {
    render(<StorefrontGrid items={[mkItem({ qtyAvailable: 1 })]} />);
    // Both branches today render "available"; if you ever switch to "1 available item",
    // this test will catch it. Keeps the contract explicit.
    expect(screen.getByText(/1 available/)).toBeTruthy();
  });
});
```

- [ ] **Step 13.4: Run tests**

```bash
npx vitest run components/storefront/StorefrontGrid.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 13.5: Commit**

```bash
git add components/storefront/StorefrontHeader.tsx components/storefront/StorefrontGrid.tsx components/storefront/StorefrontGrid.test.tsx
git commit -m "feat(plan-10): StorefrontHeader + StorefrontGrid"
git push origin main
```

---

## Task 14: Admin route shell

**Files:**
- Create: `app/(authenticated)/storefront/page.tsx`
- Create: `app/(authenticated)/storefront/StorefrontAdminClient.tsx`

- [ ] **Step 14.1: Create the SSR page**

Path: `app/(authenticated)/storefront/page.tsx`. Exact contents:

```tsx
import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StorefrontAdminClient } from './StorefrontAdminClient';

export default async function StorefrontAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-[24px] font-medium tracking-tight">Storefront</h1>
        <p className="mt-2 text-[14px] text-meta">
          Manage share links and asking prices. Buyers see only the items you list here.
        </p>
      </header>
      <StorefrontAdminClient />
    </div>
  );
}
```

- [ ] **Step 14.2: Create the client wrapper shell**

Path: `app/(authenticated)/storefront/StorefrontAdminClient.tsx`. Exact contents:

```tsx
'use client';
import { ShareLinkCard } from '@/components/storefront/ShareLinkCard';
import { ListingsTable } from '@/components/storefront/ListingsTable';

export function StorefrontAdminClient() {
  return (
    <div className="space-y-6">
      <ShareLinkCard />
      <ListingsTable />
    </div>
  );
}
```

These two components don't exist yet; the next two tasks build them. The route will fail at the import level until they're created — that's expected, we build incrementally.

- [ ] **Step 14.3: Commit (page + shell only)**

```bash
git add "app/(authenticated)/storefront"
git commit -m "feat(plan-10): /storefront admin page shell"
git push origin main
```

---

## Task 15: ShareLinkCard + ShareLinkCreateDialog

**Files:**
- Create: `components/storefront/ShareLinkCard.tsx`
- Create: `components/storefront/ShareLinkCreateDialog.tsx`

- [ ] **Step 15.1: Create the create-dialog**

Path: `components/storefront/ShareLinkCreateDialog.tsx`. Exact contents:

```tsx
'use client';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCreateShareToken,
  useUpdateShareToken,
  type CreateShareTokenInput,
} from '@/lib/query/hooks/useStorefront';

export type ShareLinkEditTarget = {
  id: number;
  label: string;
  headerTitle: string | null;
  headerSubtitle: string | null;
  contactLine: string | null;
};

export type ShareLinkCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget?: ShareLinkEditTarget | null;
};

export function ShareLinkCreateDialog({
  open,
  onOpenChange,
  editTarget,
}: ShareLinkCreateDialogProps) {
  const isEdit = editTarget != null;
  const [label, setLabel] = useState(editTarget?.label ?? '');
  const [headerTitle, setHeaderTitle] = useState(editTarget?.headerTitle ?? '');
  const [headerSubtitle, setHeaderSubtitle] = useState(editTarget?.headerSubtitle ?? '');
  const [contactLine, setContactLine] = useState(editTarget?.contactLine ?? '');
  const [error, setError] = useState<string | null>(null);

  const createMut = useCreateShareToken();
  const updateMut = useUpdateShareToken(editTarget?.id ?? 0);
  const pending = createMut.isPending || updateMut.isPending;

  async function submit() {
    setError(null);
    const input: CreateShareTokenInput = {
      label,
      headerTitle: headerTitle.trim() || null,
      headerSubtitle: headerSubtitle.trim() || null,
      contactLine: contactLine.trim() || null,
    };
    try {
      if (isEdit && editTarget) {
        await updateMut.mutateAsync(input);
      } else {
        await createMut.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save share link');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader
          title={isEdit ? 'Edit share link' : 'Create share link'}
          sub="The header and contact line show on the public storefront for this link"
        />
        <FormSection>
          <FormRow>
            <div className="w-full space-y-3">
              <FieldLabel htmlFor="sl-label">Label (private to you)</FieldLabel>
              <Input
                id="sl-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. FB Marketplace Sept 2026"
              />
              <FieldLabel htmlFor="sl-title">Header title</FieldLabel>
              <Input
                id="sl-title"
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                placeholder="Sealed Pokémon"
              />
              <FieldLabel htmlFor="sl-sub">Header subtitle (optional)</FieldLabel>
              <Input
                id="sl-sub"
                value={headerSubtitle}
                onChange={(e) => setHeaderSubtitle(e.target.value)}
                placeholder="e.g. Local pickup only"
              />
              <FieldLabel htmlFor="sl-contact">Contact line (optional)</FieldLabel>
              <Input
                id="sl-contact"
                value={contactLine}
                onChange={(e) => setContactLine(e.target.value)}
                placeholder="e.g. Message me on Facebook Marketplace"
              />
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[9px] uppercase tracking-[0.16em] text-meta font-mono"
    >
      {children}
    </label>
  );
}
```

- [ ] **Step 15.2: Create the share-link card**

Path: `components/storefront/ShareLinkCard.tsx`. Exact contents:

```tsx
'use client';
import { useState } from 'react';
import { useShareTokens, useRevokeShareToken } from '@/lib/query/hooks/useStorefront';
import {
  ShareLinkCreateDialog,
  type ShareLinkEditTarget,
} from './ShareLinkCreateDialog';

function publicUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/storefront/${token}`;
  return `${window.location.origin}/storefront/${token}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Ignore — the user can still select the text manually.
  }
}

export function ShareLinkCard() {
  const tokens = useShareTokens();
  const revoke = useRevokeShareToken();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShareLinkEditTarget | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  if (tokens.isLoading) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-meta">Loading share links...</p>
      </section>
    );
  }
  if (tokens.error || !tokens.data) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-rose-500">Failed to load share links.</p>
      </section>
    );
  }

  const active = tokens.data.tokens.filter((t) => t.revokedAt == null);
  const revoked = tokens.data.tokens.filter((t) => t.revokedAt != null);

  return (
    <section className="rounded-xl border border-divider bg-vault p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-medium">Share links</h2>
        <button
          type="button"
          onClick={() => {
            setEditTarget(null);
            setCreateOpen(true);
          }}
          className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
        >
          + Create another link
        </button>
      </header>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed border-divider p-4 text-center">
          <p className="text-[13px] text-meta">No share links yet.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
          >
            Create your first share link
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((tok) => (
            <li
              key={tok.id}
              className="rounded-md border border-divider bg-canvas p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium truncate">
                    {tok.label || '(no label)'}
                  </span>
                  <span className="text-[10px] text-meta font-mono uppercase tracking-[0.08em]">
                    {tok.headerTitle ?? 'Sealed Pokémon'}
                    {tok.contactLine ? ` · ${tok.contactLine}` : ''}
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-meta truncate">
                  {publicUrlFor(tok.token)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(publicUrlFor(tok.token))}
                  className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditTarget({
                      id: tok.id,
                      label: tok.label,
                      headerTitle: tok.headerTitle,
                      headerSubtitle: tok.headerSubtitle,
                      contactLine: tok.contactLine,
                    })
                  }
                  className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                >
                  Edit
                </button>
                {confirmRevokeId === tok.id ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await revoke.mutateAsync(tok.id);
                        setConfirmRevokeId(null);
                      }}
                      className="text-[11px] font-mono px-2 py-1 rounded-md border border-rose-500 text-rose-500 hover:bg-rose-500/10"
                    >
                      Confirm revoke
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(null)}
                      className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(tok.id)}
                    className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider text-meta hover:text-rose-500"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRevoked((s) => !s)}
            className="text-[11px] font-mono text-meta hover:text-text"
          >
            {showRevoked ? 'Hide' : 'Show'} {revoked.length} revoked link{revoked.length === 1 ? '' : 's'}
          </button>
          {showRevoked && (
            <ul className="mt-3 space-y-2">
              {revoked.map((tok) => (
                <li
                  key={tok.id}
                  className="rounded-md border border-divider bg-canvas/50 p-3 flex items-center gap-3 opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px]">{tok.label || '(no label)'}</div>
                    <div className="text-[10px] font-mono text-meta truncate">
                      {publicUrlFor(tok.token)}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-meta uppercase">Revoked</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ShareLinkCreateDialog
        open={createOpen || editTarget != null}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        editTarget={editTarget}
      />
    </section>
  );
}
```

- [ ] **Step 15.3: Run typecheck and run admin route in dev sanity check**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 15.4: Commit**

```bash
git add components/storefront/ShareLinkCard.tsx components/storefront/ShareLinkCreateDialog.tsx
git commit -m "feat(plan-10): ShareLinkCard + ShareLinkCreateDialog"
git push origin main
```

---

## Task 16: ListingsTable + AddListingFromHoldingsDialog + MarkdownCopyButton

**Files:**
- Create: `components/storefront/ListingsTable.tsx`
- Create: `components/storefront/ListingsTable.test.tsx`
- Create: `components/storefront/AddListingFromHoldingsDialog.tsx`
- Create: `components/storefront/MarkdownCopyButton.tsx`
- Create: `components/storefront/MarkdownCopyButton.test.tsx`

- [ ] **Step 16.1: Create the listings table**

Path: `components/storefront/ListingsTable.tsx`. Exact contents:

```tsx
'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  useStorefrontListings,
  useUpsertStorefrontListing,
  useRemoveStorefrontListing,
  useShareTokens,
} from '@/lib/query/hooks/useStorefront';
import { formatCents } from '@/lib/utils/format';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { getImageUrl } from '@/lib/utils/images';
import { AddListingFromHoldingsDialog } from './AddListingFromHoldingsDialog';
import { MarkdownCopyButton } from './MarkdownCopyButton';

export function ListingsTable() {
  const listings = useStorefrontListings();
  const tokens = useShareTokens();
  const upsert = useUpsertStorefrontListing();
  const remove = useRemoveStorefrontListing();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [addOpen, setAddOpen] = useState(false);

  if (listings.isLoading) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-meta">Loading listings...</p>
      </section>
    );
  }
  if (listings.error || !listings.data) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-rose-500">Failed to load listings.</p>
      </section>
    );
  }

  const rows = listings.data.listings;
  const activeToken = tokens.data?.tokens.find((t) => t.revokedAt == null) ?? null;

  return (
    <section className="rounded-xl border border-divider bg-vault overflow-hidden">
      <header className="px-6 py-4 border-b border-divider flex items-center justify-between">
        <h2 className="text-[16px] font-medium">Listings</h2>
        <span className="text-[11px] font-mono text-meta">
          {rows.length} {rows.length === 1 ? 'listing' : 'listings'}
        </span>
      </header>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-[13px] text-meta">No items priced yet.</p>
          <p className="mt-2 text-[12px] text-meta">
            Set an asking price on a holding to add it to your storefront.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-[0.08em] text-meta border-b border-divider">
                <th className="text-left px-6 py-2 w-[44px]"></th>
                <th className="text-left px-2 py-2">Item</th>
                <th className="text-right px-2 py-2 w-[100px]">Market</th>
                <th className="text-right px-2 py-2 w-[140px]">Asking</th>
                <th className="text-right px-2 py-2 w-[80px]">Qty</th>
                <th className="text-right px-6 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const src = getImageUrl({
                  imageStoragePath: row.item.imageStoragePath,
                  imageUrl: row.item.imageUrl,
                });
                const isEditing = editingId === row.catalogItemId;
                return (
                  <tr key={row.catalogItemId} className="border-b border-divider last:border-b-0">
                    <td className="px-6 py-3">
                      <div className="w-9 h-9 rounded-md overflow-hidden bg-canvas flex items-center justify-center">
                        {src ? (
                          <Image
                            src={src}
                            alt={row.item.name}
                            width={36}
                            height={36}
                            className="object-contain"
                            unoptimized
                          />
                        ) : (
                          <span className="text-[14px]">📦</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium leading-tight line-clamp-1">{row.item.name}</div>
                      <div className="text-[11px] text-meta line-clamp-1">
                        {[row.item.setName, row.typeLabel].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right text-meta">
                      {row.item.lastMarketCents != null ? formatCents(row.item.lastMarketCents) : '—'}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter') {
                              const cents = dollarsStringToCents(editValue);
                              if (cents == null || cents < 0 || cents > 100_000_000) return;
                              await upsert.mutateAsync({
                                catalogItemId: row.catalogItemId,
                                askingPriceCents: cents,
                              });
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          onBlur={() => setEditingId(null)}
                          className="w-[100px] text-right border border-divider rounded px-2 py-1 bg-canvas"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.catalogItemId);
                            setEditValue((row.askingPriceCents / 100).toFixed(2));
                          }}
                          className="font-medium hover:underline"
                        >
                          {formatCents(row.askingPriceCents)}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right text-meta">{row.qtyHeldRaw}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => remove.mutate(row.catalogItemId)}
                        className="text-meta hover:text-rose-500 text-[16px] leading-none"
                        aria-label={`Remove ${row.item.name} from storefront`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <footer className="px-6 py-4 border-t border-divider flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
        >
          + Add item from holdings
        </button>
        <MarkdownCopyButton listings={rows} token={activeToken} />
      </footer>

      <AddListingFromHoldingsDialog open={addOpen} onOpenChange={setAddOpen} />
    </section>
  );
}
```

- [ ] **Step 16.2: Create the add-from-holdings dialog**

Path: `components/storefront/AddListingFromHoldingsDialog.tsx`. Exact contents:

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  VaultDialogHeader,
  FormSection,
  FormRow,
  DialogActions,
} from '@/components/ui/dialog-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dollarsStringToCents } from '@/lib/utils/cents';
import { useHoldings } from '@/lib/query/hooks/useHoldings';
import {
  useStorefrontListings,
  useUpsertStorefrontListing,
} from '@/lib/query/hooks/useStorefront';

export function AddListingFromHoldingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const holdings = useHoldings();
  const listings = useStorefrontListings();
  const upsert = useUpsertStorefrontListing();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dollars, setDollars] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedId(null);
      setDollars('');
      setError(null);
    }
  }, [open]);

  const candidates = useMemo(() => {
    if (!holdings.data) return [];
    const listed = new Set(
      (listings.data?.listings ?? []).map((l) => l.catalogItemId)
    );
    return holdings.data.holdings
      .filter((h) => !listed.has(h.item.id))
      .filter((h) => {
        const total = (h.qtyHeldTracked ?? 0) + (h.qtyHeldCollection ?? 0);
        return total > 0;
      })
      .filter((h) => {
        if (search.trim() === '') return true;
        const q = search.toLowerCase();
        return (
          h.item.name.toLowerCase().includes(q) ||
          (h.item.setName ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
  }, [holdings.data, listings.data, search]);

  async function submit() {
    setError(null);
    if (selectedId == null) {
      setError('Select an item');
      return;
    }
    const cents = dollarsStringToCents(dollars);
    if (cents == null || cents < 0) {
      setError('Enter a valid asking price');
      return;
    }
    if (cents > 100_000_000) {
      setError('Asking price cannot exceed $1,000,000');
      return;
    }
    try {
      await upsert.mutateAsync({ catalogItemId: selectedId, askingPriceCents: cents });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add listing');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <VaultDialogHeader title="Add to storefront" sub="Pick an item from your holdings and set an asking price" />
        <FormSection>
          <FormRow>
            <div className="w-full space-y-3">
              <Input
                placeholder="Search holdings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <ul className="max-h-[240px] overflow-y-auto rounded-md border border-divider divide-y divide-divider">
                {candidates.length === 0 ? (
                  <li className="px-3 py-4 text-[12px] text-meta text-center">
                    {holdings.isLoading ? 'Loading...' : 'No matching unlisted holdings'}
                  </li>
                ) : (
                  candidates.map((h) => (
                    <li
                      key={h.item.id}
                      onClick={() => setSelectedId(h.item.id)}
                      className={`px-3 py-2 cursor-pointer ${selectedId === h.item.id ? 'bg-hover' : 'hover:bg-hover/50'}`}
                    >
                      <div className="text-[13px] font-medium leading-tight">{h.item.name}</div>
                      <div className="text-[11px] text-meta">
                        {[h.item.setName, `${(h.qtyHeldTracked ?? 0) + (h.qtyHeldCollection ?? 0)} held`]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </li>
                  ))
                )}
              </ul>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={dollars}
                  onChange={(e) => setDollars(e.target.value)}
                  placeholder="Asking price (e.g. 60.00)"
                  className="pl-7"
                />
              </div>
              {error && <p className="text-sm text-rose-500">{error}</p>}
            </div>
          </FormRow>
        </FormSection>
        <DialogActions>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 16.3: Create the markdown copy button**

Path: `components/storefront/MarkdownCopyButton.tsx`. Exact contents:

```tsx
'use client';
import { useState } from 'react';
import { formatCents } from '@/lib/utils/format';
import type { StorefrontListingDto } from '@/app/api/storefront/listings/route';
import type { ShareTokenDto } from '@/app/api/storefront/tokens/route';

export type MarkdownCopyButtonProps = {
  listings: StorefrontListingDto[];
  token: ShareTokenDto | null;
};

export function buildMarkdown(
  listings: StorefrontListingDto[],
  token: ShareTokenDto | null,
  origin: string
): string {
  const title = token?.headerTitle ?? 'Sealed Pokémon';
  const subtitle = token?.headerSubtitle ?? null;
  const contact = token?.contactLine ?? null;

  const lines: string[] = [];
  lines.push(title);
  if (subtitle) lines.push(subtitle);
  if (contact) lines.push(contact);
  lines.push('');
  lines.push('Available:');
  for (const l of listings) {
    if (l.qtyHeldRaw <= 0) continue;
    lines.push(
      `- ${l.item.name} · ${l.qtyHeldRaw} available · ${formatCents(l.askingPriceCents)}`
    );
  }
  if (token) {
    lines.push('');
    lines.push(`Full menu: ${origin}/storefront/${token.token}`);
  }
  return lines.join('\n');
}

export function MarkdownCopyButton({ listings, token }: MarkdownCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const disabled = listings.filter((l) => l.qtyHeldRaw > 0).length === 0;

  async function handleCopy() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const md = buildMarkdown(listings, token, origin);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text for manual copy. Skipping for now — modern browsers handle clipboard.writeText well.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {copied ? 'Copied!' : 'Copy as text'}
    </button>
  );
}
```

- [ ] **Step 16.4: Markdown unit test**

Path: `components/storefront/MarkdownCopyButton.test.tsx`. Exact contents:

```tsx
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildMarkdown } from './MarkdownCopyButton';

const mkListing = (id: number, name: string, qty: number, price: number) =>
  ({
    catalogItemId: id,
    askingPriceCents: price,
    createdAt: '',
    updatedAt: '',
    item: {
      id,
      name,
      setName: null,
      kind: 'sealed' as const,
      productType: 'Booster Box',
      imageUrl: null,
      imageStoragePath: null,
      lastMarketCents: null,
      lastMarketAt: null,
    },
    qtyHeldRaw: qty,
    typeLabel: 'Booster Box',
  });

const mkToken = (overrides: Partial<{ token: string; headerTitle: string | null; headerSubtitle: string | null; contactLine: string | null }> = {}) =>
  ({
    id: 1,
    token: 'abc123',
    label: '',
    kind: 'storefront' as const,
    headerTitle: 'Sealed Pokémon',
    headerSubtitle: null,
    contactLine: 'Message me on FB Marketplace',
    createdAt: '',
    revokedAt: null,
    ...overrides,
  });

describe('buildMarkdown', () => {
  it('produces title + contact + items + link', () => {
    const md = buildMarkdown(
      [mkListing(1, 'SV151 ETB', 3, 6000), mkListing(2, 'Paldean Fates Bundle', 2, 3000)],
      mkToken(),
      'https://pokestonks.app'
    );
    expect(md).toContain('Sealed Pokémon');
    expect(md).toContain('Message me on FB Marketplace');
    expect(md).toContain('- SV151 ETB · 3 available · $60.00');
    expect(md).toContain('- Paldean Fates Bundle · 2 available · $30.00');
    expect(md).toContain('Full menu: https://pokestonks.app/storefront/abc123');
  });

  it('omits zero-qty rows', () => {
    const md = buildMarkdown(
      [mkListing(1, 'Live', 1, 1000), mkListing(2, 'Sold Out', 0, 1000)],
      mkToken(),
      'https://pokestonks.app'
    );
    expect(md).toContain('Live');
    expect(md).not.toContain('Sold Out');
  });

  it('handles missing token (no link line)', () => {
    const md = buildMarkdown([mkListing(1, 'X', 1, 100)], null, 'https://pokestonks.app');
    expect(md).not.toContain('Full menu:');
  });

  it('handles null contact and subtitle', () => {
    const md = buildMarkdown(
      [mkListing(1, 'X', 1, 100)],
      mkToken({ contactLine: null, headerSubtitle: null }),
      'https://pokestonks.app'
    );
    expect(md.split('\n')).toEqual([
      'Sealed Pokémon',
      '',
      'Available:',
      '- X · 1 available · $1.00',
      '',
      'Full menu: https://pokestonks.app/storefront/abc123',
    ]);
  });
});
```

- [ ] **Step 16.5: Run tests**

```bash
npx vitest run components/storefront
```

Expected: all storefront component tests pass (Markdown + Grid + Dialog).

- [ ] **Step 16.6: Run typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both clean.

- [ ] **Step 16.7: Commit**

```bash
git add components/storefront/ListingsTable.tsx components/storefront/AddListingFromHoldingsDialog.tsx components/storefront/MarkdownCopyButton.tsx components/storefront/MarkdownCopyButton.test.tsx
git commit -m "feat(plan-10): ListingsTable + AddListingFromHoldings + MarkdownCopyButton"
git push origin main
```

---

## Task 17: Add Storefront link to TopNav

**Files:**
- Modify: `components/nav/TopNav.tsx`

- [ ] **Step 17.1: Add the link**

Edit `components/nav/TopNav.tsx`. Update the `links` array (lines 9-15):

```tsx
const links = [
  { href: '/', label: 'Vault', match: (p: string) => p === '/' },
  { href: '/catalog', label: 'Search', match: (p: string) => p.startsWith('/catalog') },
  { href: '/holdings', label: 'Holdings', match: (p: string) => p.startsWith('/holdings') },
  { href: '/sales', label: 'Sales', match: (p: string) => p.startsWith('/sales') },
  { href: '/storefront', label: 'Storefront', match: (p: string) => p.startsWith('/storefront') },
  { href: '/settings', label: 'Settings', match: (p: string) => p.startsWith('/settings') },
];
```

The `match` clause uses `startsWith('/storefront')` and would also match the public route `/storefront/[token]`. The public route lives outside the `(authenticated)` layout group, so `<TopNav>` is never rendered there — the active-state collision is harmless.

The `BottomTabBar` is intentionally not updated; it has 5 fixed slots and adding a 6th breaks the grid. Mobile users can hit `/storefront` directly or via the desktop nav.

- [ ] **Step 17.2: Run typecheck and build**

```bash
npm run typecheck
npm run build
```

Expected: both clean.

- [ ] **Step 17.3: Commit**

```bash
git add components/nav/TopNav.tsx
git commit -m "feat(plan-10): add Storefront link to desktop top nav"
git push origin main
```

---

## Task 18: Final pre-ship gate

**Files:**
- (none — verification + commit only)

- [ ] **Step 18.1: Run the full test suite**

```bash
npm run test
```

Expected: 469 baseline + the new tests added across Tasks 4, 5, 6, 7, 10, 13, 16. Approximate target: 510+ passing tests. Record the count.

- [ ] **Step 18.2: Type-check**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 18.3: Build**

```bash
npm run build
```

Expected: `next build` clean. This is the load-bearing check per memory feedback: it surfaces server-component / Suspense / metadata bugs that tsc + vitest miss.

- [ ] **Step 18.4: Lint baseline**

```bash
npm run lint
```

Expected: no NEW errors introduced beyond the pre-existing 14-line baseline (per Plan 7 memory note). If new errors appeared, fix them.

---

## Task 19: Apply migration + ship

**Files:**
- (none — applies the migration and verifies in production)

- [ ] **Step 19.1: Apply migration via Supabase SQL editor**

Open the Supabase Dashboard SQL editor for the project. Copy the contents of `supabase/migrations/20260502000003_storefront.sql`. Run it.

Verify:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('share_tokens', 'storefront_listings');
```

Expected: 2 rows returned.

```sql
SELECT policyname FROM pg_policies
WHERE tablename IN ('share_tokens', 'storefront_listings');
```

Expected: `own share_tokens` and `own storefront_listings` listed.

- [ ] **Step 19.2: Wait for Vercel deploy to complete**

Push to main triggered Vercel auto-deploys throughout the plan; this final commit ensures the deployed code matches the applied migration. Confirm the latest deploy is green at https://vercel.com/<project>/deployments.

- [ ] **Step 19.3: Browser smoke (golden path)**

In a desktop browser, sign in to https://pokestonks.vercel.app. Then:

1. Click **Storefront** in the top nav. Confirm the page loads with the empty state.
2. Click **Create your first share link**. Set:
   - Label: "Smoke test"
   - Header title: "Sealed Pokémon by Michael"
   - Contact line: "Message me on Facebook Marketplace"
   Save.
3. The Share-links card should now show one active link with a copy button.
4. Navigate to `/holdings`. Click into a sealed item with `qty_held > 0`.
5. Click **Add to storefront**. Set $60.00. Save.
6. Return to `/storefront`. Confirm the listing appears in the table.
7. Copy the public URL. Open in a private window (no auth).
8. **Verify white-label:**
   - HTML `<title>` is "Sealed Pokémon by Michael" (no Pokestonks).
   - Page contains no app logo, no "Pokestonks" string, no nav, no auth buttons.
   - Header reads "Sealed Pokémon by Michael", item count + relative time, contact line.
   - Item card shows image, name, set + type label, asking price, qty available.
9. Back in the authenticated window, click the inline **$60.00** in the listings table to edit. Change to $65.00. Press Enter.
10. Refresh the public window. Verify the price updated to $65.00.
11. Use **Copy as text** in the listings footer. Paste into a text editor. Verify the markdown format is correct (header, contact, items with qty + price, full-menu URL).
12. Sell the item via `<SellDialog>` until qty hits 0. Reload the public page. Verify the item disappears (zero-qty hide). Verify the listing row remains in the admin table (so a restock auto-reappears).
13. Add another purchase (restock). Verify the public page shows the item again.
14. Revoke the token. Reload the public page. Verify "This storefront has been taken down." copy.
15. Visit a non-existent token URL. Verify "This storefront isn't available." copy.

If anything fails, fix it and re-deploy. Capture the test count and final ship marker for memory in Step 19.5.

- [ ] **Step 19.4: Ship marker**

```bash
git commit --allow-empty -m "feat: ship Plan 10 (Storefront)"
git push origin main
```

Record the resulting commit SHA — this is the ship marker.

- [ ] **Step 19.5: Update memory**

Update `~/.claude/projects/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/memory/project_state.md`. Find the "Plan 10 — Storefront" section and append a "shipped" subsection capturing:

- Ship marker SHA from Step 19.4.
- Final test count (e.g., "513 tests passing, was 469 pre-task; +44 net new").
- Migration `20260502000003_storefront.sql` applied 2026-05-02.
- Any deviations from spec, mid-flight fixes, or known polish items deferred to a future plan.

Also update the top-level "Plans 1-9 fully shipped" note in the memory line and `MEMORY.md` index entry to read "Plans 1-10 all shipped."

---

## Self-review checklist (run before declaring plan done — for the human or agent reading)

- [ ] **Spec coverage:** Every section of `2026-05-02-pokestonks-storefront-design.md` maps to at least one task.
  - §3 schema → Task 1, 2
  - §4 RLS + service-role bypass → Task 1 (RLS), Task 4 (resolver)
  - §5 API surface → Tasks 6, 7
  - §6 public route UX → Tasks 12, 13
  - §7 admin route UX → Tasks 14, 15, 16
  - §8 holding-detail integration → Tasks 8, 10, 11
  - §9 edge cases → covered across Tasks 4-7 (resolver returns null on revoke/wrong-kind; listings auto-hide via `loadStorefrontView` filter; etc.)
  - §10 conventions → reaffirmed throughout
  - §11 out of scope → respected (no graded handling, no per-token expiry)
  - §12 test plan → fulfilled in Tasks 4, 5, 6, 7, 10, 13, 16
  - §13 project structure → matches the file map
- [ ] **No placeholders.** Every code block is complete; no "TBD" / "TODO" / "implement later" outside the one TODO comment intentionally placed at the `qtyHeldRaw` site (graded handling is out of scope per spec §11).
- [ ] **Type consistency.** `ShareTokenDto`, `StorefrontListingDto`, `StorefrontViewItem` shapes are consistent across services, routes, hooks, and components. `kind: 'storefront'` is the literal type used everywhere.
- [ ] **TDD posture.** Service tasks (4, 5) lead with failing tests. API and component tasks (6, 7, 10, 13, 16) include tests in the same task as the implementation; this trades strict red-green-refactor for fewer commits per task while still ensuring tests exist.
- [ ] **Frequent commits.** Every task ends with an explicit commit + push. Per memory: push to origin during plan execution.
- [ ] **Build before ship.** Task 18 + Task 12 + Task 16 all run `npm run build` to catch the next-build-only failures memory warns about.
- [ ] **No app branding leaks on the public route.** Task 12 covers favicon override (icon.tsx), title metadata override (generateMetadata), no nav/chrome (custom layout). Task 13 keeps StorefrontHeader/StorefrontGrid free of app references. Markdown copy in Task 16 uses the user's headerTitle, not the app name.

---

## Plan ends.

After this ships, Plan 11 (vault sharing) becomes the "easy" follow-on: extend the `share_tokens.kind` CHECK to include `'vault'`, add a parallel `/share/[token]` route that loads the user's holdings via `loadHoldings` (existing) and renders a privacy-mode-on dashboard mirror. All the chrome columns, RLS policies, token generation, and route-group plumbing are already in place.
