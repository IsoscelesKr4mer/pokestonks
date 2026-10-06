# Isosceles Insights, plan 2 of 7: outcome

**Completed 2026-10-06.** 13 of 13 tasks plus 8 rulings, 34 commits, 284 tests,
typecheck and build clean. Every figure here was verified at HEAD by the
controller, not taken from an implementer's report.

Repo: `C:\Users\Michael\Documents\Claude\Isosceles_Insights`, branch `main`,
remote `origin` = `IsoscelesKr4mer/isosceles-insights` (private),
deployed at `https://isosceles-insights.vercel.app`.

Plan: `2026-10-06-isosceles-insights-auth-and-intake.md`
Spec: `../specs/2026-10-05-card-app-design.md`
Predecessor: `2026-10-05-isosceles-insights-foundation-OUTCOME.md`

---

## What exists now

Google sign-in through Supabase, a session gate on every route, and a complete
photo intake pipeline.

A photo enters from either a local drop-folder script or a browser upload. It is
identified by the SHA-256 of its bytes, so re-running intake is a true no-op.
Originals go to private storage. A worker converts them to displayable JPEGs.
EXIF capture times group photos into shooting sessions, so one drop folder
holding two evenings becomes two batches rather than one blob. Photos are paired
front to back, the owner confirms the pairing in a grid, and only then is a scan
job queued.

The app never calls an LLM API. Model work is a job row drained by an agent
session, with a Discord ping as a doorbell. That constraint was verified to hold
with no exceptions: there is no `anthropic`, `openai` or `@ai-sdk` dependency
anywhere in the repo, and the only outbound call in the whole branch is the
Discord webhook.

## Measurements worth keeping

**HEIC conversion: 1180 to 1395 ms per photo**, measured on real iPhone files by
two independent parties. The Plan 4 backfill of roughly 2,800 photos is
therefore about an hour of conversion, which is worth knowing before starting it
rather than during it.

**His card drop folder is 1,104 files, of which 458 are `.HEIC`.** The rest are
mostly `.MOV`. Any test fixture resembling "a folder of photos" does not
resemble his folder.

**His HEIC files average 1,619,365 bytes**, measured over 25 real files. This is
the number that made a 25-file chunk weigh 38 MB.

**EXIF: 40/40 HEIC and 40/40 JPEG** after swapping the reader, against 0/40 HEIC
before.

**The ledger was never touched.** Verified after every migration: 27 tables, the
17 pre-existing pokestonks tables plus the 10 belonging to this app.
`drizzle-kit push` was never run.

## The theme of this plan: green means nothing

Plan 1's outcome recorded three defects that passed every test. Plan 2 found
more, and the pattern is now firm enough to state as a rule: **in this
codebase, a passing suite, a clean typecheck and a clean build are evidence
about the tests, not about the software.**

The four that matter:

1. **HEIC conversion was 0% functional.** `sharp`'s prebuilt Windows binary
   ships libheif without the libde265 HEVC decoder, and Apple HEIC is HEVC.
   Every photo the owner's phone has ever taken was unreadable. This survived
   eleven tasks and several reviews because the conversion tests feed synthetic
   JPEGs. Worse, Task 5 reported "HEIC conversion will definitely work,
   confirmed by reading one of your files at 3024x4032" and the controller
   relayed that as confirmation. It was `exifreader` reading metadata. It never
   touched a pixel. **Found only by Task 13 running against real files.**
2. **The correlated subquery, for the second time.** `batchCountColumns()`
   returned zero for `photoCount`, `derivativeCount` and `failedCount` on every
   batch, silently disabling the readiness gate built on top of it. Identical in
   shape to Plan 1's `listProductsWithCounts` defect. Found by an implementer
   writing an integration test it had not been asked for. Now recorded in memory
   as a standing trap, because a unit test on the surrounding arithmetic cannot
   catch it: the arithmetic is correct, the numbers are already zero when they
   arrive.
3. **The browser upload path did nothing and said nothing in production.** An
   8 MB chunk budget against Vercel's 4.5 MB body limit, compounded by the form
   parsing the response before checking whether it had succeeded, inside a `try`
   with no `catch`. Local `next dev` has no body limit, so nothing before a
   whole-branch review could see it. The sibling component handles this
   correctly; the upload form, written by a different agent, does not. **This is
   a controller failure:** the Vercel limit was recorded as a known parked risk
   and then an 8 MB budget was written into a brief anyway. Parking a risk is
   not carrying it.
4. **A failed job was terminal, invisible, and wedged its batch forever.**
   Nothing requeued a `failed` job, and the worker called `failJob` on any throw
   on the first attempt. The affected photos then held neither a derivative nor
   an error, so the batch could never settle, the list page rendered it without
   a link so it could not even be opened, and nothing in the app read the job
   table at all. `MAX_ATTEMPTS`, `attempts` and `last_error` had all been built
   for exactly this and were never connected to the one path that fails.

## What held up well

Worth recording, because reviews mostly surface what is wrong.

**Deriving batch readiness from `photos` rather than from job status** is what
kept every concurrency interleaving the final reviewer constructed from
corrupting anything. Combined with skipping settled photos and content-addressed
derivative keys written with `upsert: true`, two workers racing produce
byte-identical objects and no lost work.

**Content-addressed photo identity** makes intake genuinely safe to re-run,
which is what allows the drop folder to be a dumb directory the owner never has
to curate.

**Independent authentication in routes** rather than trusting middleware. The
final reviewer confirmed that deleting `middleware.ts` entirely would still
leave `/api/upload` enforcing. That matters more than it looks, because five
other real accounts share this Supabase project.

## Known open items

1. **Recovery from a storage interruption is the largest gap, and it is three
   problems that are really one piece of work. All three belong to plan 3 and
   should be its first scope.**

   a. **No failure surface.** Nothing in the UI shows the job queue,
   `last_error`, or a retry. The doorbell rings when work arrives and never when
   work dies.

   b. **The requeue has no backoff.** `failJob` returns a job to the queue, the
   worker's loop immediately reclaims it, and `ORDER BY id LIMIT 1` hands back
   the same job. One cycle is about four round trips, so all five attempts are
   consumed in roughly two to three seconds by the same process. Any Supabase
   interruption lasting longer than that exhausts the budget and lands in
   exactly the terminal wedge the requeue was built to prevent. Blocker 2 is
   therefore only half closed: it rescues a sub-second blip and nothing longer.
   A delay between attempts, or deferring the retry to the next worker run, is
   what would actually close it.

   c. **Transient failures are recorded as permanent, and this is the one with
   teeth.** `normaliseBatch`'s per-photo `catch` writes `normalise_error` for
   *any* error, and `downloadObject` / `uploadDerivative` throw on ordinary
   network errors with no distinction between "corrupt file" and "storage was
   briefly unreachable". So a 30-second Storage interruption partway through a
   160-photo batch permanently marks every photo it touched as unreadable.
   Those photos are then excluded from the pairing grid, the batch counts as
   settled **without them**, and it confirms. The owner's cards are silently
   dropped from intake with no retry path short of hand-written SQL. This also
   explains why the new requeue is nearly unreachable in practice: almost
   nothing escapes `normaliseBatch` to reach `failJob` at all.
2. **The test suite writes to the live Supabase project**, the one holding the
   Pokemon ledger. Cleanup is best-effort `afterEach`, so an aborted run leaks
   rows, and `npm test` cannot run without production credentials. It already
   caused one cross-test-file flake. The fix is a separate test project, which
   is infrastructure the owner must provision.
3. **Browser uploads still proxy bytes through Next.** The 4 MB budget makes it
   work, at two files per request. Direct-to-storage signed uploads are the
   proper fix and a redesign.
4. **No sign-in allowlist.** Five other real people can authenticate against
   this Supabase project. Row data is correctly user-scoped everywhere, so there
   is no cross-user read, but this is the owner's product decision to make and
   was deliberately left to him.
5. **The caller-supplied user id is shape-checked, not existence-checked**, and
   `photos.user_id` has no foreign key. A stale but UUID-shaped id would land
   every row under a prefix no session queries, silently.
6. **Which account the owner signs in as is unconfirmed.** `SEED_USER_ID`
   resolves to `dixonm7@gmail.com`, which matches his git author email, but
   `isosceleskr4mer@gmail.com` also exists and has signed in. Task 13 could not
   verify this (no browser automation) and correctly refused to guess. **If it
   is wrong, uploads succeed and the app looks empty with nothing explaining
   why.** He has been asked.
7. **Nothing drains `scan` jobs yet.** Correct per the architecture, but there
   is no documented entry point for an agent session to claim one, and
   `countQueued` is exported and unused. The queue supports the pattern; nothing
   exercises it.
8. **The service-role key comparison is not constant-time.** Judged low risk:
   `timingSafeEqual` is unavailable on the Edge runtime, so the remedy is a
   `subtle.digest` compare that makes the function async.

## What plan 3 inherits

A working intake pipeline and an empty `scan` queue. Plan 3 is the model-driven
scan and the review queue, which is the first consumer of everything this plan
built. It should fix open item 1 first: the scan path will fail in new ways, and
right now there is nowhere for a failure to appear.
