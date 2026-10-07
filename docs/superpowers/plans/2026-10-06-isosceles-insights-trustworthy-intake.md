# Isosceles Insights, plan 4 of 7: trustworthy intake and the thin catalogue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the intake pipeline safe to point at 2800 photographs, and build
enough catalogue to see what it produced.

**Architecture:** Four phases. Phase A turns the pair grouping from a
recomputation into stored data the owner controls, which is the only remaining
way a card can be catalogued with another card's parallel. Phase B gives the
review queue an exit from every state it can enter. Phase C is checklist data
quality: HTML sources for the print runs the PDFs do not carry, and a `printRun`
that stops meaning two different things. Phase D is the thin catalogue, build
order item 4, which is what the owner looks at to decide whether to trust the
backfill.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, Drizzle ORM
(`generate` + `migrate` only), Vitest against the isolated `iso_test` schema,
`unpdf`, `exceljs`, `cheerio` (new, Phase C).

**Spec:** `../specs/2026-10-05-card-app-design.md`
**Predecessor outcome:** `2026-10-06-isosceles-insights-scan-and-review-OUTCOME.md`

## Global Constraints

Every task's requirements implicitly include all of these.

- **The application must NEVER call an LLM API.** No model SDK, no API client,
  no seam for one. Model work is a job row drained by the owner's own agent
  session. This is the owner's billing arrangement, not a preference.
- **Never run `drizzle-kit push`.** This Supabase project holds the owner's
  live Pokemon P&L ledger: 17 tables, 832 `baseball_cards`, 548 `sales`, 632
  `purchases`. Migrations are `npx drizzle-kit generate`, then **open and read
  the generated SQL**, confirm it touches only the tables you intend, then
  `npx drizzle-kit migrate`. Then `npm run setup:test-schema` so `iso_test`
  matches.
- **After any migration, count the ledger** and confirm all three numbers are
  unchanged: 832 `baseball_cards`, 548 `sales`, 632 `purchases`.
- **No em dashes in user-facing copy.** Anywhere a person reads it: UI strings,
  Discord messages, script output, error text.
- **Money as integer cents.** Never floats. Format at render only.
- **Dates as ISO `YYYY-MM-DD`** where time is not meaningful. Read a Postgres
  `DATE` as `::text`, never through a JS `Date`, which renders a day early in
  Pacific.
- **Tests run against `iso_test`.** `tests/setup.ts` refuses to start otherwise
  and blanks `DISCORD_WEBHOOK_URL` for the whole suite. Do not weaken either.
- `npm test`, `npx tsc --noEmit` and `npm run build` must all be clean before
  any task is reported done. The build is not optional: static export catches
  prerender and Suspense bugs that compile fine.
- Conventional commits. Do not push; the controller handles pushes and deploys.

## A standing rule this plan inherits

Plan 3 caught **six** tests that looked like a guard and were not. Before
reporting any task done: for every predicate, filter, scoping clause or
ordering your task added, **delete it, run the suite, and watch something go
red.** Then restore it. If nothing fails, the test does not test it. Say so in
your report rather than quietly moving on. A test nobody has watched fail is
not evidence.

---

## File Structure

**Phase A, stored grouping**
- Modify `lib/db/schema/photos.ts` — add `pairIndex`, `excluded`
- Create `drizzle/0014_*.sql` — generated, read before applying
- Modify `core/ingest/pairing.ts` — `pairPhotos` gains a stored-grouping branch
- Modify `core/ingest/batches.ts` — `batchPairsFor`, `confirmPairing`, the
  assignment type
- Modify `app/api/batches/[batchId]/confirm/route.ts` — validate the new shape
- Modify `app/ingest/[batchId]/pairing-grid.tsx` — exclude, split, merge
- Test `tests/unit/ingest/pairing.test.ts`, `tests/unit/ingest/batches.test.ts`,
  `tests/unit/api/confirm.test.ts`

**Phase B, review exits**
- Create `app/api/review/[itemId]/candidates/route.ts`
- Modify `core/review/items.ts` — `candidatesFor`, a `checklist-problem`
  decision
- Modify `app/review/[itemId]/decision-form.tsx`
- Test `tests/unit/review/items.test.ts`

**Phase C, checklist data**
- Modify `core/checklist/extract.ts` — `fromHtml`
- Modify `data/product-registry.json` — HTML sources for the two Bowman products
- Modify `core/checklist/types.ts`, `core/checklist/odds.ts` — `printRunKnown`
- Modify `lib/db/schema/parallels.ts`, plus a generated migration (number it
  whatever `drizzle-kit generate` assigns; Phase A takes 0014, Task 6 and
  Task 8 take the next two in execution order)
- Test `tests/unit/checklist/extract.test.ts`, `odds.test.ts`

**Phase D, thin catalogue**
- Create `core/cards/list.ts`, `core/cards/detail.ts`
- Create `app/cards/page.tsx`, `app/cards/[cardId]/page.tsx`
- Modify `app/page.tsx` — link it
- Test `tests/unit/cards/list.test.ts`

---

# Phase A: the grouping becomes data

## Why this phase exists

`core/ingest/pairing.ts`'s `pairPhotos` walks the batch's photos in capture
order and pairs them two at a time. The confirm screen can swap the two sides
of a pair, and that is all it can do. Nothing can exclude a photo or move a
pair boundary.

So a single stray shot in the middle of a rip (a wrapper, a duplicate, a blurry
retake, a photograph of the box) shifts every pair after it by one. Each card's
front is then paired with the **next** card's back. The back is where the
parallel marker is printed. The scan reads a real front and a real back, both
confidently, and commits a card that does not exist, with no warning anywhere,
because every individual reading was correct.

The whole-branch reviewer rated this the second most consequential thing on the
branch. It is first now because the thing ahead of it is closed.

The fix is not a better guess. It is to stop guessing: the owner's grouping is
recorded on the photo rows at confirm time, and every consumer reads it back
instead of re-deriving it.

---

### Task 1: Store the grouping on the photo

**Files:**
- Modify: `lib/db/schema/photos.ts`
- Create: `drizzle/0014_*.sql` (generated)
- Test: `tests/unit/db/photos.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces: `photos.pairIndex: number | null`, `photos.excluded: boolean`.
  Task 2 reads both; Task 3 writes both.

- [ ] **Step 1: Add the two columns**

In `lib/db/schema/photos.ts`, inside the column block after `side`:

```ts
    /**
     * Which pair this photo belongs to inside its batch, 0-based, as the
     * owner grouped it on the confirm screen. Null until the batch is
     * confirmed, and null forever on an excluded photo.
     *
     * Before this column existed, the grouping was recomputed from capture
     * order on every read, so a single stray shot in the middle of a rip
     * shifted every pair after it and each card's front was paired with the
     * next card's back. Recording the owner's answer is the only way the
     * grouping he approved is the grouping that commits.
     */
    pairIndex: integer('pair_index'),
    /**
     * Set when the owner says this photo is not a card side: a wrapper, a
     * box shot, a blurry retake. Excluded photos keep their row (the
     * content hash still protects against a re-drop) but take no part in
     * pairing, the brief, or the commit.
     */
    excluded: boolean('excluded').notNull().default(false),
```

Add `boolean` to the `drizzle-orm/pg-core` import list.

In the table's second argument, add:

```ts
    // Two photos in one batch cannot hold the same side of the same pair.
    // Partial, because an unconfirmed batch has pairIndex null on every row
    // and 'unknown' on every side, and a table-wide constraint would make
    // the second such photo in a batch uninsertable.
    pairSideUnique: uniqueIndex('photos_batch_pair_side_unique')
      .on(t.batchId, t.pairIndex, t.side)
      .where(sql`${t.pairIndex} IS NOT NULL AND ${t.excluded} = false`),
```

Add `uniqueIndex` to the import list.

- [ ] **Step 2: Write the failing test**

In `tests/unit/db/photos.test.ts`, following the shape of the existing
constraint tests in `tests/unit/db/review-items.test.ts`:

```ts
it('refuses two fronts in the same pair of the same batch', async () => {
  const batchId = await seedBatch(userId);
  await insertPhoto({ batchId, userId, side: 'front', pairIndex: 0 });
  await expect(
    insertPhoto({ batchId, userId, side: 'front', pairIndex: 0 })
  ).rejects.toThrow(/photos_batch_pair_side_unique/);
});
```

**Every constraint-name assertion in this plan is written wrong, deliberately
left visible.** `.rejects.toThrow(/constraint_name/)` does NOT see the
constraint name on this stack: drizzle wraps every error in
`DrizzleQueryError`, whose own `.message` is only `"Failed query: ..."`, and
the real Postgres text is on `.cause`. Task 1 hit this and corrected it; I
failed to propagate the correction, and Task 6's implementer hit the same
snippet and caught it again, this time proving it properly by reverting the
CHECK to accept anything and confirming the literal assertion would still
have passed. **Use this repo's existing `causeMessage` helper**, the pattern
in `tests/unit/db/review-items.test.ts`. A correction made in one task is not
made until it is propagated to every task that copied the pattern.
```ts

it('allows many unconfirmed photos, which all have a null pair index', async () => {
  const batchId = await seedBatch(userId);
  await insertPhoto({ batchId, userId, side: 'unknown', pairIndex: null });
  await expect(
    insertPhoto({ batchId, userId, side: 'unknown', pairIndex: null })
  ).resolves.toBeDefined();
});

it('allows an excluded photo to sit alongside a real pair', async () => {
  const batchId = await seedBatch(userId);
  await insertPhoto({ batchId, userId, side: 'front', pairIndex: 0 });
  await expect(
    insertPhoto({ batchId, userId, side: 'front', pairIndex: 0, excluded: true })
  ).resolves.toBeDefined();
});
```

**Correction, made after Task 1 shipped and a reviewer checked the premise.**
The paragraph that used to sit here claimed test 2 would fail without the
partial `WHERE`. It would not. Postgres never treats two nulls as equal in a
unique index unless it is declared `NULLS NOT DISTINCT`, and this one is not,
so two unconfirmed photos could never collide with or without
`pair_index IS NOT NULL`. **Test 3 is the one doing real work**, on the
`excluded = false` half, which is the half that is actually about
correctness. The `IS NOT NULL` half earns its place by keeping the index off
every unconfirmed row (a rip is up to 160 of them), not by preventing a
conflict. The shipped code carries this corrected reasoning in its comments.

- [ ] **Step 3: Run it and watch it fail**

`npx vitest run tests/unit/db/photos.test.ts`
Expected: fails, `column "pair_index" does not exist`.

- [ ] **Step 4: Generate and read the migration**

```bash
npx drizzle-kit generate
```

**Open the generated SQL file and read it.** It must contain exactly: two
`ALTER TABLE "photos" ADD COLUMN`, and one `CREATE UNIQUE INDEX ... WHERE`.
If it contains a `DROP`, or touches any table other than `photos`, stop and
report rather than applying it.

- [ ] **Step 5: Apply, sync the test schema, count the ledger**

```bash
npx drizzle-kit migrate
npm run setup:test-schema
```

Then count `baseball_cards`, `sales` and `purchases` and confirm 832 / 548 /
632. Put the three numbers in your report.

- [ ] **Step 6: Run the tests, then break the index and watch it fail**

All three pass. Then prove the index is doing the work: drop it by hand
against `iso_test` (`DROP INDEX iso_test.photos_batch_pair_side_unique`) and
re-run the first test. It must go red. Recreate it with
`npm run setup:test-schema`.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema/photos.ts lib/db/migrations tests/unit/db/photos.test.ts
git commit -m "feat(ingest): record the owner's pair grouping on the photo"
```

---

### Task 2: Read the stored grouping back

**Files:**
- Modify: `core/ingest/pairing.ts`
- Modify: `core/ingest/batches.ts`
- Test: `tests/unit/ingest/pairing.test.ts`

**Interfaces:**
- Consumes: `photos.pairIndex`, `photos.excluded` from Task 1.
- Produces: `Pairable` gains `pairIndex: number | null` and
  `excluded: boolean`. `pairPhotos` keeps its signature
  `(photos: T[]) => { pairs: Pair<T>[]; confident: boolean }`. Tasks 3 and 4
  depend on both.

**The rule:** if **any** photo in the input carries a non-null `pairIndex`, the
stored grouping is authoritative for the whole batch and position is ignored
entirely. Otherwise fall back to today's positional pairing, which is still
exactly right as the confirm screen's opening guess.

Not "per photo", deliberately. A half-stored grouping mixed with a positional
guess is the ambiguity this task exists to remove, and a batch is confirmed in
one transaction so it cannot legitimately be half-stored.

- [ ] **Step 1: Write the failing tests**

```ts
it('uses the stored grouping, not position, when one exists', () => {
  // Capture order 1,2,3,4. The owner grouped 1 with 3 and 2 with 4.
  const { pairs } = pairPhotos([
    p({ id: 1, pairIndex: 0, side: 'front' }),
    p({ id: 2, pairIndex: 1, side: 'front' }),
    p({ id: 3, pairIndex: 0, side: 'back' }),
    p({ id: 4, pairIndex: 1, side: 'back' }),
  ]);
  expect(pairs).toEqual([
    { front: expect.objectContaining({ id: 1 }), back: expect.objectContaining({ id: 3 }) },
    { front: expect.objectContaining({ id: 2 }), back: expect.objectContaining({ id: 4 }) },
  ]);
});

it('leaves excluded photos out of the pairs entirely', () => {
  const { pairs } = pairPhotos([
    p({ id: 1, pairIndex: 0, side: 'front' }),
    p({ id: 2, pairIndex: null, excluded: true }),
    p({ id: 3, pairIndex: 0, side: 'back' }),
  ]);
  expect(pairs).toHaveLength(1);
  expect(pairs[0].back?.id).toBe(3);
});

it('orders pairs by pair index, not by the order rows arrived', () => {
  const { pairs } = pairPhotos([
    p({ id: 9, pairIndex: 1, side: 'front' }),
    p({ id: 1, pairIndex: 0, side: 'front' }),
  ]);
  expect(pairs.map((x) => x.front.id)).toEqual([1, 9]);
});

it('still pairs by position when nothing is stored', () => {
  const { pairs } = pairPhotos([
    p({ id: 1, pairIndex: null }),
    p({ id: 2, pairIndex: null }),
    p({ id: 3, pairIndex: null }),
  ]);
  expect(pairs).toHaveLength(2);
  expect(pairs[1].back).toBeNull();
});

it('reports confident false for a stored grouping', () => {
  // Confidence describes a guess. A grouping the owner approved is not one,
  // and the page's "check these carefully" copy would read as nonsense.
  const { confident } = pairPhotos([
    p({ id: 1, pairIndex: 0, side: 'front' }),
    p({ id: 2, pairIndex: 0, side: 'back' }),
  ]);
  expect(confident).toBe(false);
});
```

`p()` is a local helper returning a `Pairable` with sensible defaults
(`shotAt: null`, `side: 'unknown'`, `excluded: false`).

- [ ] **Step 2: Run them and watch them fail**

`npx vitest run tests/unit/ingest/pairing.test.ts`
Expected: the first four fail.

- [ ] **Step 3: Implement**

Widen the type and add the branch:

```ts
export type Pairable = {
  id: number;
  shotAt: Date | null;
  side: string;
  pairIndex: number | null;
  excluded: boolean;
};
```

At the top of `pairPhotos`, before the positional loop:

```ts
  const live = photos.filter((p) => !p.excluded);
  if (live.length === 0) return { pairs: [], confident: false };

  // If the owner has confirmed this batch, his grouping is the answer and
  // capture position is not consulted at all. Any non-null pairIndex means
  // confirmed: a batch is confirmed in one transaction, so it is never
  // half-stored, and mixing a stored grouping with a positional guess would
  // reintroduce exactly the ambiguity the column exists to remove.
  if (live.some((p) => p.pairIndex !== null)) {
    return { pairs: fromStoredGrouping(live), confident: false };
  }
```

and the helper below:

```ts
function fromStoredGrouping<T extends Pairable>(live: T[]): Pair<T>[] {
  const byIndex = new Map<number, T[]>();
  // A null pairIndex inside a confirmed batch is a data fault. It cannot
  // happen today (a batch is confirmed in one transaction) but if it ever
  // does, every such photo must still reach the grid and the brief.
  const orphans: T[] = [];

  for (const photo of live) {
    if (photo.pairIndex === null) {
      orphans.push(photo);
      continue;
    }
    const bucket = byIndex.get(photo.pairIndex);
    if (bucket) bucket.push(photo);
    else byIndex.set(photo.pairIndex, [photo]);
  }

  const pairs = [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const front = group.find((p) => p.side === 'front') ?? group[0];
      const back = group.find((p) => p !== front) ?? null;
      return { front, back };
    });

  // Each orphan becomes its own single-photo pair. Bucketing them all under
  // one shared key and picking a front and a back out of it surfaces only
  // the first two and silently drops the rest. Pairing them with each other
  // is worse than a singleton: it fabricates a card out of two photographs
  // that nothing says belong together, and the back is what carries the
  // parallel marker.
  for (const orphan of orphans) pairs.push({ front: orphan, back: null });

  return pairs;
}
```

**That shared-key version is what this plan originally prescribed and it was
wrong**, caught by Task 2's review and fixed in commit `099bb34`. Left here
corrected rather than silently replaced, because the failure is worth
recognising: five live photos with three orphans returned four pairs, and the
fifth photo vanished with no exclusion flag and no trace.

- [ ] **Step 4: Fix the call sites**

`core/ingest/batches.ts`'s `batchPhotosForPairingQuery` selects whole rows, so
`pairIndex` and `excluded` arrive automatically and `batchPairsFor` needs no
change. Add `isFalse` style filtering **only** if tsc complains; it should not.

Run `npx tsc --noEmit` and fix any `Pairable` shape errors in test fixtures.

- [ ] **Step 5: Run the suite, then break it**

All green. Then delete the `if (live.some(...))` branch and confirm the first
three tests go red. Restore.

- [ ] **Step 6: Commit**

```bash
git add core/ingest/pairing.ts tests/unit/ingest/pairing.test.ts
git commit -m "feat(ingest): read the stored pair grouping instead of guessing"
```

---

### Task 3: Confirm writes the grouping

**Files:**
- Modify: `core/ingest/batches.ts`
- Modify: `app/api/batches/[batchId]/confirm/route.ts`
- Test: `tests/unit/ingest/batches.test.ts`, `tests/unit/api/confirm.test.ts`

**Interfaces:**
- Consumes: Task 1's columns, Task 2's reader.
- Produces: `PhotoAssignment` becomes
  `{ photoId: number; side: 'front' | 'back'; pairIndex: number } | { photoId: number; excluded: true }`.
  Task 4's grid builds this payload.

**A name collision worth understanding before you start, not a bug.**
`review_items.pair_index` already exists and means the same thing: which pair
of a batch a row refers to. Until now the two agreed only because both were
derived from the same positional walk over the same ordered query. After this
task they agree because `photos.pair_index` is the stored answer and
`batchPairsFor` returns pairs in its order, so the index a review item carries
is the index of the pair the owner actually approved. Do not try to unify the
columns or add a foreign key between them; they live on different tables with
different lifetimes. Just do not confuse them while editing
`scripts/scan-commit.ts`, which handles both.

- [ ] **Step 1: Widen the type**

In `core/ingest/batches.ts`:

```ts
export type PhotoAssignment =
  | { photoId: number; side: 'front' | 'back'; pairIndex: number }
  | { photoId: number; excluded: true };
```

Add two refusal reasons to `ConfirmResult`: `'bad-grouping'` and
`'nothing-left'`.

- [ ] **Step 2: Write the failing tests**

```ts
it('refuses a grouping with three photos in one pair', async () => {
  const r = await confirmPairing(userId, batchId, productId, [
    { photoId: a, side: 'front', pairIndex: 0 },
    { photoId: b, side: 'back', pairIndex: 0 },
    { photoId: c, side: 'front', pairIndex: 0 },
  ]);
  expect(r).toEqual({ ok: false, reason: 'bad-grouping' });
});

it('refuses a grouping with two fronts in one pair', async () => {
  const r = await confirmPairing(userId, batchId, productId, [
    { photoId: a, side: 'front', pairIndex: 0 },
    { photoId: b, side: 'front', pairIndex: 0 },
  ]);
  expect(r).toEqual({ ok: false, reason: 'bad-grouping' });
});

it('refuses a batch where every photo was excluded', async () => {
  const r = await confirmPairing(userId, batchId, productId, [
    { photoId: a, excluded: true },
    { photoId: b, excluded: true },
  ]);
  expect(r).toEqual({ ok: false, reason: 'nothing-left' });
  // And nothing was written: no scan job, no confirmedAt.
  const meta = await getBatchMeta(userId, batchId);
  expect(meta?.confirmedAt).toBeNull();
});

it('writes the grouping and excludes what the owner excluded', async () => {
  const r = await confirmPairing(userId, batchId, productId, [
    { photoId: a, side: 'front', pairIndex: 0 },
    { photoId: stray, excluded: true },
    { photoId: b, side: 'back', pairIndex: 0 },
  ]);
  expect(r.ok).toBe(true);
  const { pairs } = await batchPairsFor(userId, batchId);
  expect(pairs).toHaveLength(1);
  expect(pairs[0].front.id).toBe(a);
  expect(pairs[0].back?.id).toBe(b);
});

it('still requires every unfailed photo to be accounted for', async () => {
  const r = await confirmPairing(userId, batchId, productId, [
    { photoId: a, side: 'front', pairIndex: 0 },
  ]);
  expect(r).toEqual({ ok: false, reason: 'incomplete-assignments' });
});

it('counts pairs, not photos, in the Discord ping', async () => {
  // Three photos, one of them excluded, is one pair and must not report two.
  ...
  expect(notifyScanEnqueued).toHaveBeenCalledWith(
    expect.objectContaining({ pairCount: 1 })
  );
});
```

The last one is a real defect being fixed, not a formality: the existing code
computes `Math.ceil(assignments.length / 2)`, which counts excluded photos.

- [ ] **Step 3: Run them and watch them fail**

- [ ] **Step 4: Implement the validation and the write**

Insert validation after the existing `uncovered` check and before the side
updates:

```ts
  // Validate the grouping before writing any of it. Three photos in one
  // pair, or two of the same side, is not a thing a correct grid can
  // produce, so it means either a hand-rolled POST or a grid bug, and
  // either way committing it would mint a card from two unrelated
  // photographs. The partial unique index added in Task 1 would also catch
  // it, but as a 500 after a partial write rather than a refusal.
  const sides = new Map<number, Set<string>>();
  for (const a of assignments) {
    if ('excluded' in a) continue;
    const seen = sides.get(a.pairIndex) ?? new Set<string>();
    if (seen.has(a.side) || seen.size >= 2) {
      return { ok: false, reason: 'bad-grouping' };
    }
    seen.add(a.side);
    sides.set(a.pairIndex, seen);
  }
  if (sides.size === 0) {
    return { ok: false, reason: 'nothing-left' };
  }
```

Replace the two `inArray` updates with three, adding the excluded one, and set
`pairIndex` alongside `side`. Because `pairIndex` differs per photo, the single
`inArray` per side no longer works. Use one `CASE` expression rather than a
per-photo loop, which Task 10 of plan 2 established would be 160 serial round
trips:

```ts
  const graded = assignments.filter((a) => !('excluded' in a));
  if (graded.length > 0) {
    const cases = sql.join(
      graded.map((a) => sql`WHEN ${a.photoId} THEN ${a.pairIndex}`),
      sql` `
    );
    await db
      .update(photos)
      .set({
        side: sql`CASE ${photos.id} ${sql.join(
          graded.map((a) => sql`WHEN ${a.photoId} THEN ${a.side}`),
          sql` `
        )} ELSE ${photos.side} END`,
        pairIndex: sql`CASE ${photos.id} ${cases} ELSE ${photos.pairIndex} END`,
        excluded: false,
      })
      .where(and(
        eq(photos.userId, userId),
        eq(photos.batchId, batchId),
        inArray(photos.id, graded.map((a) => a.photoId))
      ));
  }
```

and the excluded set as one plain `inArray` update to
`{ excluded: true, pairIndex: null, side: 'unknown' }`.

**This CASE construction is verified, not proposed.** The controller built it
against the real schema and ran `.toSQL()`: it generates valid parameterised
SQL, with the side strings and pair indexes as bound parameters rather than
interpolated text.

Two things about it that are load-bearing:

- **The `ELSE ${photos.side} END` and `ELSE ${photos.pairIndex} END` are not
  just there to preserve values for rows the CASE misses** (the `inArray`
  already guarantees there are none). They give Postgres a concretely typed
  expression to unify the branches against. Every `WHEN ... THEN ...` value is
  an untyped bind parameter, and `pair_index` is `integer` while `side` is
  `text`; the column reference in the ELSE is what pins each CASE's type.
  Drop the ELSE and you are relying on assignment-context inference.
- **Order the two statements graded-first, excluded-second.** Task 1's partial
  unique index covers `(batch_id, pair_index, side) WHERE pair_index IS NOT
  NULL AND excluded = false`, and these are two separate statements with no
  transaction around them. On a first confirm every `pair_index` is NULL
  beforehand, so the index covers nothing until the graded write lands and
  there is no transient violation either way. That safety comes from
  `confirmPairing` refusing an already-confirmed batch, not from the ordering,
  so if a re-confirm path is ever added this becomes a real hazard. Leave a
  comment saying so.

Fix the ping: `pairCount: sides.size`.

- [ ] **Step 5: Update the route's validator**

`isValidAssignment` must accept both arms of the union and reject anything
else, including a `pairIndex` that is negative or not an integer. Map
`'bad-grouping'` and `'nothing-left'` to 400 with:

- `bad-grouping` → `'That grouping does not work. Each pair needs one front and at most one back.'`
- `nothing-left` → `'Every photo in this batch was excluded, so there is nothing to scan.'`

No em dashes.

- [ ] **Step 6: Run everything, break each new guard, restore**

- [ ] **Step 7: Commit**

```bash
git add core/ingest/batches.ts "app/api/batches/[batchId]/confirm/route.ts" tests
git commit -m "feat(ingest): confirm records the grouping and refuses an impossible one"
```

---

### Task 4: The confirm screen can regroup

**Files:**
- Modify: `app/ingest/[batchId]/pairing-grid.tsx`
- Modify: `app/ingest/[batchId]/page.tsx`
- Test: none automated; this is the manual-probe task. See Step 5.

**Interfaces:**
- Consumes: Task 3's `PhotoAssignment` union.
- Produces: nothing later tasks read.

Three operations, which together are a complete algebra over the grouping:

1. **Exclude a photo.** It leaves the pairs and moves to a muted strip at the
   bottom labelled "Not cards", with an Undo. This is the one that fixes the
   offset: excluding the stray realigns everything after it.
2. **Split a pair** into two single-photo pairs.
3. **Merge** a single-photo pair with the single-photo pair after it.

Plus the existing Swap, unchanged.

- [ ] **Step 1: Restructure the client state**

The grid's state becomes a flat ordered list, because merge and split both
change how many tiles there are:

```ts
type Slot = { front: Side; back: Side | null; key: number };
const [slots, setSlots] = useState<Slot[]>(...);
const [excluded, setExcluded] = useState<Side[]>([]);
```

`key` is a monotonic counter minted once per slot and never reused, so React
keeps image elements mounted across a split or merge instead of reloading
every photo from Supabase. Do not key on `front.id`: that is what the existing
`pairId` comment already warns about, and merge changes it.

- [ ] **Step 2: The three operations**

```tsx
function excludePhoto(slotIndex: number, which: 'front' | 'back') { ... }
function splitSlot(slotIndex: number) { ... }   // disabled unless slot.back
function mergeDown(slotIndex: number) { ... }   // disabled unless this slot
                                                // has no back AND the next
                                                // slot exists and has no back
```

**The exact semantics, because this task ships without automated tests and a
reviewer needs something to check against.** Work through every one of these:

| Action | Case | Result |
|---|---|---|
| Exclude | the back of a two-photo slot | slot keeps its front, back becomes null |
| Exclude | the front of a two-photo slot | the back is **promoted to front**, slot has no back |
| Exclude | the only photo in a slot | the slot disappears; every slot after it shifts up |
| Put back | a photo from the Not cards strip | it becomes **its own new slot, appended last**, never re-inserted where it came from. Position is the owner's to restore with merge; guessing it is how the offset bug comes back. |
| Split | a two-photo slot | two slots, in the same order, each with a front and no back |
| Split | a one-photo slot | disabled |
| Merge | this slot and the next, both single | one slot: this photo front, the next photo back |
| Merge | either slot already has a back | disabled |
| Merge | the last slot | disabled, there is no next |
| Swap | a one-photo slot | disabled, as today |

`pairIndex` is the slot's position after every edit, so it stays dense and
ordered by construction. Nothing recomputes it from capture time again.

- [ ] **Step 3: Build the payload**

```ts
const assignments: PhotoAssignment[] = [
  ...slots.flatMap((s, i) =>
    s.back
      ? [
          { photoId: s.front.id, side: 'front' as const, pairIndex: i },
          { photoId: s.back.id, side: 'back' as const, pairIndex: i },
        ]
      : [{ photoId: s.front.id, side: 'front' as const, pairIndex: i }]
  ),
  ...excluded.map((e) => ({ photoId: e.id, excluded: true as const })),
];
```

`pairIndex` is the slot's position after all edits, so it is dense and ordered
by construction.

- [ ] **Step 4: Copy**

Above the grid, when anything is excluded:
`'2 photos set aside as not cards.'` (singular form when 1.)
The excluded strip's heading: `'Not cards'`, with a `Put back` button per tile.
No em dashes anywhere.

- [ ] **Step 5: Prove it by hand, against a real batch**

This is a UI task and a unit test of the grid proves very little. Instead:

1. `npm run build` must be clean.
2. Upload a small real batch with a deliberate stray photo in the middle.
   His originals are in
   `C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/card drop`
   (1,104 files). **Do not reorder, rename or move anything in that folder.**
   Copy six or eight of them plus one obvious non-card into a staging
   directory and point `CARD_DROP_DIR` at that, which is what the environment
   variable exists for. Run the dev server and `npm run upload:drop`.
3. Exclude the stray, confirm, and then **query the database directly** and
   show the resulting `(id, side, pair_index, excluded)` rows in your report.
4. Run `npm run scan:next` and show that the brief's pairs match what you
   grouped, specifically that the card after the stray has the right back.

Paste the actual rows into your report. A claim without the rows is not a
result.

- [ ] **Step 6: Commit**

```bash
git add "app/ingest/[batchId]"
git commit -m "feat(ingest): exclude, split and merge on the confirm screen"
```

---

### Task 4b: one rip is one batch

**Files:**
- Modify: `core/ingest/intake.ts`
- Test: `tests/unit/ingest/intake.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change. `ingestFiles` gains the ability to append to
  an existing unconfirmed batch.

**Why this exists, and it was found by Task 4's reviewer rather than planned.**

`scripts/watch-card-drop.ts` chunks an upload by size (`chunkBySize`,
`MAX_REQUEST_BYTES = 4MB` in `core/ingest/chunk.ts`) and POSTs **one request
per chunk**. Each POST is an independent call into `ingestFiles`, which
clusters by capture time with `groupByShotAt` **only over the files in that
one call**, then unconditionally inserts a **new** `ingestBatches` row per
cluster. Nothing anywhere looks up a recent batch to extend; the reviewer
confirmed that by grepping every `ingestBatches` reference.

HEIC photos off his phone run a couple of megabytes each, so a 4MB ceiling is
about two photos per request. **A 160-photo rip therefore lands as roughly 80
batches**, each needing its own product choice and its own confirm. Phase A
just built an exclude/split/merge grid that would almost never see a whole
rip.

This is also a correction to a conclusion the controller got wrong. I queried
the live database, found the probe's nine photos sitting in a single batch,
and took that as evidence the fragmentation claim was false. It was not
evidence of anything: the upload really did produce five batches, and the
implementer had merged them by hand with a raw `UPDATE photos SET batch_id`
so its probe would have one batch with the stray genuinely mid-sequence. It
said so in the body of its report, which I had not read, having jumped to the
concerns. **A number read out of a database proves nothing until you know
what wrote it.**

- [ ] **Step 1: Reproduce it before changing anything**

Stage twelve real HEIC photos from the drop folder into a scratch directory,
point `CARD_DROP_DIR` at it, run the dev server and `npm run upload:drop`,
and report how many `ingest_batches` rows appear. State the number. If it is
one, stop and report that instead, because then the mechanism above is wrong
and this task should not be built.

- [ ] **Step 2: Write the failing test**

```ts
it('appends to an open batch from an earlier request in the same session', async () => {
  // Two calls, as the chunked uploader makes them, with capture times inside
  // the session gap.
  await ingestFiles(userId, [file({ shotAt: at('10:00:00') }), file({ shotAt: at('10:00:20') })]);
  await ingestFiles(userId, [file({ shotAt: at('10:00:40') }), file({ shotAt: at('10:01:00') })]);

  const batches = await listBatches(userId);
  expect(batches).toHaveLength(1);
  expect(batches[0].photoCount).toBe(4);
});

it('starts a new batch when the gap is longer than the session window', async () => {
  await ingestFiles(userId, [file({ shotAt: at('10:00:00') })]);
  await ingestFiles(userId, [file({ shotAt: at('12:00:00') })]);
  expect(await listBatches(userId)).toHaveLength(2);
});

it('never appends to a confirmed batch', async () => {
  // A confirmed batch has a scan job against a fixed set of pairs. Adding a
  // photo to it would renumber every pair after the insertion point, which
  // is the exact bug Phase A exists to kill, arriving from the other end.
  const [batch] = await ingestFiles(userId, [file({ shotAt: at('10:00:00') })]);
  await confirmBatch(batch.id);
  await ingestFiles(userId, [file({ shotAt: at('10:00:20') })]);
  expect(await listBatches(userId)).toHaveLength(2);
});

it('never appends to another user\u2019s batch', async () => { ... });
```

- [ ] **Step 3: Implement**

Before inserting, look for a batch belonging to **this user** that is
**unconfirmed**, whose latest photo's `shotAt` is within `groupByShotAt`'s own
gap window of the earliest incoming photo. Reuse that gap constant; do not
introduce a second one. Append to it instead of inserting.

**The confirmed check is the one that matters and it must be a predicate in
the query, not a filter afterwards.** Appending a photo to a confirmed batch
renumbers every pair after the insertion point while a scan job is already
pointing at the old numbering. That is Phase A's bug arriving from the other
direction, and it would be far harder to see.

Photos with a null `shotAt` cannot be placed in a session and must start or
join nothing on timestamp grounds alone; decide what they do, state it, and
test it.

- [ ] **Step 4: Prove it on the same twelve photos**

Re-run Step 1's staging and report the batch count again. Report before and
after. Clean up after yourself: this writes to his live database, so delete
the probe's batches, photos, jobs **and the storage objects** when you are
done, and show the counts returning to where they started. Ledger: 832
`baseball_cards`, 548 `sales`, 632 `purchases`.

- [ ] **Step 5: Commit**

---

# Phase B: every review state has an exit

## Why this phase exists

Two states in the review queue are dead ends, both recorded in plan 3's
outcome as open items 2 and 7.

**Correcting a card number onto a different ambiguous number.** The insert
candidate list is computed once, server side, from the number the agent
originally read. Correct the number to one that is also ambiguous for that
player and no insert selector renders, so the hard gate refuses and the form
cannot satisfy it. It refuses rather than corrupts, which is why it could
wait, but there is no way out of it except Reject.

**A `player_mismatch` caused by bad checklist data.** Accept and Correct both
re-run the gate and both fail. Only Reject works, and Reject throws the card
away. The gate is right and must not loosen: the answer is a third decision
that says the checklist is wrong, not a looser gate.

---

### Task 5: Recompute candidates as the owner types

**Files:**
- Create: `app/api/review/[itemId]/candidates/route.ts`
- Modify: `core/review/items.ts`
- Modify: `app/review/[itemId]/decision-form.tsx`
- Test: `tests/unit/review/candidates.test.ts`

**Interfaces:**
- Consumes: `getReviewItemForOwner`'s existing scoped lookup and its
  `insertCandidates: string[]` field, already rendered by the Correct form.
- Produces: `candidatesFor(userId, itemId, cardNumber): Promise<{ insertCandidates: string[] } | null>`.
  Null means the item is not this user's, indistinguishable from not existing.

**Match the shape that already exists.** `ReviewItemDetail.insertCandidates`
is a plain `string[]` of insert names, computed once from the scanned card
number and player, and `decision-form.tsx` renders the selector only when
`insertCandidates.length > 1`. Return the same `string[]` so the refetch is a
drop-in replacement for the server-rendered value rather than a second,
differently shaped source of the same thing. Do not invent an object shape
with ids; the form does not use one and the hard gate resolves by name.

- [ ] **Step 1: Write the failing tests, scoping first**

```ts
it('returns the candidates for a corrected number, not the scanned one', async () => {
  // The item was scanned as #1. The checklist has one entry at #1 and three
  // inserts at #150 for the same player.
  const out = await candidatesFor(userId, itemId, '150');
  expect(out?.insertCandidates).toHaveLength(3);
});

it('returns null for an item that is not his', async () => {
  expect(await candidatesFor(otherUserId, itemId, '1')).toBeNull();
});

it('never returns another product\u2019s inserts', async () => {
  // A second product also has entries at #150 for the same player, under an
  // insert name that exists nowhere on this item's product.
  const out = await candidatesFor(userId, itemId, '150');
  expect(out?.insertCandidates).not.toContain('Other Product Exclusive');
});

it('returns an empty list rather than null for a number with no entries', async () => {
  // Nothing at #9999. The form must render no selector, and the page must
  // not treat this as "item not found".
  const out = await candidatesFor(userId, itemId, '9999');
  expect(out).toEqual({ insertCandidates: [] });
});
```

The third is the one to break: delete the `productId` predicate and watch it
go red. A candidate list that leaks another product's inserts is how the wrong
insert gets chosen through a UI that looks entirely correct.

The fourth matters because `null` and `[]` mean different things here, and
conflating them turns a legitimate "no such number" into a 404 on an item the
owner is looking at.

- [ ] **Step 2: Implement `candidatesFor`**

Reuse the scoped lookup `getReviewItemForOwner` already uses, so "not yours"
collapses into "not found" by construction rather than by a filter applied
after a broader read, which is the property its own comment calls out. Then
query `checklistEntries` filtered by that item's `productId`, the passed
`cardNumber` and the item's scanned player, ordered by `insertName`, and map
to names. That is the same query `getReviewItemForOwner` runs for its own
`insertCandidates`; extract it so there is one copy rather than two that agree
by coincidence. Plan 3 spent a whole fix round collapsing four such copies of
the pair mapping.

- [ ] **Step 3: The route**

`GET /api/review/[itemId]/candidates?cardNumber=...`. 401 when not signed in,
404 when `candidatesFor` returns null, 400 for a missing or empty
`cardNumber`. Never echo the raw error; log it and return a fixed message, the
way `/api/batches/[batchId]/confirm` already does.

- [ ] **Step 4: Wire the form**

In `decision-form.tsx`, the card-number input currently sits beside a selector
populated once from the server. When the input's value changes and differs
from the item's original number, fetch the candidates (debounced, 300ms) and
replace the options.

While a fetch is in flight, **disable Correct.** On a fetch failure, show
`'Could not load the inserts for that number. Try again.'` and keep Correct
disabled. Submitting against the previous number's candidate list is the exact
bug this task exists to prevent, so failing closed is the whole point.


- [ ] **Step 5: Run, break the product predicate, restore**

- [ ] **Step 6: Commit**

```bash
git add core/review app/api/review app/review tests/unit/review
git commit -m "feat(review): recompute insert candidates when the number changes"
```

---

### Task 6: A checklist-problem exit

**Files:**
- Modify: `core/review/items.ts`
- Modify: `app/review/[itemId]/decision-form.tsx`
- Modify: `app/review/page.tsx`
- Modify: `app/api/review/[itemId]/route.ts`
- Modify: `lib/db/schema/reviewItems.ts` + a generated migration (the status
  CHECK **and** the partial unique index, see below)
- Modify: `scripts/scan-commit.ts` (the `onConflictDoNothing` arbiter)
- Test: `tests/unit/review/items.test.ts`

**Interfaces:**
- Consumes: Task 5's candidate work in the same two files; run 5 before 6.
- Produces: `flagChecklistProblem(userId, itemId, note): Promise<ReviewDecisionOutcome>`,
  a fourth sibling of the existing `acceptReviewItem`, `correctReviewItem` and
  `rejectReviewItem`. It sets `review_items.status = 'checklist_problem'`.

**Match the module's existing shape, do not invent a new one.**
`core/review/items.ts` exposes three separate exported functions, not one
`decide({ kind })` dispatcher, and every outcome is
`{ ok: true, ... } | { ok: false; reason: ...; message: string }` with a
**human-readable `message` on every refusal.** So assert with `toMatchObject`,
never `toEqual`, or the `message` field fails every refusal test. The reason
strings below must match whatever vocabulary the module already uses
(`'not-found'`, `'already-decided'`, `'invalid-input'` are all live); add a
new reason only where none fits.

`reviewItems.status`'s CHECK constraint lists the allowed values and has to be
widened. That needs a migration: generate, **read the SQL**, confirm it touches
only `review_items`, apply, `npm run setup:test-schema`, count the ledger.

- [ ] **Step 1: Decide what it does, and does not do**

It **does not** commit a card and it **does not** loosen the gate. It parks
the item in a state that is neither pending nor rejected and carries the
owner's note, so the card is not thrown away and the queue is not blocked. The
product's checklist is what needs fixing, and that is a re-seed, not a card
decision.

- [ ] **Step 2: Write the failing tests**

```ts
it('parks the item without committing a card', async () => {
  const before = await countCards(userId);
  const r = await flagChecklistProblem(
    userId, itemId, 'Checklist has Guerrero Jr. as Guerrero.'
  );
  expect(r.ok).toBe(true);
  expect(await countCards(userId)).toBe(before);
  const item = await getReviewItemForOwner(userId, itemId);
  expect(item?.status).toBe('checklist_problem');
  expect(item?.decisionNote).toContain('Guerrero');
});

it('requires a note', async () => {
  const r = await flagChecklistProblem(userId, itemId, '   ');
  expect(r).toMatchObject({ ok: false, reason: 'invalid-input' });
});

it('is refused on an already-decided item', async () => {
  await rejectReviewItem(userId, itemId, null);
  const r = await flagChecklistProblem(userId, itemId, 'too late');
  expect(r).toMatchObject({ ok: false, reason: 'already-decided' });
});

it('is refused for another user, and changes nothing', async () => {
  const r = await flagChecklistProblem(otherUserId, itemId, 'not mine');
  expect(r).toMatchObject({ ok: false, reason: 'not-found' });
  expect((await getReviewItemForOwner(userId, itemId))?.status).toBe('pending');
});

it('refuses an invalid status at the database, not just in code', async () => {
  // The widened CHECK must still reject something. A CHECK that accepts
  // anything is the same as no CHECK, and this repo has already shipped one
  // constraint nobody had watched fire.
  await expect(
    db.update(reviewItems).set({ status: 'nonsense' }).where(eq(reviewItems.id, itemId))
  ).rejects.toThrow(/review_items_status_valid/);
});
```

**Every constraint-name assertion in this plan is written wrong, deliberately
left visible.** `.rejects.toThrow(/constraint_name/)` does NOT see the
constraint name on this stack: drizzle wraps every error in
`DrizzleQueryError`, whose own `.message` is only `"Failed query: ..."`, and
the real Postgres text is on `.cause`. Task 1 hit this and corrected it; I
failed to propagate the correction, and Task 6's implementer hit the same
snippet and caught it again, this time proving it properly by reverting the
CHECK to accept anything and confirming the literal assertion would still
have passed. **Use this repo's existing `causeMessage` helper**, the pattern
in `tests/unit/db/review-items.test.ts`. A correction made in one task is not
made until it is propagated to every task that copied the pattern.
```ts
```

A note is required because the only value of this state is telling a future
re-seed what was wrong. Whitespace does not count as a note.

**The interaction you must not miss, and it is not in the schema file's own
comment because the status did not exist when that comment was written.**
`review_items_batch_pair_unique` is a partial index scoped
`WHERE status <> 'rejected'`. Its comment explains the reasoning precisely:
`rejected` is the only status that may let a fresh attempt at the same pair
through, because every other status means a card already exists or is about
to. **`checklist_problem` belongs on the `rejected` side of that line**, and
for the same reason: no card was written, the owner is waiting on a re-seed,
and when he re-seeds and re-scans he must get a fresh pending item rather than
silently nothing. Leave the predicate as it is and a parked item blocks its own
re-scan forever, which is the exact bug plan 3's item 5 fixed for rejections.

So widen the index to `WHERE status NOT IN ('rejected', 'checklist_problem')`
in the same migration, **and** update `scripts/scan-commit.ts`'s
`onConflictDoNothing` arbiter `where` to the identical predicate. The schema
comment says why that second half is mandatory: name a different predicate and
Postgres has no unique constraint left to infer a conflict target from.

Test it both ways: a parked item followed by a re-scan of the same batch
produces a fresh pending item, and an `accepted` item followed by a re-scan
still produces none.


- [ ] **Step 3: Implement, including the status CHECK migration**

- [ ] **Step 4: Surface it in the UI**

A third button, `Checklist is wrong`, with a required note field. Secondary
styling: this is the uncommon path. On `/review`, parked items leave the
pending list and show in a `Checklist problems (N)` section, because a count
nobody can see is a count that does not exist.

- [ ] **Step 5: Run, break the note requirement, restore**

- [ ] **Step 6: Commit**

```bash
git add core/review app/review app/api/review lib/db tests
git commit -m "feat(review): park a card whose checklist is wrong"
```

---

# Phase C: the checklist data

## Why this phase exists

Three products out of six cannot be scanned correctly today.

`print_run` is **0 of 305** on Bowman Chrome and **0 of 521** on Bowman
Football. This is not a parser bug. It was diagnosed as one by a whole-branch
review, and checking the sources disproved that: the PDFs genuinely contain no
print runs, while the `.txt` sources carry 220 to 286 each. Two live HTML pages
carry them in full and were confirmed reachable: `baseball.cards` (581 print
runs for Bowman Chrome) and `degreegrading.com` (567 for Bowman Football).

A null `printRun` currently means both "genuinely unnumbered" and "we could not
read one", which is why the serial cross-check and the scarcity flag went inert
for 826 parallel rows across an entire plan with nothing noticing.

---

### Task 7: Extract text from HTML

**Files:**
- Modify: `core/checklist/extract.ts` (add `fromHtml`)
- Modify: `core/checklist/odds.ts` (one regex, see below)
- Modify: `data/product-registry.json`
- Modify: `package.json` (add `cheerio`)
- Test: `tests/unit/checklist/extract.test.ts`, `tests/unit/checklist/odds.test.ts`

**Interfaces:**
- Produces: `extractText` accepts `.html` and `.htm`.

`extractText` already dispatches on extension to `fromPdf`, `fromXlsx` and a
plain UTF-8 read, and everything downstream is line-based. So HTML support is
one more branch that flattens the document to the same line shape, and the
section and row parsers below it do not change at all.

**The probe is already done. Do not redo it; verify it.**

The controller fetched both pages and read the markup. Here is what is
actually there, measured, so you write the parser against facts rather than a
guess. Re-fetch and confirm these numbers before trusting them; if the pages
have changed, say so and work from what you find.

**`https://www.baseball.cards/checklists/2026-bowman-chrome-baseball/`**
(1.58 MB, HTTP 200). **Tabular.** 7 `<table>`, 1378 `<tr>`, 581 print-run
tokens. Card rows look like:

```
Card # | Player            | Team               | Section | Find this card
1      | Konnor Griffin RC | Pittsburgh Pirates | Base    | Find on eBay
CPA-YM | Yadier Munoz      | Chicago Cubs       | Chrome Prospect Autographs Gold Ink Variation | Find on eBay
```

and, in a separate table, the parallels, which is what this task is for:

```
Refractor                  | /499 | All formats     | See listings
Pulsar Refractor           | /399 | Hobby           | See listings
Purple Geometric Refractor | /250 | Breaker Delight | See listings
Aqua RayWave Refractor     | /199 | All formats     | See listings
```

**`https://www.degreegrading.com/checklists/2026-bowman-football/`**
(908 KB, HTTP 200). **Not tabular at all.** 0 `<table>`, 2705 `<li>`, 440 of
them carrying a print run, in the plain shape the existing parser already
handles:

```
Yellow /275
Pink /250
Aqua /199
Blue /150
Green /99
Purple /75
Gold /50
```

**So the two sources need different handling, and this plan originally
assumed `<tr>` for both. That was wrong.**

- Football needs nothing but "emit each `<li>` as a line". `parseParallelLine`
  already matches `Yellow /275` today.
- Baseball Chrome needs the trailing cells gone. Flattened naively the row
  reads `Refractor /499 All formats See listings`, and `PRINT_RUN` in
  `core/checklist/odds.ts` is anchored at end of string, so it matches
  nothing at all.

- [ ] **Step 1: Re-fetch both pages and confirm the shape above**

Use the same browser user agent `fetch-checklists.ts` sends. Report the byte
counts and element counts you get. If they differ materially from the figures
above, stop and report rather than parsing something you have not looked at.

- [ ] **Step 2: Write the failing tests from the real markup**

Paste a genuine excerpt of each fetched page in as a fixture, not invented
markup. Two fixtures: one `<tr>` block from baseball.cards including the
parallels table, one `<li>` block from degreegrading.com. Assert the lines
`extractText` produces, and assert that `parseChecklistText` over those lines
yields the parallels with their print runs.

- [ ] **Step 3: Implement `fromHtml`**

```ts
async function fromHtml(buffer: Buffer, filename: string): Promise<string> {
  try {
    const $ = cheerio.load(buffer.toString('utf8'));
    $('script, style, nav, header, footer, noscript').remove();
    const lines: string[] = [];

    // A table row flattens to one space-joined line, the same shape fromXlsx
    // already produces, so core/checklist/odds.ts's TABULAR pattern keeps
    // working. Cells whose entire content is a link are navigation, not
    // data: on baseball.cards they are "Find on eBay" and "See listings",
    // one per row, and left in they sit after the print run and defeat
    // PRINT_RUN's end-of-string anchor.
    $('tr').each((_, el) => {
      const cells = $(el)
        .find('th, td')
        .map((__, c) => {
          const cell = $(c);
          const linkText = cell.find('a').text();
          const isLinkOnly =
            cell.find('a').length > 0 &&
            cell.text().replace(linkText, '').trim() === '';
          return isLinkOnly ? '' : cell.text().trim();
        })
        .get()
        .filter(Boolean);
      if (cells.length) lines.push(cells.join(' '));
    });

    // List items carry the parallels on degreegrading.com, one per <li>, in
    // the plain "<name> /<run>" shape the line parser already reads.
    $('li').each((_, el) => {
      const text = $(el).clone().children('ul, ol').remove().end().text().trim();
      if (text) lines.push(text.replace(/\s+/g, ' '));
    });

    return normaliseNewlines(lines.join('\n'));
  } catch (cause) {
    throw new Error(`Failed to extract text from HTML "${filename}"`, { cause });
  }
}
```

The `<li>` handler strips nested lists before taking text, or a top-level nav
item swallows every child and emits one enormous line. Both pages have nested
navigation.

- [ ] **Step 4: One change to `parseParallelLine`, and keep it narrow**

After the link cells are dropped, a baseball.cards parallel row reads
`Refractor /499 All formats`. The print run is no longer trailing, so extend
`PRINT_RUN` to allow a known **format phrase** after it:

```ts
/**
 * The format column on baseball.cards' parallels table, which sits after the
 * print run: "Purple Geometric Refractor /250 Breaker Delight". These are
 * pack configurations, not part of the parallel's name, and they are the same
 * vocabulary ODDS_TRAILING above already enumerates for the odds case. An
 * explicit list rather than a wildcard, deliberately: anything after a print
 * run that is NOT one of these is part of a name we have misread, and it
 * should fail to match rather than be silently discarded.
 */
const FORMAT_TAIL =
  '(?:\\s+(?:All formats|Breaker Delight|Hobby|Jumbo|Value|Delight|Retail|Mega|Blaster|HTA))?';
const PRINT_RUN = new RegExp(`\\s(?:\\/(\\d{1,6})|(1)\\/1)${FORMAT_TAIL}\\s*$`, 'i');
```

**This regex is already verified against the real strings**, so it is not a
suggestion to refine; it is a result to reproduce. Controller's run:

```
run=499  name="Refractor"                   | Refractor /499 All formats
run=399  name="Pulsar Refractor"            | Pulsar Refractor /399 Hobby
run=250  name="Purple Geometric Refractor"  | Purple Geometric Refractor /250 Breaker Delight
run=275  name="Yellow"                      | Yellow /275
run=1    name="SuperFractor"                | SuperFractor 1/1
run=99   name="Mega Refractor"              | Mega Refractor /99 Mega
NO MATCH | Gold Rainbow /50 Something Else
NO MATCH | All cards are /25 or fewer
NO MATCH | Refractor
```

Turn every one of those nine lines into a test case. The last three are the
ones that matter:

- `Gold Rainbow /50 Something Else` must not match, because that trailing text
  is unaccounted for and quietly dropping it would invent a parallel name.
- `All cards are /25 or fewer` is prose with a mid-sentence run, and the
  existing parser already refuses it. Do not break that.
- `Refractor` alone has neither a run nor odds, and is correctly not a
  parallel on its own.

And `Mega Refractor /99 Mega` is the case that proves the tail is stripped
from the end rather than the name: the name keeps its own leading `Mega`.

Then remove `All formats` from the `FORMAT_TAIL` list and watch the first
test go red.

- [ ] **Step 5: Point the registry at the HTML sources**

In `data/product-registry.json`, change `2026-bowman-chrome` and
`2026-bowman-football`'s `checklist` to
`{ "kind": "fetch", "url": "...", "note": "..." }`, where the note says why:
the PDF carries no print runs at all and this page carries 581 and 440.

**Keep the PDFs in the registry if the shape allows it.** The HTML pages are
third-party and can change or vanish; the PDFs are on his disk and are the
only copy of the card rows that is not someone else's website. If the registry
shape does not allow two checklist sources per product, say so and pick the
HTML, but say it rather than silently dropping his local file.

- [ ] **Step 6: Fetch, re-seed those two products only, and measure**

```bash
npm run fetch:checklists
npm run seed:checklists -- <slug>
```

Report before and after for both products: entry count, null-team count, and
`print_run IS NOT NULL` count. The print-run counts are the point:
**0 of 305 on Bowman Chrome and 0 of 521 on Bowman Football before.** Report
what they are after, and if either is still zero, say so plainly rather than
reporting the task done.

Also report the other four products' counts, unchanged, as evidence you did
not disturb them. Count the ledger: 832 `baseball_cards`, 548 `sales`, 632
`purchases`.

**One more thing to measure, found by the controller after this plan was
written:** product **50 (Bowman Chrome Mega, 410 checklist entries) has no
rows in `parallels` at all.** It is absent from the table, not merely missing
print runs. A product with zero parallels can never resolve a parallel on any
card, which is a silent form of exactly what this phase exists to fix, and it
was invisible because every print-run count was reported per existing parallel
row.

The cause is already diagnosed, so do not spend the task re-deriving it: in
`data/product-registry.json`, `2026-bowman-chrome-mega` has `odds: null`, and
its checklist PDF (`2026_Bowman_Chrome_Baseball_Checklist_1_mega.pdf`) carries
no parallel section. Of the six seeded products, the three with a `.txt`
checklist get their parallels from the checklist itself, the two with a PDF
checklist plus a PDF odds file get them from the odds file, and the mega has
neither. So the product missing parallels is exactly the one with no source
for them.

What to do about it is a judgement call, yours to make and record: either add
a mega source to the registry (baseball.cards has a mega page too, and this
task is adding HTML support anyway), or recognise that Bowman Chrome Mega is a
configuration of Bowman Chrome rather than a separate set and have it share
product 49's parallels. **Do not invent a parallel list.** If neither is
cheap, say so and leave product 50 documented as unscannable for parallels;
naming the problem is the deliverable, fixing it is optional.

- [ ] **Step 7: Commit**

```bash
git add core/checklist package.json package-lock.json data/product-registry.json tests
git commit -m "feat(checklist): read checklists from HTML sources that carry print runs"
```


### Task 7b: one structured source per product

**Files:**
- Create: `core/checklist/html.ts`
- Modify: `core/checklist/parse.ts` (dispatch structured HTML before the line parser)
- Modify: `data/product-registry.json`
- Test: `tests/unit/checklist/html.test.ts`

**Interfaces:**
- Produces: `parseStructuredHtml(html: string): ParseResult | null`. Null means
  this page is not a shape we recognise, and the caller falls back to the
  existing line-based path rather than guessing.

**This replaces an earlier Task 7b that merged several sources per product.
Michael called that wrong and he is right.** Merging sources is what corrupted
two checklists tonight: the plan told Task 7 to point the `checklist` slot at
an HTML page while the PDF stayed cached, the seeder parsed both into one
product, card rows doubled, teams vanished on the duplicates and parallels
split in two rather than merging. His instruction: **one standardised source
per product.** That removes the entire class of bug rather than managing it.

**And one source already carries everything, which the earlier design missed
because it only ever looked at the parallels table.** baseball.cards' card
table is clean columns:

```
Card # | Player            | Team                | Section
1      | Konnor Griffin RC | Pittsburgh Pirates  | Base
2      | Mookie Betts      | Los Angeles Dodgers | Base
```

Measured: **1,378 table rows, 1,345 card-shaped, 1,259 carrying a team**,
plus a separate parallels table with 581 print-run tokens. Card number,
player, **team** and insert set, all as their own fields.

**This is strictly better than the PDFs**, and the reason is worth
understanding. The PDF has no print runs at all and does not carry the team as
a separate field, which is why `core/checklist/teams.ts` exists: an evening
went into hand-building MLB teams, 32 NFL franchises and 88 colleges so a
splitter could guess where a player's name ends and his team begins.
**A columnar source makes that heuristic unnecessary.** The page already knows.

Coverage, checked by HTTP status:

| product | baseball.cards page |
|---|---|
| 48 Topps Chrome | `2026-topps-chrome-baseball` 200 |
| 49 Bowman Chrome | `2026-bowman-chrome-baseball` 200 |
| 51 Topps Finest | `2026-topps-finest-baseball` 200 |
| 52 Bowman | `2026-bowman-baseball` 200 |
| 50 Bowman Chrome Mega | 404 |
| 53 Bowman Football | 404, it is a baseball site |

**This task is the four with a 200 and nothing else.** Products 50 and 53 keep
their PDFs untouched; their answer is a question for Michael that he is
considering, and guessing it is how tonight's damage happened.

- [ ] **Step 1: Parse the structure, do not flatten it**

The existing HTML support flattens a table row to a space-joined line and
hands it to a parser written for prose out of a PDF. That is what threw the
team away: the line parser expects a row to end in a team and this one ends in
a Section, so every row came back with a null team.

**A structured source deserves a structured parser.** `core/checklist/html.ts`
reads the DOM and emits `ParseResult` directly, with no line round trip:

- Find each `<table>`, read its `<th>` headers, and classify it: a table whose
  headers include `Card #` and `Player` is card rows; one whose second column
  is a print run is parallels. **Classify by header, never by position**, so a
  page that adds a column does not silently shift every field by one.
- Map header name to column index, then read each row by index. `Card #` to
  `code`, `Player` to `player`, `Team` to `team`, `Section` to the insert
  name.
- Return null if no table has recognisable headers, so `parseChecklistFile`
  falls through to the existing path and nothing that works today breaks.

`RC` and rookie detection should reuse whatever `core/checklist/rows.ts`
already does rather than a second rule.

- [ ] **Step 2: Tests, from the real fixture**

`tests/fixtures/checklists/baseball-cards-excerpt.html` already exists, saved
from the live page. Use it. Assert:

- A base row yields all four fields, team included: `Konnor Griffin RC`,
  `Pittsburgh Pirates`, insert `Base`, rookie true.
- An insert row carries its own section as the insert name, not `BASE`.
- The parallels table yields names and print runs.
- A table whose headers are unrecognised yields null rather than garbage.
- **The column-order guard:** take the fixture, swap two header columns, and
  assert the fields follow the headers rather than the positions. This is the
  test that proves Step 1's classification is real. Break it by reading
  column 2 as the player unconditionally and watch it go red.

- [ ] **Step 3: Registry, one source each**

Four products get `{ kind: 'fetch', url: <baseball.cards page> }` as their
**only** source. Delete their `odds` entry if the page supersedes it, and say
in your report what each product lost and gained by the swap.

**The cached PDFs and txt files for those four must be deleted from
`data/checklists/`**, because the seeder globs every file for a slug and that
glob is exactly how two sources ended up in one product. Do not rely on the
registry alone to keep the old file out.

- [ ] **Step 4: Re-seed, and expect the numbers to move**

Unlike the previous attempt, **the counts legitimately change here**, because
the source changed. So the acceptance test is not "identical", it is
"explained":

- **`null_team` must not rise for any product**, and should fall. Product 48
  is at 17, product 51 at 25, product 52 at 4. If any rises, stop.
- **`print_run` must go above zero** on product 49, which is at 0 of 305.
- **Entry counts will differ from the PDF's.** Report the delta per product
  and account for it. A plausible delta is a few percent; **a doubling means
  two sources are being read and you must stop**, which is precisely what
  happened last time.
- **Run a duplicate-identity check**: group by `(product_id, insert_name,
  card_number)` and report any group with more than one row. There should be
  none, and the unique constraint should make it impossible, but say you
  checked.
- Products 50 and 53 must be **byte identical**: 410 / 0 / 0 / 0 and
  2121 / 0 / 521 / 0. They are the control.
- Products 54 to 58 stay at zero. The Sapphire pages parse to junk like a
  player named `Parallels`.

**The database gate.** The owner's live Pokemon P&L ledger shares this
Postgres: **832 `baseball_cards`, 548 `sales`, 632 `purchases`**. Count all
three before and after. **Never run `drizzle-kit push`**, and this task needs
no migration.

- [ ] **Step 5: Report what `teams.ts` is still for**

If every seeded product now comes from a columnar source, the team splitter is
dead code for those products. **Do not delete it in this task**: products 50
and 53 still come from PDFs and still need it. Say in your report which
products still depend on it, so the next plan knows whether it can go.

- [ ] **Step 6: Commit**

---

### Task 8: `printRun` stops meaning two things

**Files:**
- Modify: `core/checklist/types.ts`, `core/checklist/odds.ts`
- Modify: `lib/db/schema/parallels.ts` + migration
- Modify: `core/scan/parallel.ts` (both inert checks live here, verified:
  the serial cross-check at lines 119-129, the scarcity flag at line 142)
- Test: `tests/unit/checklist/odds.test.ts`, `tests/unit/scan/parallel.test.ts`

**Interfaces:**
- Produces: `ParsedParallel` gains `printRunKnown: boolean`; `parallels` gains
  `print_run_known boolean not null default false`.

- [ ] **Step 1: Define the distinction precisely**

- A parallel the source states is unnumbered, or whose source carries print
  runs for its siblings and not for it: `printRun: null, printRunKnown: true`.
- A parallel from a source that carries no print runs at all:
  `printRun: null, printRunKnown: false`.

The signal is per **source**, not per line: a source with zero print runs
anywhere tells you nothing about any of its parallels, while a source with
runs on its siblings is positively telling you this one is unnumbered.

**Which decides where the field is set, and this matters.**
`parseParallelLine` sees one line and cannot know the document-level answer,
so it must NOT return `printRunKnown`. Keep its return type as it is (name,
printRun, oddsText) and have `parseChecklistText`, which sees the whole
document, stamp the field on every parallel after the scan:

```ts
// One pass decides it for the whole document. A source with no print run
// anywhere is a source that does not carry them, and every parallel from it
// is "we do not know"; a source with even one is telling us the rest are
// genuinely unnumbered. Deciding this per line would mark every unnumbered
// parallel in a good source as unknown, which is the opposite of the point.
const anyPrintRun = parallels.some((p) => p.printRun !== null);
const stamped = parallels.map((p) => ({ ...p, printRunKnown: anyPrintRun }));
```

Putting a meaningless `printRunKnown` on `parseParallelLine`'s return and
overwriting it later would be a field that lies for the length of one
function call, which is how `printRun === null` came to mean two things in
the first place.

**The schema facts you need, already checked:** `lib/db/schema/parallels.ts`
has `printRun: integer('print_run')` and a unique constraint
`parallels_product_name_run_unique` on `(productId, name, printRun)` with
`nullsNotDistinct()`. Adding a column does not touch that constraint, and it
must not: two parallels with the same name and the same null run are still
the same parallel regardless of whether we know why the run is null.

- [ ] **Step 2: Write the failing tests**

```ts
it('marks print runs known when the source carries any', () => {
  const out = parseChecklistText(['Gold /50', 'Refractor Hobby - 1:4'].join('\n'));
  expect(out.parallels).toEqual([
    expect.objectContaining({ name: 'Gold', printRun: 50, printRunKnown: true }),
    expect.objectContaining({ name: 'Refractor', printRun: null, printRunKnown: true }),
  ]);
});

it('marks print runs unknown when the source carries none', () => {
  const out = parseChecklistText('Refractor Hobby - 1:4\nX-Fractor Hobby - 1:8');
  expect(out.parallels.every((p) => p.printRunKnown)).toBe(false);
});
```

- [ ] **Step 3: Implement, migrate, re-seed all six products, measure**

Report, per product, how many parallels are `known` versus `unknown`. The
expected shape: Bowman Chrome and Bowman Football go to `known` after Task 7;
anything still `unknown` is a product whose source genuinely has no print runs
and is now honestly labelled as such.

- [ ] **Step 4: Re-arm the two checks that went inert**

Both checks are in `core/scan/parallel.ts` and both treat `printRun === null`
as "unnumbered". Both must now branch on `printRunKnown`:

- The **serial cross-check** (lines 119-129) compares a read serial against
  the parallel's print run. Line 129's comment already names the
  `match.printRun === null` case "no evidence", which is correct for a
  genuinely unnumbered parallel and wrong for an unread one: with
  `printRunKnown: false` the card routes to review rather than passing a
  check that never executed.
- The **scarcity flag** (line 142,
  `match.printRun !== null && match.printRun <= SCARCE_DUPLICATE_PRINT_RUN_THRESHOLD`)
  currently evaluates to false for an unknown run, which asserts "not scarce"
  on no evidence at all. It must not.

Write a test for each that fails if the branch is removed. These two checks
were inert for a whole plan; a replacement that is also inert is worse than
none, because it reads as covered.

- [ ] **Step 5: Commit**

---

# Phase D: the thin catalogue

## Why this phase exists

Build order item 4: "Enough UI to inspect what ingest produced, before trusting
it with 2800 photos."

Today the pipeline commits rows to `cards` and **nothing displays them.**
`/products` is the checklist registry, not his collection. There is no way to
look at what the scan produced except SQL. That is the gap between plan 3's
pipeline and the backfill plan 5 performs, and the owner cannot reasonably
approve a 2800-photo run he has no way to inspect.

Thin, deliberately. The spec's section 6 describes filters, saved views,
badges, comps, price history and the listing surface. **None of that is this
plan.** This is the inspection surface and nothing more.

---

### Task 9: The cards list

**Files:**
- Create: `core/cards/list.ts`
- Create: `app/cards/page.tsx`
- Modify: `app/page.tsx`
- Test: `tests/unit/cards/list.test.ts`

**Interfaces:**
- Produces: `listCards(userId, opts)` returning
  `{ rows: CardRow[]; total: number }` where `CardRow` carries `id`,
  `player`, `cardNumber`, `insertName`, `team`, `isRookie`, `isFirstBowman`,
  `productLabel`, `parallelName`, `serialNumber`, `isAutograph`,
  `isMemorabilia`, `quantity`, `verification`, `frontPhotoUrl`.
  `opts` is `{ limit?: number; offset?: number }`.

Every one of those maps to a real column, checked: `player`, `cardNumber`,
`insertName`, `team`, `isRookie` and `isFirstBowman` come off the joined
`checklist_entries` row and cost nothing extra; `productLabel` is
`formatProductDisplayName` (`core/products/displayName.ts`), the same helper
the confirm screen and the review page already use, so a product reads
identically everywhere.

**The trap in this task, read it before writing anything.**
`card_photos.url` is **not a URL.** It is a Supabase Storage key, and its own
column comment says so: "the first page that displays a committed card's photo
needs to sign this key, not treat it as one already." Meanwhile
`PhotoWithUrl.url` in `core/ingest/batches.ts` **is** an already-signed URL.
Two live meanings of `url` in one repo, and this task is the first code to
touch both. Put the signed value on a differently named field
(`frontPhotoUrl`) so the ambiguity stops here rather than spreading into the
catalogue.

- [ ] **Step 1: Write the failing tests, scoping first**

```ts
it('returns only this users cards', async () => {
  await seedCard({ userId });
  await seedCard({ userId: otherUserId });
  const { rows, total } = await listCards(userId, {});
  expect(rows).toHaveLength(1);
  expect(total).toBe(1);
});

it('joins the checklist entry for player, number and insert', async () => {
  const entry = await seedEntry({
    productId, cardNumber: '150', player: 'Paul Skenes', insertName: 'Base Set',
  });
  await seedCard({ userId, productId, checklistEntryId: entry.id });
  const { rows } = await listCards(userId, {});
  expect(rows[0]).toMatchObject({
    player: 'Paul Skenes', cardNumber: '150', insertName: 'Base Set',
  });
});

it('signs the front photo key rather than returning it raw', async () => {
  const card = await seedCard({ userId });
  await seedCardPhoto({ cardId: card.id, side: 'front', url: 'derivatives/abc.jpg' });
  const { rows } = await listCards(userId, {});
  expect(rows[0].frontPhotoUrl).not.toBe('derivatives/abc.jpg');
  expect(rows[0].frontPhotoUrl).toMatch(/^https?:/);
});

it('returns one row per card even with a front, a back and a detail shot', async () => {
  // The join to card_photos must not multiply rows. This is the bug a naive
  // leftJoin produces and on screen it looks exactly like a duplicate commit,
  // which is the one thing this page exists to let him spot.
  const card = await seedCard({ userId });
  for (const side of ['front', 'back', 'detail'] as const) {
    await seedCardPhoto({ cardId: card.id, side, url: `k-${side}` });
  }
  const { rows } = await listCards(userId, {});
  expect(rows).toHaveLength(1);
});

it('paginates by row and reports the unpaginated total', async () => {
  // Default limit 200. Not 50: his first backfill batch is a whole rip and he
  // is checking it, not browsing it.
  for (let i = 0; i < 5; i++) await seedCard({ userId });
  const { rows, total } = await listCards(userId, { limit: 2 });
  expect(rows).toHaveLength(2);
  expect(total).toBe(5);
});

it('orders newest first', async () => {
  const a = await seedCard({ userId });
  const b = await seedCard({ userId });
  const { rows } = await listCards(userId, {});
  expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
});
```

Two of these must be broken deliberately. **Delete the `userId` predicate** and
watch the first fail: there is **no row level security in this database**, zero
migrations carry a policy, so every scoping guarantee is application-level and
a missed predicate has no backstop in a project five other accounts can sign
into. **Then change the photo lookup** to a plain `leftJoin` on `cardPhotos`
with no side filter and watch the fourth fail.

- [ ] **Step 2: Implement the query**

One query, joins to `checklistEntries`, `products` and `parallels`. For the
photo, do **not** `leftJoin cardPhotos` directly: a card with three photos
comes back as three rows. Use a correlated subquery for the single front key,
and read `qualified()` in `core/ingest/batches.ts` and the comment above it
first: a bare column inside a selected `sql` template loses its table in a
single-table select, and this repo has already shipped that exact bug twice.

Sign the keys after the query, in one `Promise.all`, with the same
`photoDisplayUrl` the pairing grid uses. It already swallows a signing failure
and returns null instead of 500ing the page, which matters more here than
there: the catalogue is the screen he leaves open.

- [ ] **Step 3: The page**

A table, not a gallery. Rows are denser and this screen exists to be scanned
for wrongness, not admired. Columns: thumbnail, player, number, insert,
parallel, serial, flags, quantity, product.

Flags are `RC`, `1st Bowman`, `AUTO`, `MEM`, rendered as small badges. They
are on the row already and they are what he looks for first in a rip.

Render a `verification` badge and a quantity badge when `quantity > 1`: a
quantity above 1 is the copy-identity bump and is the single most useful thing
on this screen for spotting a bad commit.

Empty state: `'No cards yet. Confirm a batch and run a scan.'`

- [ ] **Step 4: Link it from the home page**, beside Review and Ingest, with a
  count, matching the `Health (N)` convention that already exists.

- [ ] **Step 5: Run, break the scoping predicate, restore**

- [ ] **Step 6: Commit**

---

### Task 10: Card detail

**Files:**
- Create: `core/cards/detail.ts`, `app/cards/[cardId]/page.tsx`
- Test: `tests/unit/cards/detail.test.ts`

**Interfaces:**
- Consumes: Task 9's `photoDisplayUrl` usage and `CardRow` field naming, so
  `frontPhotoUrl` means the same thing on both screens.
- Produces: `cardDetail(userId, cardId)` returning
  `CardDetail | null`, where `CardDetail` is every column on `cards`, the
  joined player/number/insert/team, `parallelName`, `frontPhotoUrl`,
  `backPhotoUrl`, and `provenance: { batchId, batchLabel, productLabel,
  committedAt, reviewDecision: string | null }`. Null means not his,
  indistinguishable from missing.

- [ ] **Step 1: Write the failing tests**

```ts
it('returns null for a card that is not his, the same as for a missing one', async () => {
  const card = await seedCard({ userId });
  expect(await cardDetail(otherUserId, card.id)).toBeNull();
  expect(await cardDetail(otherUserId, 999999)).toBeNull();
});

it('signs both sides', async () => {
  const card = await seedCard({ userId });
  await seedCardPhoto({ cardId: card.id, side: 'front', url: 'k-front' });
  await seedCardPhoto({ cardId: card.id, side: 'back', url: 'k-back' });
  const d = await cardDetail(userId, card.id);
  expect(d?.frontPhotoUrl).toMatch(/^https?:/);
  expect(d?.backPhotoUrl).toMatch(/^https?:/);
});

it('carries provenance: the batch, the product and the review decision', async () => {
  const d = await cardDetail(userId, cardId);
  expect(d?.provenance).toMatchObject({
    batchId,
    batchLabel: '10-04 Bowman mega',
    productLabel: expect.any(String),
  });
});

it('returns a card with no photos rather than throwing', async () => {
  // A card committed before its photos landed must still be inspectable:
  // this page is where he goes when a row looks wrong.
  const card = await seedCard({ userId });
  const d = await cardDetail(userId, card.id);
  expect(d?.frontPhotoUrl).toBeNull();
});
```

Break the `userId` predicate and watch the first fail.

- [ ] **Step 2: Implement**

Both photographs at full size, every stored field, and **provenance**: which
batch, which product, when it was committed, and the review decision if it went
through the queue. Provenance is the point of this page at this stage: when a
row looks wrong, the next question is always "which photographs produced this",
and the answer has to be one click away or the inspection does not happen.

- [ ] **Step 3: No edit surface.** The spec's full edit surface is a later plan.
  A half-built edit form on an un-backfilled catalogue is a way to lose data.

- [ ] **Step 4: Commit**

---

## Done means

- `npm test`, `npx tsc --noEmit`, `npm run build` all clean.
- The ledger reads 832 / 548 / 632.
- A real batch with a deliberate stray photo confirms, excludes the stray, and
  the brief's pairs are right, with the database rows pasted in the report.
- Bowman Chrome and Bowman Football report a non-zero print-run count, or an
  explicit statement of why not.
- Every review state has an exit that is not Reject.
- `/cards` shows what the pipeline produced, and `/cards/[id]` shows the
  photographs that produced it.

## Explicitly not this plan

- The backfill itself. That is plan 5 and it gets a dry run and a diff first.
  **Carry one requirement into it in his own words:** *"Make sure that you
  have my sales from eBay as well so that we arent relisting old cards that
  already sold when we do the port over."* The schema can already hold it:
  `card_sales` carries `ebay_order_id`, `card_listings` carries
  `ebay_item_id`, `ebay_sku` and a `status`. What does not exist yet is
  anything that stops a sold card being offered again, and the spec's ledger
  says 54 of the 832 are already sold and 568 carry a live `ebay_item_id`.
  Plan 5 owns both halves: carrying the mapping across, and making "already
  sold" a state the listing path cannot ignore.
- Filters, saved views, badges beyond verification and quantity, comps, price
  history. Spec section 6, a later plan.
- eBay listing. Plan 7.
- Row level security. Recorded as open item 8 in plan 3's outcome and still
  open; it is a security posture decision, not a feature, and it needs its own
  pass over every table at once rather than a policy bolted on per plan.
- Sold-comp pricing. The owner's Marketplace Insights application was denied,
  so that work is Terapeak plus his own 548 recorded sales, and it is a
  separate design question.
