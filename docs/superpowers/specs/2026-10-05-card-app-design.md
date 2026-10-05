# Card app: design

**Date:** 2026-10-05
**Status:** designed, approved in brainstorm, not yet planned
**Supersedes:** nothing. Builds on `docs/card-app-extraction-brief.md`, which stays
as the record of why this is happening.

This document is the output of a design session with Michael on 2026-10-05. Every
decision below was either made by him or made by me and accepted by him. Where I
decided, it says so.

---

## 1. What this is

One application that replaces pokestonks, with three sections:

- **Sealed**, the existing Pokemon sealed-product P&L job, unchanged in behaviour.
- **Cards**, a new, feature-rich sports-card catalogue with in-app ingest.
- **Market**, the surfaces that serve both: eBay listings, orders, sync, comps.

It is built in a **new repository**. The current repo is archived on disk and
stays greppable, but its ~820 dated one-off scripts are not carried forward.

### Why one app rather than two

Michael's reason, and it is the right one: **eBay is downstream of both.** Sealed
product and singles both exit through the same listings, the same orders, the same
fee math and the same sync. Splitting them into two apps would mean two copies of
that machinery, or one app reaching into the other's database.

### Why a new repo rather than cleaning this one

The workspace problem is not cosmetic. There are 821 files in `scripts/`, which is
a log of what happened rather than a system. The structural cause is that there was
nowhere for logic to live, so every new need became a new dated script. A new repo
with a real service layer is the fix; deleting scripts in place is not.

---

## 2. Architecture

```
  Web UI  ────┐
              ├──>  core/  ──>  Postgres (Supabase)
  Agent    ───┘    (one set of rules)
 (Discord)
```

**Stack:** Next.js, Supabase Postgres, Drizzle, TanStack Query, Tailwind, shadcn.
Same stack as today, so most of the port is moving code that already works.

**Database:** the **same Supabase project**, new schema. (My call, accepted.) The
sealed ledger already lives there and the new app owns sealed too, so a second
project would mean cross-project joins for no benefit.

### The `core/` layer is load-bearing

All real logic lives in `core/` as plain functions: ingest, checklist verification,
comping, pricing, listing, P&L, rip math. The web UI calls them. The agent calls the
same ones.

This is not tidiness. It is a hard requirement from Michael: **he must be able to
query anything the app knows from Discord**, because he logs purchases and comps
live at shows from his phone. If any capability ships UI-only, that requirement
silently breaks. One service layer with two callers is what keeps it true.

### What ports over

eBay client and auth, the comp filter logic (carrying all eight separately-found
normalisation bug fixes), P&L math, the `card-intake` skill, the checklist parser,
Rip Recap generation, the drop log.

### What does not

~800 dated one-off scripts. Archived, not carried.

### What is not redesigned

Sealed. It works. It gets moved and reconnected, not rewritten.

---

## 3. Data model

**The governing rule: every field means exactly one thing, and anything derivable
is never stored.**

Almost every wrong number in the current app traces to a violation of that rule. A
fact that was already computable got written to a column, then rotted:
`needs_back_photo` is wrong 77% of the time, `status = photographed` is claimed by
263 rows of which 52 have an image, and `for_sale` is doing three jobs at once.

### Tables

**`products`** - a thing you can open. 2026 Bowman Chrome Hobby, 2026 Topps Chrome,
Bowman Chrome Mega. Carries category, year, brand, sport, format, release date, and
the load state of its checklist and odds sheet.

**`checklist_entries`** - one row per card that exists in a product. Card number,
player, **team**, insert/subset, rookie flag, 1st Bowman flag. Parsed from the
official checklist.

**`parallels`** - one row per parallel that exists in a product, with print run and
odds. Parallel stops being free text and becomes a foreign key.

**`cards`** - a physical card Michael owns. References a product, a checklist entry
and a parallel. Carries what is true of *his copy*: serial number, autograph,
memorabilia, graded plus grade, condition, **quantity**, **intent**, location, and
the rip it came from.

**`card_photos`** - card, side (front / back / detail), url. One row per photo.

**`card_listings`** and **`card_sales`** - eBay mapping and sale history, one card to
many.

### What this fixes, specifically

**Team, insert, rookie and 1st Bowman come from the checklist for free.** They are
never typed, so they can never be mistyped, and every one is sortable. This is the
whole of requirement #5, solved by the checklist rather than by adding columns
someone has to remember to fill in.

**`intent` is a real column:** `keep` / `sell` / `undecided`. "Is this mine?" has an
answer. The 53 Mariners Sapphire cards are `keep` because Michael said so, not
because a sentence happens to contain the phrase "PC keeper".

**`quantity` replaces duplicate rows.** Two Celestens is one row with qty 2. This
lets the `duplicate_of_id` CHECK be deleted entirely, which matters because that
constraint (`duplicate_of_id IS NULL OR for_sale = false`) is what *forced* 59
second copies into the PC bucket and produced the wrong PC count of 112. Double
entry is instead prevented by a uniqueness rule on product + card number + parallel
+ serial, which bumps quantity rather than minting a row.

**`status` is deleted.** `needs_photos` / `photographed` / `priced` / `listed` /
`sold` were never facts, they were a workflow someone had to maintain. All five are
now computed: photographed means it has photos, listed means it has a live listing,
sold means it has a sale. They cannot drift because nothing writes them.

**`needs_back_photo` is deleted.** It becomes the question "is there a photo with
side = back". It was wrong 77% of the time because it was written once at insert and
never reconciled.

**`notes` keeps only genuine prose.** Team, provenance, rookie, serial and parallel
reasoning all have columns now.

### TCG readiness

`category` lives on `products`, and per-category attributes hang off the product
rather than polluting `cards`. Only sports is implemented, with eBay-comp pricing.
Adding One Piece or MTG later is a config plus a pricing adapter, not a migration.

### Accepted cost

A card from a product with no checklist loaded **cannot be catalogued**. This is
deliberate and Michael asked for it explicitly. A one-off from an old box needs a
checklist first, or it waits.

---

## 4. Cost basis and rips

**A rip links a sealed box to the cards it produced. Cost stays booked at the box.**

Cards carry no allocated basis. Rip profit and loss is computed at the rip level:
box cost against what the cards sell for and what the held ones are worth. The
existing `rips` table already books box cost as a realized loss against a purchase
lot, so this is an extension rather than a change.

**Why not allocate per card:** every allocation rule is a lie. Split evenly and a
Felnin Celesten Sapphire carries the same basis as a base vet. Split by value and
you have invented basis from a comp. Rip-level profit and loss is a number that can
be defended; per-card allocation is not.

Michael deferred this one to me and I took it. If tax-grade per-card basis is ever
needed, an allocation rule can be added later without re-ingesting anything.

The provenance link also kills "box provenance lives in `notes`" as a side effect.

---

## 5. Ingest

This is the reason to build the app at all. The weak link today is hand
transcription: on 2026-10-05 a correctly-read "97" was typed into a staging array as
"44" and only a collision check caught it.

### Capture

Michael shoots with the **native camera app**, not in-app. Two intake paths, both
landing in the same queue:

- A watched `card drop/` folder, pushed by a **small local uploader**. A watched
  folder needs something running locally because Vercel has no filesystem.
- **Bulk upload in the app**, the no-laptop path.

### Pipeline

1. **Intake.** Every file gets a content hash, so re-dropping the same folder never
   double-ingests. This is what makes the whole thing safe to re-run.
2. **Normalise.** HEIC to JPEG, orientation corrected, EXIF preserved. Originals are
   never modified.
3. **Session grouping.** EXIF timestamps cluster photos into batches. A 20-minute
   burst of 160 photos is one rip. This also reconstructs past rips during backfill.
4. **Pair front and back.** Auto-paired, then an explicit "check your photos" grid
   with a swap control. **Not optional**, because pairing will sometimes be wrong,
   especially where a run of fronts was shot before a run of backs.
5. **Scan.** Both sides in one call, with the product's checklist and parallel list
   in the prompt. The model chooses from a known set rather than reading into a
   vacuum, which removes most OCR-class errors before they happen.
6. **Verify. This is a hard gate.** The card number must exist in that product's
   checklist and the player on it must match what was read. A mismatch does not
   commit. This is the step that catches IT-14 read as IT-11, BCP-231 as BCP-331,
   BCP-127 as BCP-45.
7. **Resolve parallel** from the product's `parallels` list. Cases needing a control
   pair, such as Mojo versus Lazer or the Rookie Red shield colour, are compared
   against the rest of the batch. This is why batch context matters and why
   card-by-card scanning in isolation is insufficient.
8. **Route.** Clean and inexpensive auto-commits. **Serial-numbered, autographed, or
   comping above $25 always goes to the review queue**, as does anything uncertain.
   A checklist proves a card exists; it does not prove which parallel was pulled, and
   parallel is where the money is.
9. **Commit.** Card rows written, photos uploaded, linked to the rip.

### Checklists and odds are a first-class entity

This was Michael's addition and it is better than what I proposed. Checklists stop
being files on disk.

A product owns its checklist and its odds sheet, both parsed into rows. The app
attempts to **fetch them automatically** on product creation; Topps publishes
release-day odds sheets and printable card-by-card checklists, and Checklist Insider
publishes parsed Excel plus odds PDFs. Where fetch fails, Michael uploads manually.
Either way it parses to rows he can inspect.

Seeded from the 12 files already in `eBay_assets/Baseball Checklists/`.

The odds sheet does double duty: it is what lets Rip Recap say "two Orange /25 in one
box" and have the claim mean something.

**Known parser bug to fix, not rediscover:** `scripts/parse-checklist.py` only
matches letter-prefixed codes, so plain numeric base cards never parse. Numeric base
needs `^(\d{1,3})\s+([A-Z].*)$` against the raw pypdf text.

### Who runs the scan

**Hard constraint from Michael: no API key. Everything runs off his Claude Max
subscription.**

I corrected a premise here during the session: a Max subscription covers *him* using
Claude Code in a session, not a deployed application making its own model calls.
Those are different billing paths, and a Vercel app scanning a card unattended has no
session to run in.

The resolution, which he endorsed:

- **The application never calls a model.** Model work is written as a job row.
- **The always-on agent session drains the queue.** It already runs all day as his
  Discord agent. This is what he meant by "that's why I have you".
- The API-key worker option is **dropped from the design**, not left as a future
  switch.

Reading happens inside the agent session, on whatever model that session runs
(currently Claude Opus 5). Note that this rules out the API-side cost levers:
**there is no Batch API and no prompt-caching discount here**, because those are
properties of direct API calls and the application makes none. The checklist is
still passed as context per batch, for accuracy rather than for pricing.

**Consequences, accepted:**

- Ingest is not instant. Minutes to hours, depending on when the session picks it up.
- "Standalone" has a boundary. Browsing, filtering, editing, pricing, listing and
  publishing all work with nothing running. **Reading new cards needs the session.**
- **The real budget is session throughput, not dollars.** Michael pays nothing per
  card, but ~2800 photos is substantial session work against Max usage limits. The
  backfill therefore runs in chunks across sessions rather than in one pass, and
  the job queue is designed to be resumable for exactly this reason. Throughput per
  session is to be measured on the first real batch.

---

## 6. The Cards section

**Catalogue.** Gallery or rows. Photo, player, set, parallel, price. Badges for
listed, rookie, 1st Bowman, numbered, autographed. Counts that are true because they
are computed.

**Filters.** Team, set, product, insert, parallel, year, player, sport, plus the ones
that only become possible now the fields exist: intent, verified state, listed state,
has photos, by rip. Stackable, and always a real query rather than a string match on
prose.

**Saved views**, because "Mariners PC", "unlisted and worth over $20" and "needs a
back photo" get asked more than once.

**Card detail.** Both photo sides, every field, provenance ("box 3 of the 10-04
Bowman mega rip"), comps panel, price history, listing state, full edit surface.

**Listing, in app.** Title with a live 80-character counter, price with comp
rationale, condition, item specifics, seller policies. Preflight runs before publish
and checks the UPC. Draft, review, publish, where **publish remains a deliberate
act** requiring explicit go-ahead.

**Rip Recap.** Select a rip and get what Michael currently builds by hand: the Rip
Analysis card (cost, value, multiple, breakdown table) plus segmented collages for
Hits, Inserts, 1st Bowman, Base Rookies, Base Vets and Prospects, rendered ready to
post.

This is a real feature, not a nicety. His 2026-09-10 thread
(`x.com/IsoscelesKr4mer/status/2098251163997257927`) drew 3,307 views and a reply
asking "what is this app?".

The 40,000-foot principle: **the recap is a view over data the app already has, not
a separate artifact to assemble.** It gets its own design pass with Michael before
it is built.

**Sealed** keeps its current behaviour, now sharing the shell and feeding rips into
Cards.

---

## 7. Migration

### What is true on disk

The originals were never lost. Supabase stopped hosting images when the upgrade
lapsed, but Michael never deleted the source photos. Counted on 2026-10-05:

| location | images |
|---|---|
| `card drop/` | 1102 (plus 2 .MOV) |
| `_originals/` | 1094 |
| `iCloud Photos/` | 283 |
| `v2_photos/` | 161 |
| `Baseball Cards/` | 157 |
| **total** | **~2797**, June to October 2026 |

They are flat chronological `IMG_NNNN` dumps. Nothing on disk maps a file to a card,
and sealed shots, listing photos and videos are mixed in.

### Approach

**Re-ingest the photos as the source of truth, then attach the ledger to the result.**

All ~2800 run through the new pipeline. They are read, checklist-verified, and
grouped into sessions by EXIF timestamp, which reconstructs past rips. The output is
then matched against the existing 832 rows on identity (player, set, card number,
parallel), carrying `ebay_item_id`, `ebay_sku`, sold price and sold date onto matched
rows.

The alternative, keeping the 832 rows as the spine and bolting photos on, means
matching 2800 unlabeled files to rows largely by guesswork, and decorating records
already known to be wrong.

Filtering non-card shots and distinguishing genuine duplicates from reshoots is
implementation work, not a decision for Michael.

### Conflict rule

Michael deferred this with one constraint: **"just don't break or lose anything."**
That constraint is binding, and it is met as follows.

- **The photo wins.** The old value is preserved as an auditable, reversible
  correction record.
- **`baseball_cards` is never dropped.** It remains as a frozen snapshot, and a dump
  is kept outside Supabase.
- **Nothing is pushed to eBay automatically.** Where a correction affects a live
  listing, the database is fixed and the listing enters a reconciliation queue for
  approval. No write to eBay without an explicit go-ahead.
- **The migration runs as a dry run first**, producing a diff (matched, corrected,
  unmatched) before anything is written.

### The ledger, verbatim

As of 2026-10-05, what must survive:

```
CARDS    832 rows | 514 listed | 54 sold ($460.29)
         568 rows carry an ebay_item_id across 71 live listings
SEALED   555 purchase lots | 548 sales rows | $29,425.95 revenue
```

The single thing migration must not break is the `ebay_item_id` / `ebay_sku` mapping
on those 568 rows, because that ties a physical card to a live listing and to the
order that eventually sells it.

### Expected outcome to be honest about

Some hundreds of cards will land **unverified**, and clearing that state means
photographing them over time. Showing that number is correct. The current app hides
the same truth inside a `status` field that means nothing.

---

## 8. Build order

The old app stays live and untouched throughout. The new app reads the same Postgres.
There is no big-bang switch.

1. **Foundation.** New repo, schema, `core/`, auth, deploy. Nothing user-facing.
2. **Checklist registry.** Parser including the numeric-base fix, auto-fetch, manual
   upload, the 12 existing files seeded. Everything downstream gates on this, so it
   is first.
3. **Ingest, job queue and worker.** End to end, proven on one real rip.
4. **Thin catalogue.** Enough UI to inspect what ingest produced, before trusting it
   with 2800 photos.
5. **Backfill.** Dry run, diff, review, then commit with the ledger attached.
6. **Full Cards section.** Filters, saved views, detail, badges. **Cutover for cards
   happens here.**
7. **eBay listing.** Ported, preflight, publish gate.
8. **Sealed.** Moved across, behaviour unchanged. **Cutover for sealed happens here.**
9. **Rip Recap.** Its own design pass with Michael first.

---

## 9. Decisions, for the record

| # | Question | Decision | Decided by |
|---|---|---|---|
| 1 | One app or two | **One app**, three sections | Michael |
| 2 | Repo | **New repo**, deliberate port, old one archived | Michael |
| 3 | Card scope | **Sports implemented, TCG-shaped schema** | Michael |
| 4 | Capture | **Native camera**, drop folder plus bulk upload | Michael |
| 5 | Cost basis | **Rip-level**, cards carry no allocated basis | me, accepted |
| 6 | Scan trust | **Tiered**, checklist hard gate, always-ask over $25 | both |
| 6b | Checklists | **First-class entity**, ingest hard-gated on them | Michael |
| 7 | Supabase | **Same project**, new schema | me, accepted |
| 8 | Migration | **Re-ingest from originals**, attach ledger | me, accepted |
| 9 | Conflicts | **Photo wins**, reversible, nothing auto-pushed to eBay | me, accepted |
| 10 | Discord | **Stays.** Must be able to query anything the app knows | Michael |
| 11 | Model billing | **No API key.** Queue drained by the Max session | Michael |

---

## 10. Open, deliberately

- **Rip Recap detail.** Agreed to get its own design pass. What is above is the
  40,000-foot shape, not the final feature.
- **Backfill throughput.** How many cards one session can read, measured on the
  first real batch. This sets how many sessions the ~2800-photo backfill takes.
- **Non-card photo filtering heuristics.** Implementation detail, resolved in the plan.
