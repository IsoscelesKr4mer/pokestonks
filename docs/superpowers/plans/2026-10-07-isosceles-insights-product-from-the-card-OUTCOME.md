# Plan 5 outcome: the card says what set it is

Shipped 2026-10-07. Eight tasks, nine commits, 991 tests, deployed and
verified against Michael's own card rather than a fixture.

**What he could not do before:** photograph a stack holding two Bowman Chrome
cards and one from a set he had not added. The confirm screen had one product
dropdown, a batch had to claim to be one product, and a card from an unknown
set was rejected as a card number that does not exist in a checklist it was
never in.

**What he can do now:** confirm with nothing in the dropdown. Each card names
its own set from what is printed on it, is checked against that set's
checklist, and a card from a set he has not added is parked with the set's
name and a link to add it.

## The acceptance run, which is the only evidence that counts

Batch 5019, his Noah Cameron A-NC from 2026 Topps NOW Road to Opening Day, a
set that did not exist in the app when he photographed it.

| step | result |
|---|---|
| confirm with an empty dropdown | `ok: true`, job queued. Returned `no-product` that morning. |
| brief | 12 products, 0 checklist entries, correct for a batch not claiming one set |
| set identified from | the **back**. The front's large ROAD TO OPENING DAY wordmark alone gives the wrong product name; the checklist files it under Topps NOW, and the back says so in full. |
| gated against | Topps NOW's checklist, which the batch never named |
| outcome | review, serial-numbered + autograph. 0 rejected, 0 parked. |
| queue list label | the card's set, with the batch's product null |
| parallel | Green Foil /99 pre-selected against 98/99, named by the serial |

## Five things the plan did not contain, found during execution

1. **Task 5b did not exist in the plan.** Reading `core/review/items.ts` to
   write Task 5's dispatch showed `decideReviewItem` refuses outright when
   `batch.productId` is null, and the detail page sources checklist, parallels
   and insert candidates from it. Task 2 made null possible and Task 6 would
   have made it common, so every review item from such a batch would have
   become undecidable with an empty parallel dropdown. **No test could have
   caught it: every fixture in that file seeds a batch that has a product.**

2. **The Accept gate.** A parked card stores `productId: null`, and 5b's
   fallback to the batch hint is deliberate so the screen has something to
   show. That fallback made Accept commit a parked card against whatever set
   the batch happened to hint at. The 5b implementer flagged it in their own
   report rather than leaving it. Closed by a shared pure predicate in
   `core/review/productGate.ts` imported by BOTH the client form and the
   server, because a disabled button is not a guard.

3. **`notifyScanEnqueued` would have thrown** on a null product. Not named in
   any dispatch; the Task 6 implementer found it. It is the Discord ping, so
   it would have broken the confirm for exactly the new flow.

4. **The queue list showed the batch's set, not the card's.** Found reviewing
   5b. For a `product-mismatch` item those differ by definition, which is the
   one row where naming the wrong set misleads most.

5. **The product dropdown had never been tested.** `tests/dom.tsx` had no way
   to change a `<select>`, so the field had zero coverage. Same class as the
   upload-button defect: a control the harness could not drive is a control
   nobody tested.

## Two of my own errors, both the same mistake

**I reconstructed an input instead of using the real one. Twice.**

- Retyped `odds.ts`'s regexes into a scratch script through a shell heredoc to
  check them. Every backslash was eaten, `\s(?:\/(\d{1,6})` became
  `s(?:\/(d{1,6})`, and it reported that print runs do not parse AT ALL.
  A confident, wrong claim about the repo caused entirely by my own harness.
- Built the Sapphire test fixture from a TEXT EXTRACTION of the page instead
  of its markup. The real page puts the ladder in a `<div>` with no `<br>`,
  with card rows in a separate div; my fixture put both in one br-joined div.
  **The fix shipped, 991 tests green, and did nothing.** Only running it
  against the live page caught it: still 0 parallels.

The rule: never retype or reconstruct the thing under test. Import the module,
use the page source.

**A third, cheaper one:** re-arming the DB monitor I added a `grep` filter
without `--line-buffered`, so grep buffered the stream and no event could
reach me. The watch was blind for about 35 minutes and looked healthy.

## What this cost and bought

`briefIsScannable` lost two refusal reasons; `confirmPairing`'s `no-product`
was renamed `product-not-yours` because the ownership failure is now its only
producer. The hard gate was not touched at any point, which was the plan's
central constraint.

**Known tradeoff, not a defect:** with no product hint the brief carries the
product list but no checklist, because eleven products is 9,126 entries. The
scan can still name each card's set and the commit still gates correctly, but
it can no longer resolve an ambiguous insert from candidates. CPA-AG has four
entries sharing its number and player. The help text now says so, and the
honest guidance is: name the set when you know it, leave it on Not sure for a
mixed sitting.

## Shipped alongside

- Sapphire parallels: products 54 and 56 went 0 to 11 and 0 to 8, with entry
  counts asserted unchanged at 284 and 283. Per-subset odds collapse on
  (name, print run) and one subset's odds are lost; fine for naming a parallel
  from a serial, wrong for Rip Recap, recorded not hidden.
- `jsonb_typeof` guard on the new queue join. A bare `::bigint` cast in a JOIN
  condition takes down the whole review screen, not one row.
