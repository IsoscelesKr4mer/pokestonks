# Isosceles Insights, plan 3 of 7: outcome

**Completed 2026-10-06.** 14 of 14 plan tasks plus 2 inserted tasks, 52 commits,
566 tests, typecheck and build clean. Pushed and deployed to
`https://isosceles-insights.vercel.app`, with auth verified against the live URL
rather than the build output.

Every figure here was verified at HEAD by the controller, not taken from an
implementer's report.

Plan: `2026-10-06-isosceles-insights-scan-and-review.md`
Spec: `../specs/2026-10-05-card-app-design.md`
Predecessor: `2026-10-06-isosceles-insights-auth-and-intake-OUTCOME.md`

---

## What exists now

A confirmed batch of paired card photographs becomes verified rows in a
catalogue.

The owner picks the product at confirm time. `scan:next` claims a job and writes
a self-contained brief directory: the photographs, plus that product's full
checklist and parallel list. His agent session reads the images and writes
`result.json`. `scan:commit` queries the checklist **fresh**, runs a hard gate on
card number and player, resolves the parallel using the rest of the batch as
context, routes each card, and either commits it or files it for review, all in
one transaction.

Phase A paid off plan 2's debt first: a storage failure is now distinguishable
from a corrupt file, retries back off across 30s/2m/8m/32m, and a dead batch is
visible on a health view with a retry button.

**The application still never calls a model.** Verified structurally at the end:
zero matches for any model SDK across every `.ts`, `.tsx`, `.json` and `.md`
outside `node_modules`, no API client, and no seam where one would naturally be
added. `scan-next` writes files and exits; `scan-commit` reads a file already on
disk.

## The defect that defines this plan

**The hard gate picked a checklist entry by first match.** It filtered candidates
by card number, then took the first whose player matched. When several entries
shared both, it silently took the alphabetically-first insert.

Measured on the owner's live data: **886 ambiguous `(product, card_number,
player)` groups.** Card number 1 in 2026 Topps Chrome has six Shohei Ohtani
entries. `2025 Chrome MVP Buyback Autographs` sorts before `Base Set`.

So an ordinary base Ohtani auto-committed as a one-per-case buyback autograph.
Nothing warned, nothing routed to review, the summary printed `1 committed`, and
the row looked correct in every view. Four variations of one player at one number
also collapsed to a single `checklistEntryId`, so `commitCards` bumped quantity
instead of minting rows.

**The insert name needed to disambiguate was already carried end to end and
discarded by the gate.** The brief had it, the result shape had it, the stored
review row had it.

**Sixteen per-task reviews missed it.** Both existing multi-insert tests used
*different players* in each insert, so the player check disambiguated and the
first-match branch never ran. Ruling 8 named the problem, "numbering restarts per
insert, so gather every candidate before deciding", and stopped one step short of
it.

Only the whole-branch review found it, because it was the first reader able to
trace a card end to end across sixteen task boundaries.

## The pattern, now at six instances

**A test that looks like a guard and is not.** This plan caught six:

1. The multi-insert tests above, which never reached the branch they appeared to
   cover.
2. A product-label pin test whose two fixtures both omitted the one field the
   test existed to protect, so it pinned everything except the named risk.
3. A `getBatchMetaQuery` SQL assertion that passed because a qualified reference
   in a `where` clause survives the flattening the test was guarding against.
4. A scan-brief guard test that passed against a deliberately broken fix,
   because `ORDER BY` is not processed by the code path that causes the bug. Its
   own implementer caught this one.
5. A scoping predicate added and shipped with nothing asserting it: delete the
   line and 348 tests stayed green.
6. A `normalise_error` exclusion assertion that passed with the filter removed
   entirely, because `.select()` with no projection lists every column anyway.

The standing rule that came out of it: **a scoping or correlation predicate
without a test that fails when it is removed is not worth the line it occupies**,
and a test nobody has watched go red is not evidence.

## Measurements worth keeping

**886 ambiguous card numbers** across the owner's products. Zero of those groups
contain a null insert name, zero have fewer than two distinct insert names, and
zero repeat one, so the disambiguation always has a usable choice on his real
data.

**Ambiguous numbers by product:** 300 of 1194 on Topps Chrome, 300 of 742 on
Bowman Chrome, 244 of 882 on Bowman. That is the share of card numbers where the
scan's `insertName` now decides auto-commit versus review.

**2078 of 2121 football checklist rows** have the team glued onto the player.

**Parallel print-run coverage:** Topps Chrome 51 of 108, Topps Finest 45 of 74,
Bowman 88 of 122, **Bowman Chrome 0 of 305, Bowman Football 0 of 521.**

**The ledger was never touched.** Verified after every migration: 832
`baseball_cards`, 548 `sales`, 632 `purchases`, across four migrations in this
plan.

## Test pollution in the owner's production database

Found during a routine post-migration count: `checklist_entries` read 7541
against a known-good 7540.

A full sweep found two fabricated products, one checklist entry, three batches,
one photo and two jobs, all owned by uuids absent from `auth.users`, left by
aborted test runs whose `afterEach` cleanup never ran. Removed inside a
transaction scoped to non-existent owners, verified against the ledger.

**The fix is structural.** Tests now run against an isolated `iso_test` schema
holding its own copy of every table, and `tests/setup.ts` refuses to start if the
connection resolves to `public`. Proven by running the full 45-file suite and
diffing counts across ten tables: byte-identical. The guard asserts the **whole**
`search_path` rather than its head, because asserting the head would accept
`iso_test,public`, which is exactly the edit someone makes when a half-built
schema throws "relation does not exist".

The foreign-key rewrite mattered: migrations hardcode `"public"."…"` in their FK
clauses, so applied unchanged the test tables would have carried keys pointing at
the owner's real rows.

## A second pollution incident, same evening

Wiring the owner's real Discord webhook into `.env.local` caused the test suite
to post live failure messages to his phone. He asked what the "ton of failed
batches" was.

The chain is instructive. Task 14 added the notifier and a reviewer verified
every test touching it mocks it. The *next* round then added notifier calls to
`scripts/scan-commit.ts`, whose test runs `main()` ten times including on
deliberate failure paths and had never needed a mock. Nothing failed when that
changed.

Fixed the same way as the schema: `tests/setup.ts` blanks
`DISCORD_WEBHOOK_URL` for the whole suite, so no file can post regardless of what
it mocks. Verified by restoring the real webhook, running all 566 tests, and
confirming no new message reached the channel.

**Both incidents have the same lesson: a rule every file must remember is not a
rule.**

## What the real-batch probe found

Running the pipeline against real photographs justified itself for the third
plan running. A 12-card Bowman Football batch: 2 committed, 10 rejected, and the
rejections were correct given the data.

It surfaced the football team-splitting defect, which plan 1 had recorded and
dismissed as cosmetic with "the owner holds zero football cards". Both halves
were wrong: it blocks the product entirely, and he has football cards.

**A defect that was found, written down, and mis-scoped is the strongest
argument for running against real data.**

## Rulings worth carrying

Eighteen were recorded. The ones that changed the design:

- **Ruling 9 was wrong and a reviewer caught it.** It said a scan refusal should
  fail terminally so it surfaces on the health view with a retry button. The
  health view and retry path were both scoped to conversion jobs, so a terminal
  scan job would have been invisible and unretryable, which is worse than the
  ladder it replaced. The round had to widen health and retry first.
- **Ruling 12** gates the batch-duplicate confidence penalty on scarcity. A base
  Refractor falls around 1:4 packs, so six per box is normal, and flagging all
  six would fill the review queue with the most ordinary cards in it.
- **Ruling 10** keeps the commit path querying the checklist fresh rather than
  trusting the hour-old brief snapshot. A reviewer talked the controller out of
  the opposite preference on staleness grounds.
- **Ruling 16** surfaces a quantity bump distinctly rather than inferring intent:
  only the owner knows whether he pulled a second copy or re-photographed the
  first.

## Known open items

1. **A confident misread of the insert still auto-commits the wrong row.** The
   gate resolves on an exact normalised match against one candidate. This is the
   prescribed design and strictly better than sorting alphabetically, but it is
   where the next wrong row comes from.
2. **Correcting a card number *onto* a different ambiguous number is a dead
   end.** The candidate list is computed once from the original number, so no
   selector renders and the gate refuses. It refuses rather than corrupts. Needs
   the list recomputed as the owner types.
3. **The confirm screen cannot regroup, split or exclude photos.** A stray shot
   offsets every pair after it, so each card's front pairs with the next card's
   back, and since the back carries the parallel marker the wrong parallel
   commits cleanly. Rated by the whole-branch reviewer as the second most
   consequential thing on the branch.
4. **Football rejects every card** until NFL and college names are added. In
   progress at time of writing.
5. **Print runs are 0% on both Bowman products**, which silently disables the
   serial cross-check and the scarcity flag for 826 parallel rows. The source
   PDFs genuinely do not contain print runs; the `.txt` sources do. Two live
   pages carrying them were found and tested: `baseball.cards` and
   `degreegrading.com`. `scripts/fetch-checklists.ts` already fetches by URL from
   a registry and would need HTML parsing added.
6. **`printRun === null` means both "unnumbered" and "could not read one"**,
   which is why two safety checks went inert for an entire plan with nothing
   noticing.
7. **A `player_mismatch` from bad checklist data has no exit in the review UI.**
   Accept and Correct both re-run the gate and both fail; only Reject works.
8. **There is still no row level security.** Zero of thirteen migrations contain
   a policy. Every scoping guarantee is application-level, in a project five
   other real people can authenticate against. Nothing reviewed was wrong, but
   there is no backstop for a single missed predicate.
9. **Supabase Storage is outside the test isolation.** Seven tests touch it and
   all currently mock it; nothing enforces that.

## What plan 4 inherits

Open items 1 to 3 are the pipeline's remaining correctness gaps and 3 is the
largest. Items 4 to 6 are checklist data quality and are the difference between
the catalogue working on two of six products and all six.

The owner also asked for eBay sold-comp pricing. His application for eBay's
Marketplace Insights API was **denied**, which invalidates the existing note
recording it as the path. What remains: Terapeak, free in Seller Hub with a CSV
export; his own 548 recorded sales, which carry his real fees; and the Browse API
for live asks, which is a rank and not a floor. He has asked for a Card Ladder
wrapper to be wired despite it being an unofficial scrape of a paid product; that
is his call, recorded, and it should never be the only source for a number.
