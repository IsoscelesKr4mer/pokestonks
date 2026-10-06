# Isosceles Insights, plan 1 of 7: outcome

**Completed 2026-10-05.** 12 of 12 tasks, 31 commits, 140 tests, typecheck and
build clean. Final whole-branch review verdict: fit to hand over.

Repo: `C:\Users\Michael\Documents\Claude\Isosceles_Insights`, branch `main`, no
remote configured.

Plan: `2026-10-05-isosceles-insights-foundation.md`
Spec: `../specs/2026-10-05-card-app-design.md`

---

## What exists now

A Next.js app with a complete checklist parsing layer, the full card schema live
on Supabase, a verification gate, a seeded product registry, and a products UI
rendering real data.

**Seeded from the owner's real checklists:**

| | |
|---|---|
| products | 11 |
| checklist entries | 7,540 |
| parallels | 1,130 |

| product | entries |
|---|---|
| 2026 Bowman Football | 2,121 |
| 2026 Topps Chrome | 1,571 |
| 2026 Bowman Chrome | 1,199 |
| 2026 Bowman | 1,188 |
| 2026 Topps Finest | 1,038 |
| 2026 Bowman Chrome Mega | 350 |
| five Sapphire products | 0, checklist not yet sourced |

The five Sapphire products rendering "No checklist loaded. Add one to continue."
is the design working, not a gap in it. A product without a checklist cannot be
catalogued.

## Measurements worth keeping

**Parser coverage.** Zero code-shaped rows dropped across five real checklist
PDFs, 6,617 rows parsed, after three row-pattern defects were found and fixed.

**Team resolution: 99.77%**, 4,876 of 4,887 rows. Before the trademark-glyph fix
it was effectively zero for every PDF-sourced row.

**Cross-source agreement.** 2026 Topps Chrome parses to 1,571 rows from its TXT
and 1,574 from its PDF, through entirely different adapters. That is the single
strongest evidence the parsing layer is correct.

**Parallel parsing.** 560 of 565 candidate lines parsed; all 5 rejections are
prose of the form "All cards are /25 or fewer", which must be rejected.

**The ledger was never touched.** Verified after every migration: 832 cards, 568
carrying an `ebay_item_id`, 548 sales, all 17 pre-existing tables present.

## Defects that unit tests could not have caught

Three defects in this plan passed every test and a clean build, and were found
only by running the code against the owner's real files. They are recorded
because the pattern matters more than the individual bugs.

1. **The trademark glyph.** The team splitter stripped `\uFFFD`, which pypdf
   produces. The app uses unpdf, which decodes `®` correctly. Every PDF-sourced
   row therefore returned `team: null`, and all nine unit tests passed because
   they fed the pypdf-shaped string.
2. **The checklist constraint.** `unique(product_id, card_number)` silently
   discarded over 1,100 real cards, because card numbers restart at 1 in every
   insert. 457 lost from Bowman Chrome alone. The parser had already been fixed
   to deduplicate per section; the schema had not.
3. **The correlated subquery.** `listProductsWithCounts` used unqualified column
   references, which Drizzle rendered as bare `"product_id" = "id"`. Since
   `checklist_entries` also has an `id`, it correlated to the wrong table and
   returned a count of zero for every product. Build clean, tests green, page
   rendered, every number wrong.

The standing lesson: a task is not done until its real output has been looked at.

## Known open items

Each was a deliberate decision, not an oversight.

1. **Parallels collapse per-subset odds.** A parallels row is a treatment rather
   than a card, and cards resolve correctly via `checklist_entry_id`, but each
   subset's own odds for a shared parallel name are lost. Fixing it means
   attributing parallels to their section in `parse.ts`, which today collects
   them globally. The only consumer is Rip Recap. **Revisit in plan 7.**
2. **`insert_name` is inconsistent across products.** A PDF yields
   `BOWMAN CHROME PROSPECTS`, a TXT yields `Bowman Chrome Prospects`, so a
   cross-product insert filter would list the same insert twice. A global prefix
   map cannot fix this: applying one was measured to drop 381 cards from Bowman
   Chrome and 247 from Bowman, because prefixes are shared by genuinely distinct
   subsets that the heading tells apart. The real fix is canonicalisation keyed
   on (product, heading), or a per-product inserts table. **Belongs with Cards
   filtering in plan 4.** No data is wrong or lost.
3. **Team resolution's last 11 rows.** Exact strings:
   `Tampa Bay Devil Rays`, `USA` as a third printed form of United States, an
   all-caps `YOMIURI GIANTS`, and a `George Bush` ceremonial card that correctly
   has no team. A four-line append to `OTHER_TEAMS` whenever `teams.ts` is next
   opened.
4. **`cards.quantity` and `card_listings.quantity` can contradict**, letting a
   listing claim more copies than owned. This is the same overcommit shape that
   has bitten the eBay side before. Needs a trigger or an app-level check.
   **Belongs with listing work in plan 5.**
5. **No pagination** on the checklist viewer, up to 2,121 rows. Acceptable at
   this scale; virtualisation is a design task, not a patch.
6. **The parallels parser emits a junk row** named `All cards are` from prose
   like `All cards are /15` lacking its trailing words. One or two rows per
   product, visible and deletable.
7. **NFL and college team names are absent**, so the Bowman Football checklist
   resolves no teams. The owner holds zero football cards. Roughly 600 names
   when it matters.

## Not done, and why

**No authentication, and therefore no deployment.** The app renders the owner's
private collection and cost data. A public URL would expose it. A Vercel session
exists but no project is linked, and Deployment Protection cannot be confirmed
non-interactively. Deployment is the owner's call, with his credentials, and
auth should land first. **Auth is a plan 2 requirement.**

**No git remote.** Everything is committed locally on `main`. Pushing is the
owner's call.

## What plan 2 inherits

The ingest pipeline, the job queue, and the Discord enqueue ping. It also
inherits auth, which the spec's build order placed in step 1 and this plan did
not deliver.
