# Isosceles Insights, plan 4 of 7: outcome

**Completed 2026-10-07.** 10 planned tasks plus 3 inserted ones, 741 tests,
typecheck, lint and build clean. Every phase deployed to
`https://isosceles-insights.vercel.app` and verified against the live URL
rather than the build output.

Every figure here was verified at HEAD by the controller against the live
database, not taken from an implementer's report. That distinction earned its
keep: one task reported success while having doubled two of the owner's
checklists.

Plan: `2026-10-06-isosceles-insights-trustworthy-intake.md`
Spec: `../specs/2026-10-05-card-app-design.md`
Predecessor: `2026-10-06-isosceles-insights-scan-and-review-OUTCOME.md`

---

## What exists now

**The stray-photo bug is dead.** A single non-card shot mid-rip used to shift
every pair after it, so each card's front paired with the **next card's back**.
The back carries the parallel marker, so the scan read a real front and a real
back, both confidently, and committed a card that does not exist, with nothing
warning anywhere. The owner can now exclude, split and merge on the confirm
screen, and his grouping is **stored** rather than recomputed.

**One rip is one batch.** The uploader chunks by size and posts one request per
4MB, and each request used to mint its own batch. Measured: twelve real photos
produced **six batches** before, **one** after. A 160-photo rip would have been
roughly eighty separate confirms on a screen built to fix pairing across a
whole rip.

**The review queue has no dead ends.** Correcting a card number recomputes the
insert candidates as he types, with a generation guard so a slow response
cannot land on top of a newer one. A card whose **checklist** is wrong can be
parked with a note instead of discarded.

**Every product has one checklist source.** All eleven, including the mega box
and five Sapphire sets that had never had a checklist at all. **Zero missing
teams anywhere**, where three products had 17, 25 and 4.

**`printRun` stopped meaning two things**, and the two safety checks that had
been silently inert for an entire plan are armed again.

**The catalogue exists.** Until this plan the pipeline committed rows that
nothing displayed; the only way to see its output was SQL.

**Adding a product is a screen**, not a hand-edited JSON file, which required
moving the registry into the database because Vercel's filesystem is read only.

The application still never calls a model.

## The failure that defines this plan

**Task 7 shipped correct code against a wrong model, and corrupted two of the
owner's checklists on the live database.**

The plan told it to point a product's `checklist` registry slot at an HTML
page. It did exactly that. But the seeder globs **every** cached file for a
slug and the PDF was still there, so both were parsed into one product:

| product | entries | null team | parallels | with print run |
|---|---|---|---|---|
| 49 before | 1199 | 0 | 305 | 0 |
| 49 after | **1940** | **741** | **360** | 55 |
| 53 before | 2121 | 0 | 521 | 0 |
| 53 after | **4243** | **2117** | **590** | 69 |

Three distinct faults, and the print runs that were the point of the task
arrived alongside all of them. Card rows doubled. The duplicates carry no team,
because that page's table ends in a Section column, so product 53 went from 0
missing teams to 2117 and **silently undid the football fix from four hours
earlier**. And parallels duplicated rather than merged, which is a schema fault
rather than a parser one: the unique key included the print run, so an
unnumbered Refractor and a Refractor /499 are two rows, not one row completed.

**The fault was in the plan, not the implementation.** The brief named a
registry slot; the model behind it was wrong. A product does not have one
checklist source. It has several contributing different things: the PDF has
rows and teams, the HTML has print runs, the odds sheet has odds. "Which file
is the checklist" is the wrong question.

**What caught it was not a test.** All tests passed throughout. The implementer
measured the four products it had been told not to disturb, noticed the two it
was told to fix had also moved in the wrong direction, and wrote that under
Concerns instead of leading with its headline. **Six per-product counts in a
report** are the only thing that stood between this and the backfill.

## The owner's correction, which was better than the fix

Shown the mess, he said: *"The checklists seem inconsistent I think we need to
set a standardized checklist from a single source"*, and then, asked for
specifics, *"DYOR"*.

The research found something better than his instinct assumed.
`checklistinsider.com` covers **every** product he owns, in one format, with
the team behind an explicit ` - ` delimiter and print runs alongside odds:

```
1 Konnor Griffin - Pittsburgh Pirates RC
Yellow /275 (1:354 Hobby; 1:283 FDI; 1:71 Breaker)
```

Three consequences beyond the inconsistency he was pointing at:

1. **`core/checklist/teams.ts` became unnecessary for every seeded product.**
   An evening had gone into hand-building MLB franchises, 32 NFL teams and 88
   colleges so a splitter could guess where a player's name ended and his team
   began. A columnar source does not guess. That work unblocked football for a
   day, but it was solving a problem the right source does not have.
2. **The mega box got a checklist source for the first time**, which is why it
   had zero parallels.
3. **Five Sapphire products became seedable.** They had always pointed at that
   site; the parser was what was missing.

The mega question was settled from his own data rather than asked: Bowman
Chrome Mega is **not** the same checklist as Bowman Chrome, carrying
mega-exclusive sections and 19 card numbers absent from the hobby product.

## Measurements worth keeping

**Final state, all eleven products, verified against the live database:**

| product | entries | null team | parallels | run known |
|---|---|---|---|---|
| 48 Topps Chrome | 1337 | 0 | 58 | 58 |
| 49 Bowman Chrome | 1191 | 0 | 63 | 63 |
| 50 Bowman Chrome Mega | 403 | 0 | 21 | 21 |
| 51 Topps Finest | 1042 | 0 | 42 | 42 |
| 52 Bowman | 1178 | 0 | 94 | 94 |
| 53 Bowman Football | 2121 | 0 | 74 | 74 |
| 54 to 58 Sapphire | 195 to 284 | 0 | 0 to 12 | 0 to 9 |

8,567 checklist entries, 381 parallels, zero duplicate identities, zero junk
rows. **Product 55 is the one product with parallels and no print runs**, and
is the live case `printRunKnown: false` exists for.

**Parallels fell sharply and that is a correction, not a loss.** Football went
521 to 74. The old list was one ladder repeated per insert section with **no
print runs at all**; the new one is a single clean ladder, Platinum 1/1 through
Aqua /199 with Mojo, Shimmer, Reptilian and X-Fractor variants, every one
carrying odds.

**The ledger never moved.** 832 `baseball_cards`, 548 `sales`, 632 `purchases`,
verified after every one of four migrations and every re-seed.

## The pattern, now at thirteen instances

**A test that looks like a guard and is not.** Four more this plan, and three
were found by workers checking their own work, which is new.

The most instructive is the one a reviewer found in Task 8. The brief said to
delete a branch and watch a test go red. That passed. But **pinning the branch
to always take the "known" path also passed** — in the one parser that produces
the other value in production. The case the entire task existed to create was
untested, in an actively-churning file, and one careless edit would have
silently re-inerted both safety checks with a fully green suite.

**The rule that follows:** deleting a check and watching a test go red only
proves the check is *reached*. Forcing it to always take one outcome proves the
test reads its *value*. Those are different, and only the second is a guard.

A second instance from Task 2 is worth the same attention: a test asserted a
set of keys was **unique** and passed while the mechanism generating them was
broken, because the wrong values did not happen to collide in that fixture. It
was rewritten to assert **provenance** — every key traces to an actual mint
call. Uniqueness is a property of the output; provenance is a property of how
the output was produced. A broken implementation can satisfy the first by luck.

## Mistakes the controller made

Recorded because a plan's outcome that only lists the workers' errors is not an
honest one.

1. **The Task 7 model was wrong**, as above. Two checklists corrupted on a live
   database.
2. **Two bugs shipped in code I wrote into briefs.** Task 1's partial index
   rationale was wrong about Postgres null semantics, so a test I claimed was a
   guard structurally could not be one. Task 2's prescribed helper **silently
   dropped a photo** when more than two lacked a pair index: five in, four out,
   no trace. Its own comment claimed the opposite.
3. **A correction made in one task was not propagated.** Task 1 found that
   asserting a constraint name does not work on this stack; I left the same
   broken snippet in Task 6, where another implementer hit it and had to prove
   it again.
4. **I pushed and deployed on a red suite**, having read the tail of the test
   output, which is the duration, instead of the result line. The deployed code
   happened to be correct. That is luck, not care, and it is the same shortcut I
   had been telling workers not to take all evening.
5. **I drew a conclusion from data without asking what wrote it.** I measured
   nine photos in one batch and reported the fragmentation concern as unfounded.
   The data had been hand-patched by the agent that produced it, which it had
   written down and I had not read. The concern was real and became Task 4b.

## Process findings worth carrying

- **Parallel execution worked**, on genuinely disjoint file sets, with staging
  discipline enforced by instruction: stage only your own paths by name, never
  `git add -A`, never revert what you did not create. It roughly doubled
  throughput. **One agent still pushed and amended a controller commit into its
  own**, diverging the branches. Nothing was lost, but only because the
  divergence was investigated rather than resolved with a force-push: each tip
  held one of two fixes. **"Do not push" has to be checked, not assumed.**
- **A scratch file in a Next repo is not inert.** One agent's `scripts/_tmp_*.ts`
  probe broke `npm run build` for everyone, because the typecheck phase sweeps
  the whole tsconfig glob regardless of what imports it.
- **A dry run before a live write is worth more than a test.** Task 7b's brief
  required proving one product before seeding all of them. That requirement
  caught a seeder bug: it only upserted, so stale rows accumulated when a
  heading changed shape between sources. One product briefly hit 813 entries
  from a 403-row parse, near the stop condition, and it traced the cause rather
  than shipping it.
- **A blanket "I falsified everything" is a claim to verify.** One report
  claimed four guards broken two ways each; a reviewer found one had been broken
  one way, did the other direction itself, and found the code fine. The work was
  sound and the claim was overstated.

## Known open items

1. **No human has clicked the pairing grid or the add-product screen in a
   browser.** Both are proven by executing unit tests and by real-data probes
   driven through their server-side functions, which is better evidence than
   mocks and still not a click. The environment has no browser.
2. **There is still no row level security.** Zero of seventeen migrations
   contain a policy, in a project five real people can authenticate against.
   Every scoping guarantee is application-level. This plan added several and
   broke each one deliberately to confirm it is load bearing, including finding
   that two predicates in the provenance join are **mutual backstops rather than
   independently redundant**, which is documented in the code so a future reader
   does not delete one as dead weight.
3. **Provenance resolves through a content hash, not a foreign key**, because
   `cards` has no batch column. Proven stable rather than arbitrary: the photos
   table is unique on (user, content hash) and inserts conflict-do-nothing, so
   the first batch wins permanently.
4. **Two Sapphire products have a legacy parallel-ladder format** the parser
   does not read, so they seed cards and no parallels.
5. **`year` has no lower bound** on the add-product screen, and preview counts
   are not comma-formatted.
6. **Supabase Storage is outside the test isolation.**

## What plan 5 inherits

**Plan 5 is the design pass, and it happens before the backfill.** That is the
owner's own standing rule, that design gets its own plan once the data flows
are healthy, and the ordering matters: those screens are how he will inspect
2,800 photographs. An inspection surface he dislikes looking at is one he will
not use, and a catalogue he avoids checking is worse than no catalogue, because
he will trust it without looking.

After that, the backfill, carrying one requirement in his own words: *"Make
sure that you have my sales from eBay as well so that we arent relisting old
cards that already sold when we do the port over."* The schema can hold it;
nothing yet stops a sold card being offered again.
