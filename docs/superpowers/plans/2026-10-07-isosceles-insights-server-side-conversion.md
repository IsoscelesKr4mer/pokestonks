# Server-Side Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photos uploaded from Michael's phone convert without any agent session or laptop loop running anywhere, and he can see them converting while it happens.

**Architecture:** Everything conversion needs is already server code in `core/ingest/`. `scripts/worker.ts` is a thin loop over it, and the only thing laptop-specific about that loop is that nothing else calls it. This adds a bounded drain endpoint, triggers it from the browser after an upload, lets it self-chain while work remains, and shows the state on the batch.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (generate/migrate only, never `drizzle-kit push`), Supabase Postgres + Storage, `sharp` + `heic-convert`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-conversion-must-not-need-my-laptop.md`

## Global Constraints

- **Never run `drizzle-kit push`.** No migration is needed in this plan; if one seems necessary, stop and report.
- **No model call anywhere in the application.** Conversion is `sharp`, not model work, which is why it may move to the server at all. **The SCAN stays local** and is not touched.
- **No em dashes in user-facing copy.** Money is integer cents, dates ISO.
- **The account is on the Vercel HOBBY plan.** Function timeout 60s. **Cron runs at most once per day**, so cron is a backstop and never the mechanism.
- **Measured per-photo cost: 1.2s mean, 1.5s worst** end to end, of which only ~250ms is `sharp`. All measured photos were JPEG; no HEIC exists in the database to measure. **Use a time budget, never a photo count.**
- **A session-authorised drain must only ever touch that user's own jobs.** Five other real people can sign in to this Supabase project and there is no row-level security.
- **Every new guard gets falsified two ways:** delete the check and watch a test go red; force it to always take one branch and watch a *different* test go red. A falsification that reds zero tests is a finding, not a pass.
- **Never retype or reconstruct the thing under test.** Import the module; take fixtures from real sources. This rule cost three separate wrong answers on 2026-10-07.
- **Before declaring done:** `npx tsc --noEmit`, `npx vitest run`, `npm run build` all clean.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `core/ingest/normalise.ts` | `normaliseBatch` gains a time budget and reports what is left | 1 |
| `core/ingest/drain.ts` (new) | One bounded pass: claim, convert, settle. No HTTP, no auth. | 2 |
| `app/api/jobs/drain/route.ts` (new) | Auth (session or cron secret), calls the core, returns `more` | 3 |
| `app/ingest/upload-form.tsx` | Fires the drain after upload and chains while `more` | 4 |
| `core/ingest/health.ts` + `app/ingest/batch-list.tsx` | The converting state, and a manual convert-now | 5 |
| `vercel.json` (new) | The daily backstop cron | 3 |

---

### Task 1: `normaliseBatch` stops when its time is up

**Files:**
- Modify: `core/ingest/normalise.ts`
- Test: `tests/unit/ingest/normalise.test.ts`

**Interfaces:**
- Produces: `normaliseBatch(batchId, opts?: { budgetMs?: number; now?: () => number })` returning `{ converted, permanent, transient, remaining }`. Task 2 reads `remaining`.

**Why a budget and not a count** (put this reasoning in the code, not just here): a count has to be tuned for the worst photo and wastes the budget on the common one. Conversion is ~250ms of a ~1.2s round trip today, but no HEIC original exists to measure and HEIC decoding is heavier. A budget self-tunes.

- [ ] **Step 1: Write the failing test**

`now` is injected so the test needs no real clock and no sleeping.

```ts
it('stops when the budget is spent and reports what is left', async () => {
  // Four unconverted photos, a clock that jumps 400ms per call, and a 500ms
  // budget: it converts some and leaves the rest, rather than running to the
  // end of the batch.
  const ticks = [0, 400, 800, 1200, 1600];
  let i = 0;
  const result = await normaliseBatch(batchId, { budgetMs: 500, now: () => ticks[Math.min(i++, ticks.length - 1)] });
  expect(result.converted).toBeGreaterThan(0);
  expect(result.converted).toBeLessThan(4);
  expect(result.remaining).toBe(4 - result.converted);
});

it('converts the whole batch when the budget is ample', async () => {
  const result = await normaliseBatch(batchId, { budgetMs: 60_000 });
  expect(result.converted).toBe(4);
  expect(result.remaining).toBe(0);
});

it('always converts at least one photo, however small the budget', async () => {
  // A zero budget must not mean zero progress, or a caller that chains on
  // `remaining > 0` spins forever making no headway.
  const result = await normaliseBatch(batchId, { budgetMs: 0 });
  expect(result.converted).toBe(1);
});

it('counts a photo that fails permanently as handled, not remaining', async () => {
  // `remaining` drives the chaining decision, so a photo that can never
  // convert must not keep it above zero.
  const result = await normaliseBatch(batchWithOneBadPhoto, { budgetMs: 60_000 });
  expect(result.permanent).toBe(1);
  expect(result.remaining).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/ingest/normalise.test.ts`
Expected: FAIL, `normaliseBatch` takes one argument and returns no `remaining`.

- [ ] **Step 3: Implement**

Keep the existing per-photo try/catch exactly as it is. Add the budget check at the TOP of each iteration, after the already-settled skip:

```ts
export type NormaliseOptions = {
  /** Wall-clock milliseconds this call may spend before stopping and
   * reporting `remaining`. Omitted means no limit, which is what
   * scripts/worker.ts wants: a laptop has no timeout and should finish the
   * batch. */
  budgetMs?: number;
  /** Injected for tests. Real callers never pass this. */
  now?: () => number;
};

export async function normaliseBatch(
  batchId: number,
  opts: NormaliseOptions = {}
): Promise<{ converted: number; permanent: number; transient: number; remaining: number }> {
  const now = opts.now ?? (() => Date.now());
  const startedAt = now();
  let converted = 0;
  let permanent = 0;
  let transient = 0;
  let remaining = 0;

  const rows = await db.select().from(photos).where(eq(photos.batchId, batchId));

  for (const photo of rows) {
    if (photo.derivativePath || photo.normaliseError) continue;

    // Checked BEFORE the work, and never before the first photo: a zero or
    // tiny budget must still make progress, or a caller chaining on
    // `remaining > 0` spins without converting anything. Once the budget is
    // spent every further photo is counted as remaining rather than
    // attempted, which is what tells the caller to come back.
    const attempted = converted + permanent + transient;
    if (attempted > 0 && opts.budgetMs !== undefined && now() - startedAt >= opts.budgetMs) {
      remaining++;
      continue;
    }

    // ... the existing try/catch body, unchanged ...
  }

  return { converted, permanent, transient, remaining };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/ingest/normalise.test.ts`

- [ ] **Step 5: Falsify two ways**

(a) Delete the `attempted > 0` condition. Expected: "always converts at least one photo" reds.
(b) Force `remaining` to always be 0. Expected: the budget test and the permanent-failure test red, proving they read the value.

- [ ] **Step 6: Commit**

```bash
git add core/ingest/normalise.ts tests/unit/ingest/normalise.test.ts
git commit -m "feat(ingest): normaliseBatch stops when its time budget is spent"
```

---

### Task 2: One bounded drain pass, with no HTTP in it

**Files:**
- Create: `core/ingest/drain.ts`
- Test: `tests/unit/ingest/drain.test.ts`

**Interfaces:**
- Consumes: `sweepStaleClaims`, `claimNextJob`, `completeJob`, `failJob`, `touchClaim` (`core/ingest/jobs.ts`), `normaliseBatch` (Task 1).
- Produces: `drainOnce({ userId, workerId, budgetMs })` returning `{ claimed: number | null; batchId: number | null; converted: number; permanent: number; transient: number; more: boolean }`.

**Read `scripts/worker.ts` first.** It is the loop this extracts one iteration of, and its handling of `requeued`, `superseded` and a lost claim is correct and hard won. Do not reinvent it; the whole point is that both callers now share one implementation. **Leave `scripts/worker.ts` working** (it is how the 2,800-photo backfill will run, where a laptop with no timeout is the right machine); refactoring it to call `drainOnce` is welcome if its behaviour is preserved, but not required.

`more` is true when this pass left work behind: `remaining > 0`, or the job requeued, or another job is still queued for this user.

- [ ] **Step 1: Write the failing test**

Follow the existing seeding helpers in `tests/unit/ingest/`. At minimum:

```ts
it('claims one job, converts within budget, and completes it', async () => { ... });

it('reports more when the budget ran out mid batch, and does NOT complete the job', async () => {
  // The job must stay claimed with its heartbeat fresh. Completing a job
  // whose photos are half converted is the one outcome that loses work
  // silently: the batch would settle and nothing would ever come back.
  const result = await drainOnce({ userId, workerId: 'test', budgetMs: 0 });
  expect(result.more).toBe(true);
  const [job] = await db.select().from(ingestJobs).where(eq(ingestJobs.id, result.claimed!));
  expect(job.status).toBe('claimed');
});

it('returns claimed: null and more: false on an empty queue', async () => { ... });

it('never claims another user\'s job', async () => {
  // Five real accounts, no row-level security. This is the only thing
  // between them.
  const result = await drainOnce({ userId: strangerId, workerId: 'test', budgetMs: 60_000 });
  expect(result.claimed).toBeNull();
});
```

- [ ] **Step 2 to 4:** run red, implement, run green.

- [ ] **Step 5: Falsify**

Pass `undefined` for userId into `claimNextJob` and confirm the stranger test reds. Force `more` to false and confirm the budget test reds.

- [ ] **Step 6: Commit**

---

### Task 3: The endpoint, and the daily backstop

**Files:**
- Create: `app/api/jobs/drain/route.ts`
- Create: `vercel.json`
- Test: `tests/unit/api/drain.test.ts`

**Auth, and this is the task's real content.** Two callers, two mechanisms, one endpoint:

- A signed-in owner (the upload form, and the convert-now button). Drains **only his own** jobs. `requireUserId` as every other route does.
- The daily cron, with `Authorization: Bearer ${CRON_SECRET}`. Drains any user's.

**`CRON_SECRET` does not exist in production.** Checked 2026-10-07: production holds `DISCORD_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY`, both `NEXT_PUBLIC_SUPABASE_*`, `SEED_USER_ID`, `DATABASE_URL`, and nothing else. **The route must refuse a bearer request when the variable is unset, never treat unset as open.** Report that it needs `npx vercel env add CRON_SECRET production`; do not try to set it yourself.

```ts
export const maxDuration = 60;
```

and the budget passed to `drainOnce` must leave real headroom under that, not approach it.

Compare the secret with a timing-safe comparison, not `===`.

`vercel.json`:

```json
{ "crons": [{ "path": "/api/jobs/drain", "schedule": "0 9 * * *" }] }
```

Note in a comment somewhere durable that Hobby allows one cron per day and that this is a backstop, not the mechanism.

- [ ] **Steps:** failing tests first, covering: no session and no bearer is 401; a bearer when `CRON_SECRET` is unset is 401; a wrong bearer is 401; a session drains only that user; the response carries `more`. Then implement, then falsify by making the unset-secret case fall through to open and confirming that test reds.

---

### Task 4: The browser fires it, and chains

**Files:**
- Modify: `app/ingest/upload-form.tsx`
- Test: the repo's DOM harness (`tests/dom.tsx`, which now has `change` as well as `click`)

After a successful upload, POST `/api/jobs/drain` and keep posting while the response says `more`, with a sane cap so a bug cannot spin forever. Show progress while it runs: the user should see conversion happening, which is the entire complaint this plan answers.

**Do not block the upload response on conversion.** Upload returns, then conversion starts, and the screen reports it.

Cap the chain (say 40 passes) and stop with a visible message rather than silently, so a stuck queue looks stuck rather than finished.

- [ ] Failing test, implement, falsify by removing the `more` check and confirming a test reds.

---

### Task 5: The batch says what it is doing

**Files:**
- Modify: `core/ingest/health.ts`, `app/ingest/batch-list.tsx`
- Test: existing health and DOM tests

From the ingest UX spec: a batch shows `Converting 4 of 6` with a count, and after two minutes with no movement says conversion has stalled and offers a retry. On Hobby there is no frequent sweeper, so **this is the recovery path, not decoration**.

Add a convert-now control that calls the same endpoint as Task 4.

- [ ] Failing test, implement, falsify.

---

## Acceptance

Michael uploads photos from his phone with **no agent session running and no laptop loop**, and they convert. He can see them converting. Nobody starts anything.

Verify for real, not only in tests: stop the local worker loop, upload from the deployed site, and watch the photos get derivatives.

## Self-Review

**Spec coverage:** the drain endpoint is Task 3, the bound is Task 1, the browser trigger and chaining are Task 4, the visible state and manual recovery are Task 5, the cron backstop is Task 3.

**Deliberately out of scope:** moving the SCAN server side (it is model work and must not), and rewriting `scripts/worker.ts` (it stays, for the backfill).

**The riskiest task is 1.** Stopping early must not look like finishing. A job completed with half its photos converted settles the batch and nothing ever comes back for the rest, which loses work silently, and the only thing standing between that and the owner is `remaining` being right.
