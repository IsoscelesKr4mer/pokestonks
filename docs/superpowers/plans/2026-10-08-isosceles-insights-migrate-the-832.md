# Migrating The 832 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Michael's 832 existing `baseball_cards` rows become real `cards` rows in the new app, verified against the checklist on the way in, with their eBay linkage and sale history intact.

**Architecture:** Both apps share one Postgres, so this is a transform inside one database, not an export and import. Every row is mapped to a product and a parallel, run through the EXISTING hard gate, and either committed or parked with the reason it failed. Nothing is re-read from a photograph except what the gate rejects.

**Tech Stack:** Next.js 16, Drizzle ORM, Supabase Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-migrating-the-832.md`

## Global Constraints

- **NEVER run `drizzle-kit push`.** If a migration is needed: `npm run db:generate`, READ the SQL, `npm run db:migrate`, then `npm run setup:test-schema`. **A migration is two commands.** Running only the first leaves `iso_test` stale and ~66 tests fail in a way that looks like a broken migration and is not.
- **`baseball_cards` is Michael's live ledger and the source of truth for his eBay linkage. This plan NEVER deletes from it, never updates it, and never drops a column on it.** It reads. A migration that loses `ebay_item_id` or `sold_price_cents` has destroyed something no photograph can rebuild.
- **The hard gate does not loosen.** `core/products/verify.ts` and `core/scan/verify.ts` keep their behaviour exactly. A card number must exist in a checklist and the player must match.
- **Every run is idempotent and re-runnable.** Running the migration twice must not double anything.
- **Money is integer cents.** Dates ISO. No em dashes in user-facing copy.
- **Falsify every guard two ways.** A falsification that reds zero tests is a finding, not a pass.
- **Never retype or reconstruct the thing under test.** Import the module; a bash heredoc has eaten backslashes out of a regex three times in this repo.
- **Before declaring done:** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, all clean. Read the `Tests` line, never a shell `&&` chain's exit code.

---

## Measured facts this plan rests on

| measure | value |
|---|---|
| rows in `baseball_cards` | 832 |
| map to a product on `<year> <product_name>` | 778 |
| match a checklist entry on card number AND player | 745 of 800 with a usable number |
| carry `"base"` or `"insert"` as their parallel | ~378 |
| sold | 54 |
| flagged duplicates (`duplicate_of_id`) | 59 |
| no usable card number | 32 |

---

### Task 1: Resolve a row to a product, as a pure function

**Files:**
- Create: `core/migrate/resolveProduct.ts`
- Test: `tests/unit/migrate/resolve-product.test.ts`

**The trap this task exists to close.** `<year> <product_name>` is NOT unique: products 49 and 50 are both "2026 Bowman Chrome", Hobby and Mega. Keyed on that string alone, one silently shadows the other and **all 230 Bowman Chrome cards land on the wrong product**. This is the same shape as the Bowman vs Bowman Chrome collision that cost nine vault rows.

**The disambiguator is the parallel**, which the old table carries: `Mojo Refractor` and `Lazer Refractor` are mega-exclusive ladders, and `(mega box)` appears in some parallel strings verbatim.

```ts
export type OldRow = { setName: string | null; parallel: string | null };
export type ProductOption = { id: number; year: number; productName: string; format: string | null };

export type ProductResolution =
  | { ok: true; productId: number; usedFormatHint: boolean }
  | { ok: false; reason: 'no-year' | 'unknown-set' | 'ambiguous-format'; detail: string };
```

Rules, each its own test:
1. Strip a trailing `(... insert)` qualifier. An insert is a `checklist_entries.insert_name`, not a product.
2. `"2026 Bowman Chrome Prospects"` and `"... Prospect Autographs"` alias to the base Bowman Chrome product. Prospects is a subset.
3. Key on `<year> <product_name>`; when exactly one product matches, take it.
4. When MORE than one matches (the Hobby/Mega case), use the parallel: `/mojo|lazer|mega/i` means Mega, anything else means Hobby. If the parallel cannot decide, return `ambiguous-format` rather than picking.
5. A set name with no leading 4-digit year returns `no-year`. A colour or a chrome finish without a year is meaningless, and the Sapphire ladder changes yearly.
6. No product matches at all returns `unknown-set` naming it.

- [ ] Failing tests from the real data (use the real set names in the spec's table), implement, then falsify twice: delete the format hint and confirm an ambiguity test reds; force `usedFormatHint` always true and confirm a different test reds.

---

### Task 2: Resolve a row to a parallel, as a pure function

**Files:**
- Create: `core/migrate/resolveParallel.ts`
- Test: `tests/unit/migrate/resolve-parallel.test.ts`

~378 of 832 carry `"base"` or `"insert"`, which are **not parallels**. They map to a null `parallelId`, which is what a base card already means in the new schema.

```ts
export type ParallelResolution =
  | { ok: true; parallelId: number | null }   // null is a real answer: base
  | { ok: false; reason: 'unknown-parallel'; detail: string };
```

Rules:
1. Null, empty, `base`, `insert`, or either with a trailing qualifier in brackets (`base (COMMON tier)`, `insert (Refractor)`) resolves to `parallelId: null`. **Except**: `insert (Refractor)` names a real parallel inside the brackets. Decide and test which wins; say which you chose and why.
2. Otherwise match against that product's own parallels with the SAME normalisation the scan uses. Import it from `core/scan/parallel.ts`; do not retype it.
3. No match returns `unknown-parallel` naming the string, so the card parks rather than committing with a wrong parallel.

- [ ] Failing tests, implement, falsify.

---

### Task 3: The migration itself, dry run by default

**Files:**
- Create: `scripts/migrate-baseball-cards.ts`
- Test: `tests/unit/migrate/migrate.test.ts`

Reads `baseball_cards`, resolves product and parallel, runs `verifyAgainstChecklist`, and reports. **Writes nothing without `--apply`.**

For every row it produces one of:
- **committed**: a `cards` row, plus its eBay/sale data carried across
- **parked**: with the reason (`no-year`, `unknown-set`, `ambiguous-format`, `unknown-parallel`, or the gate's own `unknown_card_number` / `player_mismatch` / `ambiguous_insert`)

**What must be carried across, since no photograph can rebuild it:** `ebay_item_id`, `ebay_sku`, `ebay_offer_id`, `sold_price_cents`, `sold_date`, `asking_price_cents`, `photo_urls`, `notes`, `for_sale`. Check the new schema for where each belongs (`card_listings` and `card_sales` exist); anything with no home is a finding to report, not a field to drop.

**Idempotency:** a second run commits nothing new. Key on something stable; `baseball_cards.id` recorded on the card is the obvious choice, and if there is no column for it, that is a schema question to raise before writing.

**`duplicate_of_id`:** 59 rows point at another row. The new schema has `quantity` instead. Decide whether a duplicate becomes a quantity bump or its own row, and say which.

- [ ] Dry run first and report the real counts before anything is applied. The plan's acceptance is that the dry run's numbers are defensible, not that it ran.

---

### Task 4: Apply, verify, and report what parked

**Files:** the same script, plus a written outcome.

- [ ] Run with `--apply` inside one transaction. Assert `baseball_cards` is byte-identical afterwards: same row count, same `ebay_item_id` set, same `sold_price_cents` sum. **If any of those moved, the migration touched the source ledger and must be rolled back.**
- [ ] Report: committed, parked by reason, and the full list of parked rows with enough detail for Michael to act on.
- [ ] The parked rows are the re-read queue. Expect roughly 87; if it is wildly more, the resolvers are wrong and that is the finding.

## Acceptance

Michael's catalogue holds his real collection, every row verified against a checklist, with eBay ids and sold prices intact, and a short list of cards that genuinely need a second look at the photograph.

## Self-Review

**The risk is Task 3/4 and it is not complexity, it is blast radius.** `baseball_cards` is the live ledger behind 514 active eBay listings. This plan only reads it, and Task 4 asserts that in three ways after the fact rather than trusting it.

**Second risk: silent mis-attribution.** 230 cards hang on the Hobby/Mega disambiguation in Task 1. A wrong answer there is not an error, it is 230 cards quietly filed under a product they are not from, which is exactly the failure that cost nine vault rows before.
