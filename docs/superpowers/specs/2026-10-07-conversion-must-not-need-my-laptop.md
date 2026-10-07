# Photo conversion must not depend on my laptop

**Michael, the first time he used the app for real:**

> "I uploaded the photos and see the trigger here but youre just sittingn
> idle in the terminal"

Six photos were queued and none had converted, because the thing that
converts them is a bash loop on his laptop that an agent session has to
remember to start. The app showed nothing: no "converting", no progress, no
warning. From his side it was indistinguishable from the app being broken.

It has already failed a second way today. The loop ran `seq 1 200` at 15
second intervals, so it died silently after fifty minutes, and nothing said
so. It has been restarted at twelve hours, which is a bigger number, not a
fix.

**This is the one remaining part of the app that only works while someone is
watching it.**

---

## Why it is local at all, and why that reason does not hold

The no-model-call rule is real and absolute: the application never calls a
model, because a Max subscription covers Michael in a session and not a
deployed app making its own calls. **Conversion is not model work.** It is
`sharp` and `heic-convert` turning a HEIC into a display JPEG. It has no
model in it, no API key, and no reason to run on a laptop.

Everything it needs is already server code in `core/ingest/`:
`claimNextJob`, `normaliseBatch`, `completeJob`, `failJob`,
`sweepStaleClaims`, `touchClaim`. `scripts/worker.ts` is a thin loop over
them. Nothing in that file is laptop-specific except the fact that nothing
else calls it.

**The scan stays local.** Reading a card is model work and stays in his agent
session, drained through the job queue, exactly as it is now. This spec moves
conversion only.

## The change

### A drain endpoint

`POST /api/jobs/drain`, which does one bounded pass of what the worker loop
does: sweep stale claims, claim a `normalise` job, convert up to `N` photos,
complete or requeue, and report what it did.

Authorised by a shared secret in an `Authorization: Bearer` header, not by a
session, because its callers are a cron and the app itself. **`CRON_SECRET`
does not exist in production today** (checked 2026-10-07: production holds
only `DISCORD_WEBHOOK_URL`, `SUPABASE_SERVICE_ROLE_KEY`, the two
`NEXT_PUBLIC_SUPABASE_*`, `SEED_USER_ID` and `DATABASE_URL`). It has to be
added with `npx vercel env add CRON_SECRET production`, and the route must
refuse every request when the variable is unset rather than defaulting to
open.

### `normaliseBatch` needs a bound

It currently converts every unconverted photo in a batch in one call, with no
limit:

```ts
export async function normaliseBatch(batchId: number): Promise<{...}> {
  const rows = await db.select().from(photos).where(eq(photos.batchId, batchId));
  for (const photo of rows) { ... }
}
```

A 160-photo rip is the normal case and will not finish inside any serverless
timeout. It gains an optional `limit`, and the drain route passes one sized
to the deployment's timeout with room to spare. A run that stops at the limit
leaves the job claimed with its heartbeat fresh and returns `more: true`.

**This is the part most likely to be got wrong.** Stopping early must not
look like finishing: the job must not complete, the batch must not settle,
and the claim must not go stale while the next pass is being arranged.

### Two triggers, because one is not enough

**1. On upload, immediately.** The upload route already knows photos just
landed. It fires the drain after responding, so the user is not held waiting
on conversion. Next's `after()` is the right tool. This is what makes the
common case feel instant.

**2. A cron, every few minutes, as the safety net.** Demand-driven alone
cannot recover a job that requeued with backoff (the ladder is 30s, 2m, 8m,
32m), a job stranded by a worker that died mid-batch, or a batch whose first
drain hit the limit and whose re-trigger was lost. `vercel.json` does not
exist yet and has to be created for this.

Neither trigger replaces the other. The first is for latency, the second is
for correctness.

### The screen has to show it

Even a perfect queue looks broken when nothing reports it, which is the
actual lesson from his complaint. The ingest UX spec already calls for a
`converting` state on the batch card, with a count and a stalled warning
after two minutes of no movement. **That state is part of this work, not a
follow-up**, because a conversion he cannot see is the bug he reported, not
the conversion itself.

## What this does not change

- No model call is added anywhere.
- `scripts/worker.ts` stays, and stays useful: it is how the 2,800-photo
  backfill gets run, where a laptop with no timeout is the right machine.
- The scan brief, the hard gate and the review queue are untouched.

## Acceptance

Michael uploads photos from his phone with no agent session running anywhere,
and they convert. He can see them converting while it happens. Nobody starts
a loop.

## Measured, not assumed

**Per-photo cost, end to end** (download the original from Storage, convert,
upload the derivative), over four real photos on 2026-10-07:

| | download | convert | upload | total |
|---|---|---|---|---|
| mean | ~610ms | ~254ms | ~326ms | **1190ms** |
| worst | 961ms | 271ms | 437ms | **1499ms** |

**Conversion is the small part.** Only about 250ms of each 1.2s is `sharp`;
the rest is network I/O to Supabase, which should be FASTER from Vercel than
from a laptop on home broadband. These were 1.9 to 2.7MB JPEGs. A HEIC
original costs more to decode, and none are in the database today to measure,
which is the argument for a time budget rather than a photo count.

**The plan is Hobby**, checked rather than assumed, and it constrains the
design in two ways that matter:

1. **Cron on Hobby runs at most once per DAY.** It cannot be the mechanism
   that gets a batch converted; it can only be a backstop that catches
   something stranded within 24 hours. The spec above treated a frequent cron
   as half the design, and on this plan that is not available.
2. **Function timeout is 60s**, which two routes already use via
   `maxDuration = 60`.

## Revised design, for Hobby

**The drain self-chains.** A drain converts until its time budget is spent,
then returns `more: true` if work remains, and the caller fires another. This
replaces the frequent cron entirely and self-tunes to whatever a photo
actually costs, HEIC or JPEG, fast network or slow. A fixed photo count would
have to be tuned for the worst case and would waste the budget in the common
one.

**Authorised by a session OR the cron secret.** `after()` inside the upload
route would spend the upload's own 60s budget on conversion, so the trigger
moves to the browser: the upload form calls `/api/jobs/drain` once the upload
returns. That needs no secret in the browser, because a signed-in owner
draining his OWN jobs is legitimate. The same endpoint accepts a
`CRON_SECRET` bearer for the daily backstop.

A session-authorised drain must only claim that user's jobs. `claimNextJob`
already takes a userId for exactly this reason.

**The manual control stops being a nicety.** With no frequent sweeper, a
visible "convert now" on the batch, and the converting state beside it, are
how a stalled batch gets unstuck. On Pro they would be convenience; on Hobby
they are the recovery path.
