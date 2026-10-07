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
- Create `lib/db/migrations/0014_*.sql` — generated, read before applying
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
- Create: `lib/db/migrations/0014_*.sql` (generated)
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

The second and third tests are the ones that matter: a unique index written
without the partial `WHERE` passes the first test and fails both of these, and
making every batch's second photo uninsertable would have been discovered in
production rather than here.

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
  for (const photo of live) {
    // A null pairIndex inside a confirmed batch is a data fault, not a
    // photo to silently drop: give it its own pair so it stays visible
    // rather than vanishing from the grid and the brief alike.
    const key = photo.pairIndex ?? -1;
    const bucket = byIndex.get(key);
    if (bucket) bucket.push(photo);
    else byIndex.set(key, [photo]);
  }

  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => {
      const front = group.find((p) => p.side === 'front') ?? group[0];
      const back = group.find((p) => p !== front) ?? null;
      return { front, back };
    });
}
```

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

Excluding the **front** of a slot that has a back promotes the back to front.
Excluding the only photo removes the slot.

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
- Produces: `candidatesFor(userId, itemId, cardNumber)` returning
  `{ cardNumber: string; productId: number; candidates: ChecklistCandidate[] } | null`,
  where `ChecklistCandidate` is
  `{ id: number; productId: number; cardNumber: string; insertName: string | null; player: string }`.
  Null means the item is not this user's, indistinguishable from not existing.
  `productId` is on each candidate as well as the envelope so the scoping test
  in Step 1 can assert it per row rather than trusting the query it is
  testing.

- [ ] **Step 1: Write the failing tests**

```ts
it('returns the candidates for a corrected number, not the scanned one', async () => {
  // Item scanned #1; checklist has one entry at #1 and three at #150.
  const out = await candidatesFor(userId, itemId, '150');
  expect(out?.candidates).toHaveLength(3);
});

it('returns null for another user\'s item', async () => {
  expect(await candidatesFor(otherUserId, itemId, '1')).toBeNull();
});

it('scopes candidates to the item\'s own product', async () => {
  // A second product has four entries at #150. They must not appear.
  const out = await candidatesFor(userId, itemId, '150');
  expect(out?.candidates.every((c) => c.productId === itemProductId)).toBe(true);
});
```

The third is the one to break deliberately: remove the product predicate and
watch it go red. A candidate list leaking another product's inserts is how the
wrong insert gets picked in a UI that looks correct.

- [ ] **Step 2: Implement `candidatesFor`**

Reuse the existing scoped item lookup in `core/review/items.ts` (the one
`getReviewItemForOwner` uses) so "not yours" collapses into "not found" the way
every other path in this file already does. Then query `checklistEntries`
filtered by the item's `productId` and the passed `cardNumber`, ordered by
`insertName`.

- [ ] **Step 3: The route**

`GET /api/review/[itemId]/candidates?cardNumber=...`. 401 when not signed in,
404 when `candidatesFor` returns null, 400 for a missing or empty
`cardNumber`. Never echo the raw error.

- [ ] **Step 4: Wire the form**

In `decision-form.tsx`, when the card-number input changes and the value
differs from the item's original, fetch the candidates (debounced, 300ms) and
replace the insert selector's options. While in flight, disable Correct rather
than letting it submit against a stale list. On a fetch failure, show
`'Could not load the inserts for that number. Try again.'` and keep Correct
disabled: silently submitting against the previous number's candidates is the
bug this task exists to prevent.

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
- Modify: `app/api/review/[itemId]/route.ts`
- Test: `tests/unit/review/items.test.ts`

**Interfaces:**
- Produces: a fourth decision, `'checklist-problem'`, setting
  `review_items.status = 'checklist_problem'`.

The existing status CHECK constraint lists the allowed values. Widening it
needs a migration: generate, read, confirm it touches only `review_items`,
apply, `setup:test-schema`, count the ledger.

- [ ] **Step 1: Decide what it does, and does not do**

It **does not** commit a card and it **does not** loosen the gate. It parks
the item in a state that is not pending, not rejected, and carries the owner's
note, so the card is not lost and the queue is not blocked. The product's
checklist is what needs fixing, and that is a re-seed, not a card decision.

- [ ] **Step 2: Write the failing tests**

```ts
it('parks the item without committing a card', async () => {
  const before = await countCards(userId);
  const r = await decide(userId, itemId, {
    kind: 'checklist-problem',
    note: 'Checklist has Guerrero Jr. as Guerrero.',
  });
  expect(r.ok).toBe(true);
  expect(await countCards(userId)).toBe(before);
  expect((await getReviewItemForOwner(userId, itemId))?.status)
    .toBe('checklist_problem');
});

it('requires a note', async () => {
  const r = await decide(userId, itemId, { kind: 'checklist-problem', note: '' });
  expect(r).toEqual({ ok: false, reason: 'note-required' });
});

it('is refused on an already-decided item', async () => { ... });

it('is refused for another user', async () => { ... });
```

A note is required because the only value of this state is telling a future
re-seed what was wrong.

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
- Modify: `core/checklist/extract.ts`
- Modify: `package.json` (add `cheerio`)
- Test: `tests/unit/checklist/extract.test.ts`

**Interfaces:**
- Produces: `extractText` accepts `.html` and `.htm`.

`extractText` already dispatches on extension to `fromPdf`, `fromXlsx` and a
plain UTF-8 read, and everything downstream is line-based. So HTML support is
one more branch that flattens the document to the same line shape, and no
parser below it changes at all.

- [ ] **Step 1: Probe the real source first, before writing any parser**

Fetch `https://www.baseball.cards/checklists/2026-bowman-chrome-baseball/` and
save it to `data/checklists/`. Then **look at the markup** and record in your
report: is the checklist a `<table>`, a `<ul>`, or paragraphs? Where does the
print run appear relative to the parallel name?

Do not write the extractor before you have looked. Plan 3's print-run
diagnosis was wrong precisely because it was made from the parser's shape
rather than the source's.

- [ ] **Step 2: Write the failing test from the real markup**

Paste a genuine 20-line excerpt of the fetched page into the test as a fixture
(not invented markup), and assert the lines `extractText` produces.

- [ ] **Step 3: Implement `fromHtml`**

```ts
async function fromHtml(buffer: Buffer, filename: string): Promise<string> {
  try {
    const $ = cheerio.load(buffer.toString('utf8'));
    $('script, style, nav, header, footer').remove();
    const lines: string[] = [];
    // A table row must flatten to one line with its cells space-joined, the
    // same shape fromXlsx already produces, because core/checklist/odds.ts's
    // TABULAR pattern reads exactly that: "<name> 1:20 1:32 - - -".
    $('tr').each((_, el) => {
      const cells = $(el).find('th, td').map((__, c) => $(c).text().trim()).get();
      if (cells.some(Boolean)) lines.push(cells.join(' '));
    });
    ...
  } catch (cause) {
    throw new Error(`Failed to extract text from HTML "${filename}"`, { cause });
  }
}
```

Finish it against what Step 1 actually found. If the page is not tabular, the
`<tr>` branch is dead code and must not be written.

- [ ] **Step 4: Point the registry at the HTML sources**

In `data/product-registry.json`, change the Bowman Chrome and Bowman Football
`checklist` sources to `{ kind: 'fetch', url: ..., note: ... }`. The `note`
says why: the PDF carries no print runs.

- [ ] **Step 5: Fetch, re-seed those two products only, and measure**

```bash
npx tsx -r dotenv/config scripts/fetch-checklists.ts
npx tsx -r dotenv/config scripts/seed-checklists.ts <slug>
```

Report before and after for both products: entry count, null-team count, and
`print_run IS NOT NULL` count. The print-run counts are the point:
**0 of 305 and 0 of 521 before.** Report what they are after, and if either is
still zero, say so plainly rather than reporting the task done.

Also report the other four products' counts, unchanged, as evidence you did
not disturb them. Count the ledger.

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
anywhere tells you nothing about any of its parallels. So this is decided in
`parseChecklistText`, which sees the whole document, not in `parseParallelLine`,
which sees one line.

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
  `{ rows: CardRow[]; total: number }` where `CardRow` carries id, player,
  cardNumber, insertName, productLabel, parallelName, serialNumber,
  isAutograph, isMemorabilia, quantity, verification, frontPhotoUrl.

- [ ] **Step 1: Write the failing tests, scoping first**

```ts
it('returns only this user\'s cards', async () => { ... });

it('joins the checklist entry for player and number', async () => { ... });

it('paginates by row', async () => {
  // Default limit 200. Not 50: the owner's first backfill batch is a whole
  // rip and he is checking it, not browsing it.
});

it('orders newest first', async () => { ... });
```

The scoping test is the one to break: delete the `userId` predicate and watch
it fail. There is **no row level security in this database** (zero of fifteen
migrations contain a policy), so every scoping guarantee in this app is
application-level and a missed predicate has no backstop.

- [ ] **Step 2: Implement the query**

One query with joins to `checklistEntries`, `products` and `parallels`. Do not
N+1 the photos: join `cardPhotos` for the front and sign one URL per row, the
same `photoDisplayUrl` the pairing grid uses, which already swallows a signing
failure rather than 500ing the page.

- [ ] **Step 3: The page**

A table, not a gallery. Rows are denser and this screen exists to be scanned
for wrongness, not admired. Columns: thumbnail, player, number, insert,
parallel, serial, flags, quantity, product.

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

- [ ] **Step 1: Write the failing tests**

Scoping (another user's card is `notFound`, indistinguishable from missing),
both photo sides resolve, and the provenance fields come back.

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
- Filters, saved views, badges beyond verification and quantity, comps, price
  history. Spec section 6, a later plan.
- eBay listing. Plan 7.
- Row level security. Recorded as open item 8 in plan 3's outcome and still
  open; it is a security posture decision, not a feature, and it needs its own
  pass over every table at once rather than a policy bolted on per plan.
- Sold-comp pricing. The owner's Marketplace Insights application was denied,
  so that work is Terapeak plus his own 548 recorded sales, and it is a
  separate design question.
