# Isosceles Insights, plan 3 of 7: scan and review queue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a confirmed batch of paired card photos into verified `cards` rows, with everything uncertain or valuable routed to a review queue the owner actually sees.

**Architecture:** The application never calls a model. A confirmed batch enqueues a `scan` job; a local command assembles a self-contained brief (photos on disk, the product's checklist subset, its parallel list) and hands it to the agent session that is already running; the agent reads the images and writes a result file; a second command verifies that result against the checklist hard gate, resolves the parallel using batch context, routes it, and commits. Plan 2's storage-interruption debt is paid off first, because the scan path adds more ways to fail and there is currently nowhere for a failure to appear.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, Auth, Storage), Drizzle ORM, Vitest, tsx scripts, sharp + heic-convert.

**Spec:** `../specs/2026-10-05-card-app-design.md`
**Predecessor outcome:** `2026-10-06-isosceles-insights-auth-and-intake-OUTCOME.md`

## Global Constraints

- **The app must NEVER call an LLM API.** No `anthropic`, `openai` or `@ai-sdk` dependency may be added. Model work is a job row drained by the owner's agent session. This is a hard constraint from the owner: "I'm not going to use any api key everything has to run off my Claude max subscription."
- **Never run `drizzle-kit push`.** This Supabase project also holds the owner's live Pokemon P&L ledger: 17 tables, 832 `baseball_cards` rows, real sales data, none of it in this repo's schema. Push would propose dropping them. Use `drizzle-kit generate`, read the SQL, then `drizzle-kit migrate`. **Stop and report if generated SQL contains any `DROP`, or any `ALTER` to a table outside this repo's schema.**
- **No em dashes** in any user-facing copy.
- Money as integer cents, never floats. Dates as ISO `YYYY-MM-DD`.
- `npm test`, `npx tsc --noEmit` **and** `npm run build` must all be clean before any task is reported done. The build is not optional: in this repo tsc and vitest have repeatedly passed while the Next build caught real prerender bugs.
- **A test that has not been seen failing is not evidence.** This repo has shipped four defects that every green test missed. For any test asserting a fix, break the fix, watch it go red, restore it, watch it go green, and say so in the report.
- Deploying is explicit: `npx vercel --prod --yes`. `git push` does not deploy this project.

## The checklist hard gate (spec section 5, step 6)

Copied verbatim because every routing decision depends on it:

> **Verify. This is a hard gate.** The card number must exist in that product's checklist and the player on it must match what was read. A mismatch does not commit. This is the step that catches IT-14 read as IT-11, BCP-231 as BCP-331, BCP-127 as BCP-45.

And the routing rule:

> **Serial-numbered, autographed, or comping above $25 always goes to the review queue**, as does anything uncertain. A checklist proves a card exists; it does not prove which parallel was pulled, and parallel is where the money is.

---

## File structure

**Phase A, Plan 2 debt (tasks 1 to 3).** Conversion failures learn the difference between "this file is corrupt" and "storage was briefly unreachable", retries get a delay, and the owner gets a screen where a failure is visible and retryable.

- `core/ingest/errors.ts` (new): classifies a thrown error as transient or permanent. One responsibility, no imports beyond types.
- `core/ingest/normalise.ts` (modify): records a permanent failure, leaves a transient one unrecorded so a later run retries it.
- `core/ingest/jobs.ts` (modify): `nextAttemptAt` backoff column and its query predicates.
- `core/ingest/health.ts` (new): one query powering the health view, batches with stuck photos and jobs with errors.
- `app/ingest/health/page.tsx`, `app/api/ingest/retry/route.ts` (new): the failure surface.

**Phase B, the scan handoff (tasks 4 to 7).** The part that must never call a model.

- `core/scan/brief.ts` (new): assembles the self-contained brief for one batch.
- `core/scan/result.ts` (new): the result schema and its parser, including every rejection reason.
- `scripts/scan-next.ts`, `scripts/scan-commit.ts` (new): the two commands bracketing the agent's reading.

**Phase C, verify, resolve, route, commit (tasks 8 to 11).**

- `core/scan/verify.ts` (new): wraps `core/products/verify.ts` for scan results.
- `core/scan/parallel.ts` (new): resolves a parallel using batch context.
- `core/scan/route.ts` (new): the auto-commit versus review decision. Pure.
- `core/scan/commit.ts` (new): writes `cards`, links `card_photos`.

**Phase D, the review queue (tasks 12 to 14).**

- `lib/db/schema/reviewItems.ts` (new)
- `core/review/*.ts`, `app/review/*` (new)

---

### Task 1: Tell a corrupt file apart from a storage outage

**Files:**
- Create: `core/ingest/errors.ts`
- Modify: `core/ingest/normalise.ts`
- Test: `tests/unit/ingest/errors.test.ts`, `tests/unit/ingest/normalise.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `classifyFailure(err: unknown): 'transient' | 'permanent'`

**Why this is first.** `normaliseBatch`'s per-photo `catch` currently writes `normalise_error` for *any* error, and `downloadObject` / `uploadDerivative` throw on ordinary network errors. A 30-second Storage interruption partway through a 160-photo batch therefore marks every photo it touched permanently unreadable. Those photos are then excluded from the pairing grid, the batch counts as settled **without them**, and it confirms. The owner's cards are silently dropped from intake with no recovery short of hand-written SQL.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/errors.test.ts
import { describe, it, expect } from 'vitest';
import { classifyFailure } from '@/core/ingest/errors';

describe('classifyFailure', () => {
  it('treats an undecodable image as permanent', () => {
    expect(classifyFailure(new Error('These bytes could not be read as an image')))
      .toBe('permanent');
  });

  it('treats a storage download failure as transient', () => {
    expect(classifyFailure(new Error('Storage download failed for u/originals/abc.heic: fetch failed')))
      .toBe('transient');
  });

  it('treats an unknown error as transient, so it is retried rather than poisoned', () => {
    expect(classifyFailure(new Error('something nobody predicted'))).toBe('transient');
    expect(classifyFailure('a thrown string')).toBe('transient');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/ingest/errors.test.ts`
Expected: FAIL, cannot resolve `@/core/ingest/errors`.

- [ ] **Step 3: Implement**

```typescript
// core/ingest/errors.ts

/**
 * Only a failure we can attribute to the FILE is permanent. Everything else,
 * including anything unrecognised, is transient.
 *
 * The asymmetry is deliberate and it is the whole point of this module. Calling
 * a transient failure permanent silently drops the owner's cards out of intake:
 * the photo is excluded from the pairing grid, the batch then settles without
 * it and confirms. Calling a permanent failure transient only costs a few
 * retries before the attempt cap stops it. One mistake loses data, the other
 * wastes seconds.
 */
const PERMANENT_PATTERNS = [
  /could not be read as an image/i,
  /unsupported image format/i,
  /input buffer contains unsupported image format/i,
];

export function classifyFailure(err: unknown): 'transient' | 'permanent' {
  const message = err instanceof Error ? err.message : String(err);
  return PERMANENT_PATTERNS.some((p) => p.test(message)) ? 'permanent' : 'transient';
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/ingest/errors.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into `normaliseBatch`**

In `core/ingest/normalise.ts`, the per-photo `catch` becomes:

```typescript
    } catch (err) {
      const kind = classifyFailure(err);
      const reason = err instanceof Error ? err.message : String(err);
      if (kind === 'permanent') {
        // Only a bad FILE gets recorded. A recorded failure is permanent by
        // design: the skip at the top of this loop never revisits it.
        try {
          await db
            .update(photos)
            .set({ normaliseError: reason.slice(0, 500) })
            .where(eq(photos.id, photo.id));
        } catch (writeErr) {
          console.error('[normalise] could not record failure', photo.id, writeErr);
        }
        permanent++;
      } else {
        // Leave the row untouched so the next run retries it. Throwing here
        // would abandon the rest of the batch; counting it lets the caller
        // decide the job is not finished.
        console.error('[normalise] transient failure, will retry', photo.id, reason);
        transient++;
      }
    }
```

and the return becomes `{ converted, permanent, transient }`. Update every caller.

- [ ] **Step 6: Write the test that proves a batch is not poisoned**

```typescript
  it('does not record a transient failure, so a later run retries the photo', async () => {
    // downloadObject rejects with a network-shaped error for this photo
    vi.mocked(downloadObject).mockRejectedValueOnce(new Error('Storage download failed for k: fetch failed'));

    const result = await normaliseBatch(batchId);

    expect(result.transient).toBe(1);
    expect(result.permanent).toBe(0);
    const [row] = await db.select().from(photos).where(eq(photos.id, photoId));
    expect(row.normaliseError).toBeNull();   // the poisoning this task removes
    expect(row.derivativePath).toBeNull();
  });
```

- [ ] **Step 7: Watch it fail against the old behaviour, then pass**

Temporarily restore the unconditional `set({ normaliseError })`, run the test, confirm it fails on `normaliseError` being non-null. Restore the fix, confirm it passes. **Say in your report that you did this.**

- [ ] **Step 8: Commit**

```bash
git add core/ingest/errors.ts core/ingest/normalise.ts tests/unit/ingest/
git commit -m "fix(ingest): do not record a storage outage as a corrupt file"
```

---

### Task 2: The job is not done while photos still need a retry

**Files:**
- Modify: `core/ingest/jobs.ts`, `scripts/worker.ts`, `lib/db/schema/ingestJobs.ts`
- Test: `tests/unit/ingest/jobs.test.ts`

**Interfaces:**
- Consumes: `classifyFailure` (task 1), `normaliseBatch`'s new `{ converted, permanent, transient }`.
- Produces: `ingestJobs.nextAttemptAt` column; `failJob` gains a backoff.

**Why.** `failJob` returns a job to the queue and the worker's loop immediately reclaims it, because the claim is `ORDER BY id LIMIT 1`. One cycle is about four round trips, so all five attempts burn in two to three seconds of wall time in the same process. Any interruption longer than that exhausts the budget and reaches the terminal wedge anyway. A retry budget with no delay is not a retry budget.

- [ ] **Step 1: Add the column**

```typescript
// lib/db/schema/ingestJobs.ts, after lastError
    /**
     * Earliest time this job may be claimed again. Set on a requeue so a
     * retry waits out the condition that caused the failure instead of
     * burning the whole attempt budget in one loop iteration.
     */
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
```

- [ ] **Step 2: Generate and READ the migration**

```bash
npx drizzle-kit generate
```

Open the generated SQL. It must be exactly one statement:

```sql
ALTER TABLE "ingest_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;
```

**If it contains any `DROP`, or touches any table other than `ingest_jobs`, STOP and report.** Only then:

```bash
npx drizzle-kit migrate
```

- [ ] **Step 3: Write the failing tests**

```typescript
  it('a requeued job is not claimable until its backoff elapses', async () => {
    const job = await enqueueJob(userId, 'normalise', batchId);
    await claimNextJob('normalise', 'worker-a', userId);
    await failJob(job.id, 'worker-a', 'transient boom');

    // Immediately afterwards it must not come back.
    expect(await claimNextJob('normalise', 'worker-b', userId)).toBeNull();

    // With the backoff moved into the past it is claimable again.
    await db.update(ingestJobs)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(ingestJobs.id, job.id));
    expect(await claimNextJob('normalise', 'worker-b', userId)).not.toBeNull();
  });

  it('backs off further on each successive attempt', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(2));
    expect(backoffMs(2)).toBeLessThan(backoffMs(3));
    expect(backoffMs(1)).toBeGreaterThanOrEqual(30_000);
  });
```

- [ ] **Step 4: Watch them fail**

Run: `npx vitest run tests/unit/ingest/jobs.test.ts`
Expected: FAIL. The first test currently reclaims the job immediately.

- [ ] **Step 5: Implement**

```typescript
// core/ingest/jobs.ts

/** 30s, 2m, 8m, 32m. A Supabase blip clears in seconds; an outage does not,
 *  and burning five attempts in three seconds helps neither. */
export function backoffMs(attempts: number): number {
  return 30_000 * Math.pow(4, Math.max(0, attempts - 1));
}
```

In `failJob`'s requeue branch, add
`nextAttemptAt: new Date(Date.now() + backoffMs(job.attempts))`.

In `claimNextJobQuery`'s inner `SELECT`, add to the `WHERE`:
`AND (next_attempt_at IS NULL OR next_attempt_at <= now())`.

- [ ] **Step 6: Make the worker treat a transient photo failure as an unfinished job**

In `scripts/worker.ts`, after `normaliseBatch` returns:

```typescript
      if (result.transient > 0) {
        // Some photos still have no derivative and no error, so the batch
        // cannot settle. Returning the job to the queue with a backoff is how
        // those photos get another chance.
        await failJob(job.id, workerId, `${result.transient} photos failed transiently`);
      } else {
        await completeJob(job.id, workerId);
      }
```

- [ ] **Step 7: Run everything, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add -A && git commit -m "feat(ingest): back off between retries and requeue on transient failure"
```

---

### Task 3: A screen where a failure is visible and retryable

**Files:**
- Create: `core/ingest/health.ts`, `app/ingest/health/page.tsx`, `app/api/ingest/retry/route.ts`
- Modify: `app/ingest/page.tsx` (link to it)
- Test: `tests/unit/ingest/health.test.ts`

**Interfaces:**
- Produces: `batchHealth(userId): Promise<BatchHealth[]>` where
  `BatchHealth = { batchId: number; label: string | null; photoCount: number; converted: number; permanentFailures: number; pending: number; jobStatus: string | null; lastError: string | null; attempts: number }`
- Produces: `POST /api/ingest/retry` with `{ batchId: number }`, returning `{ requeued: boolean }`.

**Why.** Nothing in the app reads `ingest_jobs`. There is no view of `last_error`, no retry, and the Discord doorbell rings when work arrives and never when work dies. Today the owner's only signal that a batch died is that a row in a list stopped being clickable.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/health.test.ts
import { describe, it, expect } from 'vitest';
import { batchHealthQuery } from '@/core/ingest/health';

describe('batchHealthQuery', () => {
  it('scopes to the user and qualifies its correlated columns', () => {
    const { sql } = batchHealthQuery('11111111-1111-1111-1111-111111111111').toSQL();
    expect(sql).toMatch(/"ingest_batches"\."user_id"/i);
    // Guards the bug this repo has now shipped twice: a bare id inside a
    // selected sql`` subquery binds to the INNER table and returns 0 for
    // every row. See reference_drizzle_correlated_subquery.
    expect(sql).toMatch(/"ingest_batches"\."id"/i);
  });
});
```

- [ ] **Step 2: Watch it fail, then implement**

`batchHealthQuery` must qualify both sides of every correlated subquery, exactly as `batchCountColumns()` in `core/ingest/batches.ts` does. Reuse its `qualified()` helper rather than writing a second one; if it is not exported, export it.

- [ ] **Step 3: Build the page**

A table, one row per batch, showing label, converted / total, permanent failures, job status, attempts, and the first line of `last_error`. A **Retry** button appears only when the job is `failed` or when `pending > 0`.

Copy rules, checked against the no-em-dash constraint:
- `3 photos could not be read` (not "3 failed")
- `Stopped after 5 attempts. Last error: <first line>`
- `Nothing needs attention.` when the list is empty

- [ ] **Step 4: Build the retry route**

`POST /api/ingest/retry` authenticates with `requireUserId()`, verifies the batch belongs to that user (a batch id from a URL is never trusted; this is the IDOR shape already fixed once in `confirmPairing`), then sets the batch's `normalise` job to `status='queued'`, `attempts=0`, `claimedBy=null`, `claimedAt=null`, `nextAttemptAt=null`.

Do **not** add this path to `SERVICE_ROLE_PATHS` in `middleware.ts`.

- [ ] **Step 5: Link it**

Add a `Health` link on `app/ingest/page.tsx`, showing a count when anything needs attention.

- [ ] **Step 6: Verify, then commit**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git add -A && git commit -m "feat(ingest): a health view where a failed batch is visible and retryable"
```

---

### Task 4: Assemble a self-contained scan brief

**Files:**
- Create: `core/scan/brief.ts`
- Test: `tests/unit/scan/brief.test.ts`

**Interfaces:**
- Consumes: `getBatchPhotos` (plan 2), `checklistEntries` and `parallels` (plan 1).
- Produces:

```typescript
export type ScanBrief = {
  batchId: number;
  productId: number | null;
  productName: string | null;
  pairs: { pairIndex: number; frontPath: string; backPath: string | null }[];
  checklist: { cardNumber: string; player: string; team: string | null; insertName: string | null }[];
  parallels: { id: number; name: string; printRun: number | null; odds: string | null }[];
};
export function buildBrief(userId: string, batchId: number, outDir: string): Promise<ScanBrief>;
```

**Why the checklist travels with the brief.** From the spec: "The model chooses from a known set rather than reading into a vacuum, which removes most OCR-class errors before they happen." A brief without its checklist is the vacuum.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/scan/brief.test.ts
import { describe, it, expect } from 'vitest';
import { briefIsScannable } from '@/core/scan/brief';

describe('briefIsScannable', () => {
  it('refuses a product with no checklist', () => {
    expect(briefIsScannable({ productId: 3, checklist: [], pairs: [{ pairIndex: 0 }] } as never))
      .toEqual({ ok: false, reason: 'no-checklist' });
  });

  it('refuses a batch with no product', () => {
    expect(briefIsScannable({ productId: null, checklist: [], pairs: [] } as never))
      .toEqual({ ok: false, reason: 'no-product' });
  });

  it('accepts a batch with a product, a checklist and at least one pair', () => {
    expect(briefIsScannable({
      productId: 3,
      checklist: [{ cardNumber: '1', player: 'A' }],
      pairs: [{ pairIndex: 0 }],
    } as never)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Watch it fail, then implement both functions**

`buildBrief` downloads each photo's derivative to `outDir` as `pair-<n>-front.jpg` / `pair-<n>-back.jpg` and writes `brief.json`. It calls `briefIsScannable` first and throws with the reason if not ok.

`no-checklist` is the spec's hard requirement surfacing: "If something is attempting to be catalogued w/o a checklist and odds sheet there should be a clear message that it needs to be added."

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(scan): assemble a self-contained brief for one batch"
```

---

### Task 5: The two commands that bracket the agent's reading

**Files:**
- Create: `scripts/scan-next.ts`, `scripts/scan-commit.ts`
- Modify: `package.json`
- Test: `tests/unit/scan/result.test.ts`

**Interfaces:**
- Produces: `npm run scan:next` and `npm run scan:commit -- <briefDir>`.
- Produces: `core/scan/result.ts` exporting `parseScanResult(raw: unknown): ParseResult`.

**This is the task where the no-API-key constraint is made real.** `scan-next` claims a `scan` job, writes the brief, and prints the directory. It does **not** call a model. The agent session reads `brief.json`, looks at the images, and writes `result.json` beside them. `scan-commit` reads that file and runs verify, resolve, route and commit.

```typescript
// the shape the agent must write
export type ScanResult = {
  cards: {
    pairIndex: number;
    cardNumber: string;
    player: string;
    insertName: string | null;
    parallelName: string | null;
    serialNumber: string | null;
    isAutograph: boolean;
    isMemorabilia: boolean;
    confidence: 'high' | 'low';
    note: string | null;
  }[];
};
```

- [ ] **Step 1: Write the failing tests for the parser**

Cover: a well-formed result; a missing `cardNumber`; a `pairIndex` not present in the brief; a duplicate `pairIndex`; `confidence` outside the enum; and extra unknown keys, which are rejected rather than ignored, so a drifting contract fails loudly.

- [ ] **Step 2: Watch them fail, then implement `parseScanResult`**

Hand-written validation, no new dependency. Return
`{ ok: true; value: ScanResult } | { ok: false; errors: string[] }` and list **every** error rather than the first, so a correction pass is one round trip.

- [ ] **Step 3: Implement both scripts**

`scan-next` claims with `claimNextJob('scan', workerId, OWNER_USER_ID)`, exits 0 printing `nothing queued` when the queue is empty, and writes the brief under `.scan/<jobId>/`. Add `.scan/` to `.gitignore`.

`scan-commit` fails loudly when `result.json` is missing or invalid, printing every parser error. Nothing is written to the database until the whole file parses.

- [ ] **Step 4: Commit**

---

### Task 6: The checklist hard gate

**Files:**
- Create: `core/scan/verify.ts`
- Test: `tests/unit/scan/verify.test.ts`

**Interfaces:**
- Consumes: `verifyAgainstChecklist` and `normalisePlayer` from `core/products/verify.ts` (plan 1). **Reuse them. Do not reimplement.**
- Produces: `verifyScanned(cards, checklist): { verified: VerifiedCard[]; rejected: RejectedCard[] }`

- [ ] **Step 1: Write the failing tests, which are the spec's own examples**

```typescript
  it('rejects a card number that is not in this product checklist', () => {
    // The spec names these exact failures: IT-14 read as IT-11,
    // BCP-231 as BCP-331, BCP-127 as BCP-45.
    const checklist = [{ cardNumber: 'IT-14', player: 'Jackson Holliday' }];
    const { verified, rejected } = verifyScanned(
      [{ pairIndex: 0, cardNumber: 'IT-11', player: 'Jackson Holliday' }] as never,
      checklist as never
    );
    expect(verified).toHaveLength(0);
    expect(rejected[0].reason).toBe('card-number-not-in-checklist');
  });

  it('rejects when the number exists but names a different player', () => {
    const checklist = [{ cardNumber: 'BCP-231', player: 'Walcott' }];
    const { rejected } = verifyScanned(
      [{ pairIndex: 0, cardNumber: 'BCP-231', player: 'Someone Else' }] as never,
      checklist as never
    );
    expect(rejected[0].reason).toBe('player-mismatch');
  });

  it('does not treat a generational suffix as a match', () => {
    // Vladimir Guerrero Jr. and Vladimir Guerrero are both in 2026 Bowman
    // Chrome. normalisePlayer deliberately keeps the suffix.
    const checklist = [{ cardNumber: '1', player: 'Vladimir Guerrero Jr.' }];
    const { rejected } = verifyScanned(
      [{ pairIndex: 0, cardNumber: '1', player: 'Vladimir Guerrero' }] as never,
      checklist as never
    );
    expect(rejected[0].reason).toBe('player-mismatch');
  });
```

- [ ] **Step 2: Watch them fail, then implement**

A rejected card **never commits**. It goes to the review queue with its reason and both photos attached.

- [ ] **Step 3: Commit**

---

### Task 7: Resolve the parallel using the rest of the batch

**Files:**
- Create: `core/scan/parallel.ts`
- Test: `tests/unit/scan/parallel.test.ts`

**Interfaces:**
- Produces: `resolveParallel(scanned, parallels, batchContext): { parallelId: number | null; confident: boolean; reason: string }`

**Why batch context.** From the spec: "Cases needing a control pair, such as Mojo versus Lazer or the Rookie Red shield colour, are compared against the rest of the batch. This is why batch context matters and why card-by-card scanning in isolation is insufficient."

From memory, two facts that must not be rediscovered: it is **LAZER** with a z, Topps' own spelling; and base Refractors print the word REFRACTOR on the back beside the team logo, while CHROME appears on every card, so the back cannot distinguish an X-Fractor and the front checkerboard must be used.

- [ ] **Step 1: Write the failing tests**

Cover: an exact name match; an unknown parallel name returning `parallelId: null, confident: false`; a named parallel that is not in this product's list, which must not silently match the closest one; and a case where two cards in the same batch carry the same ambiguous description, which lowers confidence rather than guessing.

- [ ] **Step 2: Watch them fail, then implement**

**Never guess a parallel.** `confident: false` routes to review. Per the spec, "parallel is where the money is."

- [ ] **Step 3: Commit**

---

### Task 8: Routing, the rule that protects the money

**Files:**
- Create: `core/scan/route.ts`
- Test: `tests/unit/scan/route.test.ts`

**Interfaces:**
- Produces: `routeCard(input): { destination: 'auto-commit' | 'review'; reasons: string[] }`

Pure function, no database, no IO.

- [ ] **Step 1: Write the failing tests, straight from the spec's rule**

```typescript
  it.each([
    ['serial numbered', { serialNumber: '12/99' }, 'serial-numbered'],
    ['autograph', { isAutograph: true }, 'autograph'],
    ['memorabilia', { isMemorabilia: true }, 'memorabilia'],
    ['low confidence', { confidence: 'low' }, 'low-confidence'],
    ['unresolved parallel', { parallelConfident: false }, 'parallel-unresolved'],
  ])('always sends a %s card to review', (_label, overrides, reason) => {
    const out = routeCard({ ...clean, ...overrides } as never);
    expect(out.destination).toBe('review');
    expect(out.reasons).toContain(reason);
  });

  it('sends anything comping above $25 to review', () => {
    expect(routeCard({ ...clean, estimatedValueCents: 2501 } as never).destination).toBe('review');
    expect(routeCard({ ...clean, estimatedValueCents: 2500 } as never).destination).toBe('auto-commit');
  });

  it('auto-commits a clean inexpensive base card', () => {
    expect(routeCard(clean as never)).toEqual({ destination: 'auto-commit', reasons: [] });
  });

  it('collects every reason, not just the first', () => {
    const out = routeCard({ ...clean, isAutograph: true, serialNumber: '1/5' } as never);
    expect(out.reasons).toEqual(expect.arrayContaining(['autograph', 'serial-numbered']));
  });
```

- [ ] **Step 2: Watch them fail, then implement**

`REVIEW_VALUE_THRESHOLD_CENTS = 2500`, exported, with a comment citing the spec. The boundary is inclusive: exactly $25.00 auto-commits, a cent more does not.

- [ ] **Step 3: Commit**

---

### Task 9: Commit a verified card

**Files:**
- Create: `core/scan/commit.ts`
- Test: `tests/unit/scan/commit.test.ts`

**Interfaces:**
- Produces: `commitCards(userId, batchId, decided, tx?): Promise<{ committed: number; reviewed: number }>`

- [ ] **Step 1: Write the failing tests**

Cover: a committed card writes one `cards` row with its `checklistEntryId` and `parallelId` set and `verification = 'verified'`; both photos are linked in `card_photos`; a re-run of the same batch does not double-write, because `cards_copy_identity_unique` holds; and a review-routed card writes **no** `cards` row.

- [ ] **Step 2: Watch them fail, then implement**

Everything for one batch runs in a single `db.transaction`. A partial commit is the one outcome that cannot be allowed, because a half-written rip is indistinguishable from a complete one afterwards.

- [ ] **Step 3: Commit**

---

### Task 10: The review queue table

**Files:**
- Create: `lib/db/schema/reviewItems.ts`
- Test: `tests/unit/db/review-items.test.ts`

```typescript
export const REVIEW_STATUSES = ['pending', 'accepted', 'corrected', 'rejected'] as const;
// columns: id, userId, batchId, pairIndex, status (default 'pending'),
// reasons (text[]), scanned (jsonb, what the agent read),
// frontPhotoId, backPhotoId, resolvedCardId, decidedAt, createdAt
// UNIQUE (batch_id, pair_index)
```

- [ ] **Step 1: Assert the unique constraint with a rollback transaction**

Plan 1 proved a no-op constraint by inserting twice inside a transaction and rolling back. Do the same here: two inserts with the same `(batchId, pairIndex)` must fail the second time.

- [ ] **Step 2: Generate, READ, and apply the migration**

Expect one `CREATE TABLE` plus its indexes and no `DROP`. **Stop and report otherwise.**

- [ ] **Step 3: Commit**

---

### Task 11: The review screen

**Files:**
- Create: `app/review/page.tsx`, `app/review/[itemId]/page.tsx`, `app/review/[itemId]/decision-form.tsx`, `app/api/review/[itemId]/route.ts`
- Create: `core/review/items.ts`
- Test: `tests/unit/review/items.test.ts`

The screen the owner actually uses: both photos side by side at a size where a parallel is judgeable, what the agent read, why it was flagged, and three actions. **Accept** commits as read. **Correct** lets him change card number, parallel and serial, re-runs the hard gate, and commits. **Reject** discards with a note.

- [ ] **Step 1: Write the failing tests**

Every query is user-scoped. The route authenticates with `requireUserId()` and verifies ownership before acting on an `itemId` from the URL. A **Correct** that fails the checklist gate does **not** commit and returns the reason.

- [ ] **Step 2: Watch them fail, then implement**

Signed photo URLs use the 6 hour TTL constant from plan 2, not the 1 hour default, and a signing failure returns `null` rather than throwing, so the existing broken-thumbnail UI can handle it.

- [ ] **Step 3: Commit**

---

### Task 12: Drain command and startup sweep

**Files:**
- Create: `scripts/scan-drain.ts`
- Modify: `package.json`, `README.md`
- Test: `tests/unit/scan/drain.test.ts`

**Why.** The spec requires that "the agent also sweeps for unclaimed jobs on startup", because "a ping that arrives while no session is alive is simply picked up by the next startup sweep". Plan 2 left `countQueued` exported and unused and gave the agent no documented entry point.

- [ ] **Step 1: Write the failing test**

`npm run scan:status` reports queued, claimed, failed and pending-review counts, and reports zeroes rather than throwing against an empty queue.

- [ ] **Step 2: Watch it fail, then implement, and document the loop in README**

Exactly three commands, in order: `scan:next`, then the agent reads `brief.json` and writes `result.json`, then `scan:commit`.

- [ ] **Step 3: Commit**

---

### Task 13: Run it on one real batch

**Files:**
- Create: `docs/scan-probe-<date>.md`

Not a coding task. The pipeline must be run end to end on real photos of real cards, because every defect that mattered in plans 1 and 2 was found this way and none were found by the test suite.

- [ ] **Step 1: Pick a real batch**

Use photos from `eBay_assets/card drop`, for a product that **has** a checklist. Four of the eleven seeded products have none, and a batch pointed at one of those must fail with `no-checklist`, which is worth proving once.

- [ ] **Step 2: Run the whole loop and record what happened**

Record: how many pairs, how many passed the hard gate, how many the gate rejected **and whether each rejection was correct**, how many auto-committed, how many went to review and why, and wall-clock time.

- [ ] **Step 3: Report honestly**

A probe that finds a problem is worth more than one that reports success. If the gate rejects a card that is genuinely in the checklist, that is a parser or a normalisation bug and it must be reported, not worked around. **Do not fix anything you find unless it blocks the run; report it.**

- [ ] **Step 4: Commit the findings**

---

### Task 14: Close the loop on the Discord doorbell

**Files:**
- Modify: `core/ingest/notify.ts`, `scripts/worker.ts`
- Test: `tests/unit/ingest/notify.test.ts`

**Why.** Right now the doorbell rings when work arrives and never when work dies, and a scan job queued by a confirm is the one the owner most needs to know about.

- [ ] **Step 1: Write the failing tests**

A scan enqueue pings with the batch label, pair count and product name. A job that exhausts its attempts pings once with the batch and the first line of its error. A **retry** does not ping, so a flapping job cannot spam the channel.

- [ ] **Step 2: Watch them fail, then implement**

No em dashes in the message. The ping carries no card data, only counts and labels: it is a trigger, not a transport.

- [ ] **Step 3: Commit, then deploy**

```bash
npx vitest run && npx tsc --noEmit && npm run build
git push origin main
npx vercel --prod --yes
```

Then verify against the live URL, not the build output: `/` returns 307 to `/login`, `/review` returns 307 to `/login`, and `/api/review/1` returns 401 JSON.

---

## Self-review

**Spec coverage.** Pipeline steps 5 through 9 map to tasks 4 to 9. The checklist-as-first-class-entity requirement is enforced by task 4's `no-checklist` refusal. "Who runs the scan" maps to tasks 5 and 12, with the no-model constraint structural rather than advisory: no task adds a model dependency, and the only place a model acts is between two command invocations. The review queue is tasks 10 and 11. The doorbell is task 14.

**Carried debt.** Plan 2's open item 1 is tasks 1 to 3, deliberately first.

**Not in this plan**, and stated so it is not mistaken for an omission: the backfill of ~2,800 originals (plan 4), the full Wax-Cache-shaped Cards UI the owner actually wants to look at (plan 4), eBay listing (plan 5), the sealed port (plan 6), Rip Recap (plan 7), test-database isolation (needs infrastructure the owner must provision), and a sign-in allowlist (his product decision).

**Type consistency.** `ScanResult.cards[].pairIndex` keys `ScanBrief.pairs[].pairIndex` keys `reviewItems.pairIndex`. `parallelId` is `number | null` everywhere. `estimatedValueCents` is integer cents.
