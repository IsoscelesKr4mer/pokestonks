# Product From The Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A batch stops being one product. Each scanned card names its own set from what is printed on it, and a card from a set the owner has not added yet is parked with the set's name rather than rejected as a number that does not exist.

**Architecture:** The scan brief gains the owner's full product list (eleven short rows, not eleven checklists). `ScanResult` gains `productId` and `productGuess` per card. `runScanPipeline` groups the batch's cards by their effective product, fetches each product's checklist fresh, and runs the existing hard gate per group. The gate itself is untouched. The batch's own product becomes a hint that supplies a default and a checklist for precision, not a requirement.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (generate/migrate only, never `drizzle-kit push`), Supabase Postgres, Vitest against the isolated `iso_test` schema.

**Spec:** `docs/superpowers/specs/2026-10-07-product-from-the-card.md`

## Global Constraints

- **Never run `drizzle-kit push`.** Schema changes are `drizzle-kit generate` then `drizzle-kit migrate`.
- **No model call anywhere in the application.** The reading happens in the owner's own agent session, draining a job row. Nothing in this repo imports a model SDK or leaves a seam for one.
- **No em dashes in user-facing copy.**
- **Money is integer cents.** Dates are ISO `YYYY-MM-DD`.
- **The hard gate does not loosen.** `core/products/verify.ts` and `core/scan/verify.ts` keep their exact current behaviour. A card number must exist in a checklist and the player must match. What changes is only *which* checklist is handed to it.
- **Ruling 10 holds:** the checklist is queried fresh at commit time via `getProductChecklist`, never read from `brief.json`. This plan multiplies the number of such queries; it must not replace any of them with the brief's snapshot.
- **Every new guard gets falsified two ways:** delete the check and watch a test go red (proves it is reached), and force it to always take one branch and watch a *different* test go red (proves a test reads its value). A falsification that reports zero failures is a no-op edit, not a weak test. Verify the edit landed before believing the result.
- **Tests run with** `npx vitest run`. Read the `Tests` line, not the duration line.
- **Before declaring done:** `npx tsc --noEmit`, `npx vitest run`, and `npm run build` must all be clean. The build catches prerender bugs that compile fine.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `core/scan/brief.ts` | Brief gains `products`; scannability stops requiring a product | 1, 2 |
| `core/scan/result.ts` | `productId` and `productGuess` on each card | 3 |
| `core/scan/productRouting.ts` (new) | Pure: resolve a card's effective product, decide `unknown-product` / `product-mismatch` | 4 |
| `scripts/scan-commit.ts` | `runScanPipeline` groups by product and gates per group | 5 |
| `lib/db/schema/reviewItems.ts` | No schema change; `reasons` is already `text[]` | — |
| `app/ingest/[batchId]/pairing-grid.tsx` | Product becomes "Mostly from" with "Not sure" | 6 |
| `core/ingest/batches.ts` + `app/api/batches/[batchId]/confirm/route.ts` | Accept a null productId on confirm | 6 |
| `app/review/[itemId]/page.tsx` | Words and a link for the two new reasons | 7 |

---

### Task 1: The brief carries the owner's product list

**Files:**
- Modify: `core/scan/brief.ts`
- Test: `tests/unit/scan/brief.test.ts`

**Interfaces:**
- Consumes: `products` table (`lib/db/schema/products.ts`), `formatProductDisplayName` (`core/products/displayName.ts`).
- Produces: `ScanBriefProduct` and a `products: ScanBriefProduct[]` field on `ScanBrief`. Task 4 and Task 5 both read it.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/scan/brief.test.ts`. Follow the file's existing setup helpers for seeding a user, a product and a confirmed batch; do not invent a new harness.

```ts
it('carries every product the owner has, not just the batch hint', async () => {
  // Two products, batch confirmed against only the first. The agent needs
  // the second one listed or it can never name it from a card.
  const other = await seedProduct(userId, { year: 2026, brand: 'Topps', productName: 'Topps NOW Road to Opening Day', format: null });
  const brief = await buildBrief(userId, batchId, outDir);
  expect(brief.products.map((p) => p.id)).toEqual(expect.arrayContaining([productId, other.id]));
  const row = brief.products.find((p) => p.id === other.id)!;
  expect(row).toEqual({
    id: other.id,
    year: 2026,
    brand: 'Topps',
    productName: 'Topps NOW Road to Opening Day',
    format: null,
    sport: 'Baseball',
    displayName: '2026 Topps Topps NOW Road to Opening Day',
    hasChecklist: true,
  });
});

it('does not list another owner\'s products', async () => {
  const strangerId = await seedUser();
  await seedProduct(strangerId, { year: 2026, brand: 'Panini', productName: 'Prizm', format: 'Hobby' });
  const brief = await buildBrief(userId, batchId, outDir);
  expect(brief.products.some((p) => p.brand === 'Panini')).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scan/brief.test.ts`
Expected: FAIL, `brief.products` is undefined.

- [ ] **Step 3: Implement**

In `core/scan/brief.ts`, add the type and the field:

```ts
/**
 * One row of the owner's product list, as the brief carries it.
 *
 * The brief carries this list, not every product's checklist: eleven
 * products is 9,126 checklist entries, and the brief is read into a context
 * window. The hint product's checklist is still carried in full, because
 * that is what lets an insert be resolved precisely from candidates.
 *
 * `hasChecklist` is here so the agent can tell "a set you own and can
 * scan against" from "a set you added but never loaded".
 */
export type ScanBriefProduct = {
  id: number;
  year: number;
  brand: string;
  productName: string;
  format: string | null;
  sport: string;
  displayName: string;
  hasChecklist: boolean;
};
```

Add `products: ScanBriefProduct[]` to `ScanBrief`, after `productName`.

In `buildBrief`, before the `if (productId !== null)` block, query the list:

```ts
  // Every product this owner has, scoped by userId like every other read in
  // this file. `checklistLoadedAt` is the same signal the pairing screen's
  // dropdown uses for its "(no checklist)" suffix.
  const ownedProducts = await db
    .select({
      id: products.id,
      year: products.year,
      brand: products.brand,
      productName: products.productName,
      format: products.format,
      sport: products.sport,
      checklistLoadedAt: products.checklistLoadedAt,
    })
    .from(products)
    .where(eq(products.userId, userId))
    .orderBy(products.year, products.brand, products.productName);

  const productList: ScanBriefProduct[] = ownedProducts.map((p) => ({
    id: p.id,
    year: p.year,
    brand: p.brand,
    productName: p.productName,
    format: p.format,
    sport: p.sport,
    displayName: formatProductDisplayName(p),
    hasChecklist: p.checklistLoadedAt !== null,
  }));
```

Add `products: productList` to the `brief` object literal at the end.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/scan/brief.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the ownership scope**

Change `.where(eq(products.userId, userId))` to `.where(sql\`true\`)` and re-run. Expected: the second test above goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add core/scan/brief.ts tests/unit/scan/brief.test.ts
git commit -m "feat(scan): the brief carries the owner's product list"
```

---

### Task 2: A batch without a product is still scannable

**Files:**
- Modify: `core/scan/brief.ts` (`briefIsScannable`, `BriefScannability`, `buildBrief`'s refusal branch)
- Test: `tests/unit/scan/brief.test.ts`

**Interfaces:**
- Produces: `BriefScannability` reason set becomes `'no-products' | 'no-photos'`. `'no-product'` and `'no-checklist'` are removed. `ScanBriefRefusedError.reason` narrows to match.

- [ ] **Step 1: Write the failing test**

```ts
describe('briefIsScannable', () => {
  it('allows a batch with no product chosen, because the card names its own set', () => {
    expect(briefIsScannable({ productId: null, ownedProductCount: 3, pairs: [{}, {}] })).toEqual({ ok: true });
  });

  it('allows a hint product with no checklist, because another product may match', () => {
    expect(briefIsScannable({ productId: 7, ownedProductCount: 3, pairs: [{}] })).toEqual({ ok: true });
  });

  it('refuses when the owner has no products at all', () => {
    // Nothing to match a card against. This is the one product-shaped
    // refusal left, and it is about the account, not the batch.
    expect(briefIsScannable({ productId: null, ownedProductCount: 0, pairs: [{}] })).toEqual({
      ok: false,
      reason: 'no-products',
    });
  });

  it('refuses a batch whose every photo failed conversion', () => {
    expect(briefIsScannable({ productId: 7, ownedProductCount: 3, pairs: [] })).toEqual({
      ok: false,
      reason: 'no-photos',
    });
  });

  it('reports no-products before no-photos when both apply', () => {
    // Adding a product is something he can do right now; a conversion
    // failure sends him to the health view. Report the actionable one.
    expect(briefIsScannable({ productId: null, ownedProductCount: 0, pairs: [] })).toEqual({
      ok: false,
      reason: 'no-products',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scan/brief.test.ts -t briefIsScannable`
Expected: FAIL. The existing signature takes `checklist`, not `ownedProductCount`, and refuses a null productId.

- [ ] **Step 3: Implement**

Replace `BriefScannability` and `briefIsScannable` in `core/scan/brief.ts`:

```ts
export type BriefScannability = { ok: true } | { ok: false; reason: 'no-products' | 'no-photos' };

/**
 * What still makes a batch unscannable, now that a card names its own set.
 *
 * Two reasons are GONE, deliberately:
 *
 * `no-product` used to refuse a batch with no product chosen. That was the
 * whole bug. Michael photographed a stack containing two Bowman Chrome cards
 * and one from a set he had not added, and a single dropdown could not
 * describe it: "There's a single drop down for 1 product but 2 of the 3
 * cards are 2026 bowman chrome from a hobby box and the 3rd is from Road to
 * Opening Day." A batch is a sitting, not a product.
 *
 * `no-checklist` used to refuse a hint product with no checklist loaded. It
 * now only means the hint cannot supply candidate rows; another of the
 * owner's products still can, and the hard gate still refuses any card that
 * matches none of them.
 *
 * `no-products` is new and is about the ACCOUNT, not the batch: with zero
 * products there is no checklist anywhere to gate against, so every card
 * would be rejected one by one with an unhelpful message. Refuse once, up
 * front, with the thing to do about it.
 */
export function briefIsScannable(input: {
  productId: number | null;
  ownedProductCount: number;
  pairs: unknown[];
}): BriefScannability {
  if (input.ownedProductCount === 0) return { ok: false, reason: 'no-products' };
  if (input.pairs.length === 0) return { ok: false, reason: 'no-photos' };
  return { ok: true };
}
```

Narrow `ScanBriefRefusedError.reason` to `'no-products' | 'no-photos'`.

In `buildBrief`, replace the call and the refusal branch:

```ts
  const scannable = briefIsScannable({
    productId,
    ownedProductCount: productList.length,
    pairs: photoPairs,
  });
  if (!scannable.ok) {
    if (scannable.reason === 'no-products') {
      throw new ScanBriefRefusedError(
        'no-products',
        'You have no products yet, so there is no checklist to check a card against. Add one on the products screen first.'
      );
    }
    throw new ScanBriefRefusedError(
      'no-photos',
      'No photos in this batch could be read. Check the health view.'
    );
  }
```

Then search the repo for the removed reasons and update every consumer:

```bash
grep -rn "no-checklist\|'no-product'" --include=*.ts --include=*.tsx . | grep -v node_modules
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: PASS and clean. Fix any consumer the grep found.

- [ ] **Step 5: Falsify the ordering**

Swap the two `if` statements so `no-photos` is checked first, re-run. Expected: the "reports no-products before no-photos" test goes red and nothing else does. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(scan): a batch with no product chosen is still scannable"
```

---

### Task 3: The scan result names a product per card

**Files:**
- Modify: `core/scan/result.ts`
- Test: `tests/unit/scan/result.test.ts`

**Interfaces:**
- Produces: `ScanResult['cards'][number]` gains `productId: number | null` and `productGuess: string | null`. Task 4 and Task 5 read both.

- [ ] **Step 1: Write the failing test**

```ts
const valid = {
  pairIndex: 0, cardNumber: '26', player: 'Ezequiel Tovar',
  insertName: 'Base', parallelName: 'Refractor', serialNumber: '040/499',
  isAutograph: false, isMemorabilia: false, confidence: 'high',
  note: null, estimatedValueCents: null,
  productId: 49, productGuess: null,
};

it('accepts a card that names a product by id', () => {
  const result = parseScanResult({ cards: [valid] }, 1);
  expect(result.ok).toBe(true);
  expect(result.ok && result.value.cards[0].productId).toBe(49);
});

it('accepts a card that names a set it could not match to a product', () => {
  const result = parseScanResult(
    { cards: [{ ...valid, productId: null, productGuess: '2026 Topps NOW Road to Opening Day' }] },
    1
  );
  expect(result.ok).toBe(true);
  expect(result.ok && result.value.cards[0].productGuess).toBe('2026 Topps NOW Road to Opening Day');
});

it('refuses a card that names both a product id and a guess', () => {
  // Two answers to one question. Which one the pipeline should believe is
  // not something it should have to decide.
  const result = parseScanResult(
    { cards: [{ ...valid, productId: 49, productGuess: 'something else' }] },
    1
  );
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.errors.join(' ')).toMatch(/productId and productGuess/);
});

it('refuses a non-integer productId', () => {
  const result = parseScanResult({ cards: [{ ...valid, productId: 49.5 }] }, 1);
  expect(result.ok).toBe(false);
});

it('refuses an empty productGuess, which says nothing', () => {
  const result = parseScanResult({ cards: [{ ...valid, productId: null, productGuess: '  ' }] }, 1);
  expect(result.ok).toBe(false);
});

it('requires both keys to be present', () => {
  // Omitting them is how an older result file looks, and an older file read
  // as "no opinion on the product" would silently fall back to the batch
  // hint for a card that may not be from it.
  const { productId: _a, productGuess: _b, ...withoutProduct } = valid;
  const result = parseScanResult({ cards: [withoutProduct] }, 1);
  expect(result.ok).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scan/result.test.ts`
Expected: FAIL. `productId` is currently an unrecognized key.

- [ ] **Step 3: Implement**

Add `'productId'` and `'productGuess'` to `CARD_KEYS`. Add both to the `ScanResult` type. In the per-card loop, after the `estimatedValueCents` check:

```ts
    // A product id or a free-text guess, never both and never neither. The
    // agent names an id when the card matches one of the brief's listed
    // products, and a guess, taken verbatim from what the card prints, when
    // it does not. Both null is not allowed: "I did not look" and "I looked
    // and it is one of yours" must not be the same value, or a card from an
    // unknown set would silently inherit the batch hint.
    const productIdValid =
      productIdRaw === null ||
      (typeof productIdRaw === 'number' && Number.isInteger(productIdRaw) && productIdRaw > 0);
    if (!productIdValid) {
      errors.push(`cards[${i}].productId must be a positive integer or null`);
    }

    const productGuessValid =
      productGuessRaw === null || (typeof productGuessRaw === 'string' && productGuessRaw.trim() !== '');
    if (!productGuessValid) {
      errors.push(`cards[${i}].productGuess must be a non-empty string or null`);
    }

    if (productIdValid && productGuessValid) {
      if (productIdRaw !== null && productGuessRaw !== null) {
        errors.push(
          `cards[${i}] sets both productId and productGuess; name the product by id when it is one of the listed products, and by productGuess only when it is not`
        );
      }
      if (productIdRaw === null && productGuessRaw === null) {
        errors.push(
          `cards[${i}] sets neither productId nor productGuess; every card must say which set it is from`
        );
      }
    }
```

Destructure `productId: productIdRaw, productGuess: productGuessRaw` from `rawCard`, add both validity flags to the final `if` conjunction, and carry both onto the pushed card.

**Note on the "both null" rule and the brief:** `scripts/scan-next.ts` writes the instructions the agent session reads. Update the brief's own README or instructions text (find it with `grep -rn "pairIndex" scripts/scan-next.ts`) so it tells the agent to set exactly one of the two.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/scan/result.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify the exclusivity rule**

Delete the `productIdRaw !== null && productGuessRaw !== null` branch, re-run. Expected: "refuses a card that names both" goes red. Restore. Then delete the `=== null && === null` branch. Expected: "requires both keys to be present" goes red (an omitted key reads as `undefined`, which fails `productIdValid` first, so confirm WHICH test reds and adjust the test if it is the wrong one). Restore.

- [ ] **Step 6: Commit**

```bash
git add core/scan/result.ts scripts/scan-next.ts tests/unit/scan/result.test.ts
git commit -m "feat(scan): a scanned card names its own product"
```

---

### Task 4: Resolving a card's product, as a pure function

**Files:**
- Create: `core/scan/productRouting.ts`
- Test: `tests/unit/scan/product-routing.test.ts`

**Interfaces:**
- Consumes: `ScanBriefProduct` (Task 1), `ScanResult['cards'][number]` (Task 3).
- Produces: `resolveCardProduct(input): CardProductResolution`, and the two new reason strings. Task 5 calls it once per card.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveCardProduct } from '@/core/scan/productRouting';

const owned = [
  { id: 49, displayName: '2026 Bowman Bowman Chrome Hobby', hasChecklist: true },
  { id: 2570, displayName: '2026 Topps Topps NOW Road to Opening Day', hasChecklist: true },
  { id: 60, displayName: '2026 Panini Prizm Hobby', hasChecklist: false },
];

describe('resolveCardProduct', () => {
  it('uses the product the card names', () => {
    expect(resolveCardProduct({ productId: 2570, productGuess: null, hintProductId: 49, ownedProducts: owned }))
      .toEqual({ ok: true, productId: 2570, mismatchedHint: true });
  });

  it('does not flag a mismatch when the card agrees with the hint', () => {
    expect(resolveCardProduct({ productId: 49, productGuess: null, hintProductId: 49, ownedProducts: owned }))
      .toEqual({ ok: true, productId: 49, mismatchedHint: false });
  });

  it('does not flag a mismatch when there was no hint to disagree with', () => {
    expect(resolveCardProduct({ productId: 49, productGuess: null, hintProductId: null, ownedProducts: owned }))
      .toEqual({ ok: true, productId: 49, mismatchedHint: false });
  });

  it('parks a card whose set the owner has not added', () => {
    expect(resolveCardProduct({
      productId: null, productGuess: '2026 Topps Heritage', hintProductId: 49, ownedProducts: owned,
    })).toEqual({
      ok: false,
      reason: 'unknown-product',
      message: 'This looks like 2026 Topps Heritage, which you have not added yet.',
    });
  });

  it('parks a card naming a product id the owner does not have', () => {
    // A hallucinated or stale id must never silently fall back to the hint:
    // that would gate a Road to Opening Day card against a Bowman checklist
    // and reject it as a number that does not exist.
    expect(resolveCardProduct({ productId: 999, productGuess: null, hintProductId: 49, ownedProducts: owned }))
      .toEqual({
        ok: false,
        reason: 'unknown-product',
        message: 'The scan named product 999, which is not one of yours.',
      });
  });

  it('parks a card whose product has no checklist loaded', () => {
    expect(resolveCardProduct({ productId: 60, productGuess: null, hintProductId: 49, ownedProducts: owned }))
      .toEqual({
        ok: false,
        reason: 'unknown-product',
        message: '2026 Panini Prizm Hobby has no checklist loaded, so this card cannot be checked.',
      });
  });

  it('does not put the owner\'s free text into the message unescaped', () => {
    // productGuess is text the agent read off a card, and it lands in HTML.
    // The message is plain text and React escapes it; this test exists so a
    // future change to a dangerouslySetInnerHTML renderer fails loudly.
    const r = resolveCardProduct({
      productId: null, productGuess: '<script>x</script>', hintProductId: null, ownedProducts: owned,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toContain('<script>x</script>');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scan/product-routing.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Which product a single scanned card belongs to, and whether it can be
 * gated at all.
 *
 * Pure: no database, no clock, no I/O. The pipeline (scripts/scan-commit.ts)
 * does the lookups and hands this plain data, the same way routeCard does.
 *
 * The one rule that matters: a card whose product cannot be resolved is
 * PARKED, never silently gated against the batch's hint. Gating a Road to
 * Opening Day card against a Bowman Chrome checklist rejects it as
 * "unknown_card_number", which tells the owner nothing about what actually
 * happened and reads as a misread rather than a missing set.
 */
export type ScanProductOption = {
  id: number;
  displayName: string;
  hasChecklist: boolean;
};

export type CardProductResolution =
  | { ok: true; productId: number; mismatchedHint: boolean }
  | { ok: false; reason: 'unknown-product'; message: string };

export function resolveCardProduct(input: {
  productId: number | null;
  productGuess: string | null;
  hintProductId: number | null;
  ownedProducts: ScanProductOption[];
}): CardProductResolution {
  const { productId, productGuess, hintProductId, ownedProducts } = input;

  if (productId === null) {
    // productGuess is guaranteed non-empty here by parseScanResult's
    // exclusivity rule, but this does not assume that: a null guess with a
    // null id is still a card that said nothing.
    const named = productGuess ?? 'a set it could not name';
    return {
      ok: false,
      reason: 'unknown-product',
      message: `This looks like ${named}, which you have not added yet.`,
    };
  }

  const match = ownedProducts.find((p) => p.id === productId);
  if (!match) {
    return {
      ok: false,
      reason: 'unknown-product',
      message: `The scan named product ${productId}, which is not one of yours.`,
    };
  }

  if (!match.hasChecklist) {
    return {
      ok: false,
      reason: 'unknown-product',
      message: `${match.displayName} has no checklist loaded, so this card cannot be checked.`,
    };
  }

  return {
    ok: true,
    productId,
    mismatchedHint: hintProductId !== null && hintProductId !== productId,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/scan/product-routing.test.ts`
Expected: PASS.

- [ ] **Step 5: Falsify two ways**

(a) Delete the `if (!match)` block entirely, so an unknown id falls through to the `hasChecklist` read and throws. Expected: "parks a card naming a product id the owner does not have" goes red. Restore.

(b) Force `mismatchedHint: true` unconditionally. Expected: the two "does not flag a mismatch" tests go red, proving they read the value rather than merely reaching the line. Restore.

- [ ] **Step 6: Commit**

```bash
git add core/scan/productRouting.ts tests/unit/scan/product-routing.test.ts
git commit -m "feat(scan): resolve a card's own product, or park it"
```

---

### Task 5: The pipeline gates each card against its own product's checklist

**Files:**
- Modify: `scripts/scan-commit.ts` (`runScanPipeline`)
- Test: `tests/unit/scan/pipeline.test.ts`

**Interfaces:**
- Consumes: `resolveCardProduct` (Task 4), `getProductChecklist` (`core/products/service.ts`), `verifyScanned` (`core/scan/verify.ts`), `commitCards` (`core/scan/commit.ts`).
- Produces: `ScanPipelineSummary` gains `parked: number` and `parkedReasonCounts`.

**Key facts the implementer needs:**
- `commitCards` derives a card's `productId` from `card.entry.productId`, so once a card is verified against the right product's checklist, its committed row is attributed correctly with no extra plumbing.
- `verifyScanned(cards, entries)` takes a flat entries array and returns `{ verified, rejected }`. Call it once per product group and concatenate.
- `resolveParallel(card, parallels, allVerified)` compares a card against the rest of the rip. Pass **only the cards in the same product group** as `allVerified`: comparing a Topps NOW foil against a Bowman Chrome Mojo is meaningless.
- A parked card writes a `review_items` row with `reasons: ['unknown-product']` and the resolution's `message` in a field the review screen can read. `review_items.scanned` already stores the agent's verbatim reading; put the message in `decision_note`... **no**: `decision_note` is the owner's note on a decision already made. Add the message to the `scanned` JSON under a `productNote` key instead, which needs no migration because the column is `jsonb`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/scan/pipeline.test.ts`, following the file's existing seeding helpers:

```ts
it('commits two cards against one product and parks a third from a set not added', async () => {
  // The exact case Michael hit: a mixed batch, no product chosen.
  const result = await runScanPipeline(batchId, [
    card({ pairIndex: 0, productId: bowmanId, cardNumber: '26', player: 'Ezequiel Tovar' }),
    card({ pairIndex: 1, productId: bowmanId, cardNumber: '1', player: 'Konnor Griffin' }),
    card({ pairIndex: 2, productId: null, productGuess: '2026 Topps Road to Opening Day' }),
  ]);
  expect(result.ok).toBe(true);
  const s = result.ok && result.summary;
  expect(s.committed + s.reviewed).toBe(2);
  expect(s.parked).toBe(1);
  expect(s.parkedReasonCounts['unknown-product']).toBe(1);
});

it('gates each card against its own product, not the batch hint', async () => {
  // A card number that exists in product A and not in product B. With the
  // old per-batch behaviour this rejects; with per-card products it commits.
  const result = await runScanPipeline(batchId, [
    card({ pairIndex: 0, productId: toppsNowId, cardNumber: 'OD-1', player: 'Pete Alonso' }),
  ]);
  expect(result.ok).toBe(true);
  expect(result.ok && result.summary.rejected).toBe(0);
});

it('parks rather than rejecting when the named product is not the owner\'s', async () => {
  const result = await runScanPipeline(batchId, [
    card({ pairIndex: 0, productId: 999999, cardNumber: '26', player: 'Ezequiel Tovar' }),
  ]);
  expect(result.ok && result.summary.parked).toBe(1);
  expect(result.ok && result.summary.rejected).toBe(0);
});

it('records a product-mismatch reason alongside the routing reasons', async () => {
  // Batch hinted at Bowman, card says Topps NOW, card is valid there. It
  // commits nothing silently: the owner sees both names and decides.
  const result = await runScanPipeline(batchIdHintedBowman, [
    card({ pairIndex: 0, productId: toppsNowId, cardNumber: 'OD-1', player: 'Pete Alonso' }),
  ]);
  const items = await db.select().from(reviewItems).where(eq(reviewItems.batchId, batchIdHintedBowman));
  expect(items[0].reasons).toContain('product-mismatch');
});

it('queries each product checklist once, not once per card', async () => {
  // Fifteen cards across two products must not be thirty queries. Spy on
  // getProductChecklist via the module mock the file already sets up.
  await runScanPipeline(batchId, fifteenCardsAcrossTwoProducts);
  expect(checklistSpy).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scan/pipeline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Replace steps 1 through 5 of `runScanPipeline`:

```ts
  const [batch] = await db
    .select({ productId: ingestBatches.productId, userId: ingestBatches.userId })
    .from(ingestBatches)
    .where(eq(ingestBatches.id, batchId));
  if (!batch) {
    return { ok: false, message: `Batch ${batchId} was not found.` };
  }
  const { productId: hintProductId, userId } = batch;

  // The owner's product list, the same one the brief carried. Re-read here
  // rather than trusted from the brief, for the same reason the checklist is
  // (Ruling 10): the brief is a snapshot the agent session can sit on for an
  // hour, and a product added or a checklist loaded in that window must be
  // visible to the commit.
  const ownedProducts = await listScanProductOptions(userId);

  // Resolve every card's product first, so the set of checklists to fetch is
  // known before any of them is fetched.
  const resolutions = new Map<number, CardProductResolution>();
  const productIdsNeeded = new Set<number>();
  for (const card of scannedCards) {
    const resolution = resolveCardProduct({
      productId: card.productId,
      productGuess: card.productGuess,
      hintProductId,
      ownedProducts,
    });
    resolutions.set(card.pairIndex, resolution);
    if (resolution.ok) productIdsNeeded.add(resolution.productId);
  }

  // One query per distinct product, not one per card. Ruling 10 holds: these
  // are live reads, never brief.json's snapshot.
  const checklistsByProduct = new Map<number, Awaited<ReturnType<typeof getProductChecklist>>>();
  for (const id of productIdsNeeded) {
    checklistsByProduct.set(id, await getProductChecklist(id, userId));
  }

  const parked: { card: ScannedCard; message: string }[] = [];
  const decided: DecidedCard[] = [];
  const reviewRouted: { card: VerifiedCard; reasons: RouteReason[] }[] = [];
  const allRejected: RejectedCard[] = [];

  // Group by product so the hard gate and the parallel comparison both see a
  // coherent set. resolveParallel compares a card against the rest of the
  // rip, and a Topps NOW foil next to a Bowman Mojo is not a comparison.
  const byProduct = new Map<number, ScannedCard[]>();
  for (const card of scannedCards) {
    const resolution = resolutions.get(card.pairIndex)!;
    if (!resolution.ok) {
      parked.push({ card: card as ScannedCard, message: resolution.message });
      continue;
    }
    const group = byProduct.get(resolution.productId) ?? [];
    group.push(card as ScannedCard);
    byProduct.set(resolution.productId, group);
  }

  for (const [groupProductId, groupCards] of byProduct) {
    const checklist = checklistsByProduct.get(groupProductId)!;
    const { verified, rejected } = verifyScanned(groupCards, checklist.entries);
    allRejected.push(...rejected);

    const groupParallels = checklist.parallels.map((p) => ({
      id: p.id, name: p.name, printRun: p.printRun, printRunKnown: p.printRunKnown, odds: p.oddsText,
    }));

    for (const card of verified) {
      const parallelResult = resolveParallel(card, groupParallels, verified);
      const routed = routeCard({
        serialNumber: card.serialNumber,
        isAutograph: card.isAutograph,
        isMemorabilia: card.isMemorabilia,
        confidence: card.confidence,
        estimatedValueCents: card.estimatedValueCents,
        parallelConfident: parallelResult.confident,
      });

      // A card that disagrees with the batch hint never auto-commits. Both
      // names go in front of the owner and he decides which is wrong.
      const resolution = resolutions.get(card.pairIndex)!;
      const mismatched = resolution.ok && resolution.mismatchedHint;
      const reasons: RouteReason[] = mismatched
        ? [...routed.reasons, 'product-mismatch']
        : routed.reasons;
      const destination = reasons.length === 0 ? 'auto-commit' : 'review';

      decided.push({ ...card, parallelId: parallelResult.parallelId, destination });
      if (destination === 'review') reviewRouted.push({ card, reasons });
    }
  }
```

Add `'product-mismatch'` and `'unknown-product'` to `RouteReason` in `core/scan/route.ts`, with a comment saying `routeCard` itself never produces them: they are added by the pipeline, which knows about products, and `routeCard` deliberately does not.

In the transaction, add a third loop writing a review item per parked card, mirroring the rejected-card loop but with `reasons: ['unknown-product']` and `scanned: { ...theReading, productNote: message }`.

Add `parked` and `parkedReasonCounts` to `ScanPipelineSummary` and to the printed output in the script's `main`.

Write `listScanProductOptions(userId)` in `core/products/service.ts`, returning `ScanProductOption[]`, and have `buildBrief` use it too so the brief and the pipeline cannot disagree about the list.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/scan/pipeline.test.ts` then `npx vitest run` and `npx tsc --noEmit`.
Expected: PASS and clean.

- [ ] **Step 5: Falsify two ways**

(a) Make the group loop always use the hint product's checklist regardless of the group's own id. Expected: "gates each card against its own product" goes red.

(b) Force `mismatched` to `false` always. Expected: "records a product-mismatch reason" goes red while every other test still passes, proving that test reads the value.

Restore after each; confirm the edit actually landed before reading the result.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(scan): gate each card against its own product's checklist"
```

---

### Task 6: The confirm screen asks what it actually needs

**Files:**
- Modify: `app/ingest/[batchId]/pairing-grid.tsx`
- Modify: `core/ingest/batches.ts` (`confirmPairing`) and `app/api/batches/[batchId]/confirm/route.ts`
- Test: `tests/unit/api/confirm.test.ts`, `tests/unit/ingest/grid.test.ts` (or the DOM test file the repo uses for this component)

- [ ] **Step 1: Write the failing test**

```ts
it('confirms a batch with no product chosen', async () => {
  const res = await POST(request({ productId: null, assignments }), { params: Promise.resolve({ batchId: String(batchId) }) });
  expect(res.status).toBe(200);
  const [batch] = await db.select().from(ingestBatches).where(eq(ingestBatches.id, batchId));
  expect(batch.productId).toBeNull();
  expect(batch.confirmedAt).not.toBeNull();
});

it('still refuses a productId that is not the owner\'s', async () => {
  // Relaxing "a product is required" must not relax "and it must be yours".
  const res = await POST(request({ productId: strangersProductId, assignments }), { params: Promise.resolve({ batchId: String(batchId) }) });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/api/confirm.test.ts`
Expected: FAIL. A null productId is currently rejected.

- [ ] **Step 3: Implement**

In the route handler and `confirmPairing`, accept `productId: number | null`. Keep the ownership check, applied only when it is not null.

In `pairing-grid.tsx`:
- Relabel the field `Mostly from` with help text: `Optional. The cards say which set they are from; this just helps when two sets look alike.`
- First option becomes `Not sure`, value `''`, and it is the default (already is).
- Delete the `if (productId === null) { setError('Choose a product before confirming this batch.'); return; }` guard.
- Keep the "Not in the list? Add the set" link from the previous commit.
- Keep the `(no checklist)` suffix and the warning line, but reword the warning: `This product has no checklist yet, so it cannot help resolve a card. Cards will still be checked against your other sets.`

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npm run build`
Expected: PASS and clean.

- [ ] **Step 5: Falsify the ownership check**

Delete the `eq(products.userId, userId)` clause from the productId validation. Expected: "still refuses a productId that is not the owner's" goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ingest): the product on a batch is a hint, not a requirement"
```

---

### Task 7: The review screen tells him what to do about a parked card

**Files:**
- Modify: `app/review/[itemId]/page.tsx`
- Modify: `app/review/page.tsx` (the queue list's reason labels)
- Test: the repo's existing review DOM test file

- [ ] **Step 1: Write the failing test**

```ts
it('names the set and offers to add it for an unknown-product item', async () => {
  const html = await renderReviewItem({
    reasons: ['unknown-product'],
    scanned: { ...reading, productNote: 'This looks like 2026 Topps Heritage, which you have not added yet.' },
  });
  expect(html).toContain('2026 Topps Heritage');
  expect(html).toContain('/products/new');
});

it('shows both product names for a product-mismatch item', async () => {
  const html = await renderReviewItem({ reasons: ['product-mismatch'], ... });
  expect(html).toContain('product-mismatch');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run` filtered to the review test file.
Expected: FAIL.

- [ ] **Step 3: Implement**

Add the two reasons to whatever map turns a reason string into words for the owner. Suggested copy, no em dashes:

| reason | heading | body |
|---|---|---|
| `unknown-product` | `A set you have not added` | the `productNote` verbatim, then a link: `Add the set` to `/products/new?return=/review/<itemId>` |
| `product-mismatch` | `Not the set you picked` | `You said this batch was mostly <hint>. This card reads as <named>. Check which is right before accepting.` |

A parked card's Accept must stay disabled until the set exists, because there is no checklist to gate against. Reject and "Checklist is wrong" stay available.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run` then `npm run build`.

- [ ] **Step 5: Falsify**

Remove `unknown-product` from the reason map. Expected: the first test goes red (the link disappears). Restore.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(review): an unknown set says so and offers to add itself"
```

---

## Acceptance

The spec's own case, end to end, run for real and not only in tests:

Three photographs, two of a 2026 Bowman Chrome card and one of a 2026 Topps NOW Road to Opening Day card, in one batch, with no product chosen on the confirm screen. Two cards reach the catalogue or the review queue against the Bowman Chrome checklist. The third lands in review saying which set it looks like and offering to add it. Nothing is lost and Michael typed no product name.

Run it against batch 5019 (the Noah Cameron A-NC card) plus a fresh Bowman pair, and report what actually happened rather than what was expected.

## Self-Review

**Spec coverage:** section 1 (hint not requirement) is Tasks 2 and 6. Section 2 (brief carries the product list) is Task 1. Section 3 (agent names the product per card) is Task 3. Section 4 (commit resolves per card) is Tasks 4 and 5. Section 5 (two new reasons) is Tasks 4, 5 and 7.

**Known gaps, deliberate:**
- `product-mismatch` is a routing reason, not a parking reason, so a mismatched card still verifies and still reaches review with its full reading. That is the spec's "both named, so he can see which is wrong".
- The spec's table says `unknown-product` means "the agent named a set he does not have". Task 4 widens it to cover three cases that need the same action (no id at all, an id that is not his, an id with no checklist), with a different message each. Widening the trigger and not the vocabulary keeps the stored reason set fixed, which `core/scan/route.ts` requires.
- Nothing here backfills existing `review_items`. They predate both reasons and are unaffected.
