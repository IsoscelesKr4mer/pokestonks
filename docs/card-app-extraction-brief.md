# Card app: extraction brief

**Status: decided, not designed.** Michael decided on 2026-10-05 to pull the
sports-card side out of pokestonks and rebuild it as its own product, shaped more
like the Wax Cache app he sent over. He upgraded Supabase the same day, so the
quota ceiling that has been shaping decisions for weeks is gone.

This file exists so the next session starts from facts instead of from scratch.
**It is a brief, not a plan.** The plan needs a real brainstorm with him first.

---

## Why

Two separate reasons, both his words:

1. *"It was always kind of an offshoot of the original idea anyway."* pokestonks
   is a **Pokemon sealed-product P&L tracker**. Its CLAUDE.md says so: MSRP-only,
   sealed-only, "Singles tracking (until Phase 5+, if ever)" is listed under
   **Out of Scope**. The 832-row `baseball_cards` table is a squatter.
2. *"The workspace has also gotten way out of hand."* Fair. The card work is
   ~40 one-off dated scripts in `scripts/`, which is a log of what happened
   rather than a system.

## The target shape (from Wax Cache, 2026-10-05 video)

What the app does, step by step, that we want:

- **Capture**: pick photos, fronts and backs together. Explicit "Check your
  photos" step that pairs them and offers "Swap front & back" before scanning.
- **Scan**: reads **both sides** and auto-fills Year, Player, Sport, Team,
  Publisher, Set, Card #, Variant.
- **Tags as checkboxes**: Rookie, 1st Bowman, Auto, Mem, #'d, Graded.
- **Condition** dropdown.
- **Inventory**: location (Office / Selling), quantity, and "slot, cost & notes".
- **Collection**: gallery or rows, "201 CARDS IN BOX", per-card badges (LISTED,
  RC) and price.
- **List on eBay in-app**: title with a live 52/80 char counter, price, quantity,
  condition, generated description, item specifics (12/13 filled), seller setup
  (category, store category, location, payment / shipping / return policy),
  fixed price vs auction, allow offers with auto-accept and auto-decline,
  **Publish to eBay**, then "Wax Cache saved the active listing to this card."
- **Recent sales panel** on the card detail view.

Everything above is ergonomics we do not currently have. It is all on a phone.

## What we must NOT lose

Wax Cache is better at data entry and visibly worse at judgment. In the video it
listed a 2024 Prizm Jefferson Orange Laser at **$1.99** while its own recent-sales
panel showed comparable #187 parallels at **$9.99, $9.99, $10.00**.

So the new app keeps these, which are the actual moat:

1. **Checklist verification.** Card numbers get checked against the official Topps
   PDFs. This caught Imai `IT-14` (read as IT-11), Walcott `BCP-231` (read as
   BCP-331) and Moon `BCP-127` (read as BCP-45). An image scan cannot do this.
   Parser: `scripts/parse-checklist.py`. NOTE its regex only matches
   letter-prefixed codes; numeric base cards need `^(\d{1,3})\s+([A-Z].*)$` on the
   raw pypdf text.
2. **Hard parallel identification.** "Orange Laser" is printed on the card so any
   OCR gets it. A **Chrome Rookie Red RC Variation** is a *shield colour*. Mega
   **Mojo vs Lazer** is a *foil pattern*. Both need a control pair from the same
   box. All of this lives in the `card-intake` skill and must come along.
3. **Comping.** `scripts/comp-bow3box-0917.ts` carries eight separately-found
   filter bugs' worth of corrections (see
   `reference_card_comp_filter_normalisation`). That filter logic is expensive
   knowledge, not boilerplate.
4. **The book.** Duplicate guard (`duplicate_of_id` + the CHECK that forces
   `for_sale = false`), quantity sync across a 42-variation you-pick, and
   unbooked-sale detection, which found $14.48 of card sales eBay never surfaced.
5. **Pricing judgment.** Split by scarcity before pricing; see
   `feedback_scarce_cards_are_not_priced_for_velocity`. The Salio auto sold in 62
   minutes because one velocity rule was applied to five different cards.

## What exists today, and where

| thing | where |
|---|---|
| data | Supabase Postgres, `baseball_cards`, **832 rows** |
| UI | `/baseball-cards` page in the pokestonks Next.js app |
| domain knowledge | `.claude/skills/card-intake/SKILL.md` |
| checklists | `eBay_assets/Baseball Checklists/*.pdf` + odds sheet |
| photos | `eBay_assets/card drop/` (HEIC off his phone), `eBay_assets/_originals/` |
| eBay auth | refresh-token flow reading `~/.claude.json` |
| eBay write | AddFixedPriceItem, ReviseFixedPriceItem, EndFixedPriceItem, GetOrders |
| photo hosting | **eBay EPS**, not Supabase. `scripts/eps-upload-bowman-0910.ts` |
| listing log | `eBay_assets/listings_v2.md` |

Schema today: `id, user_id, player, set_name, year, card_number, parallel, sport,
status, for_sale, asking_price_cents, comp_note, photo_urls (jsonb),
image_storage_path, ebay_item_id, ebay_offer_id, ebay_sku, sold_price_cents,
sold_date, notes, created_at, updated_at, needs_back_photo, hidden_from_share,
is_share_cover, duplicate_of_id`.

Known schema weaknesses to fix rather than port:
- `notes` is a dumping ground. Tags (1st Bowman, RC, serial, team, box
  provenance) are regex'd back out of prose. They should be columns or a tag
  table, exactly like Wax Cache's checkboxes.
- No quantity column, so a second physical copy becomes a second row linked by
  `duplicate_of_id`. Wax Cache models quantity directly. Decide which.
- No location / cost / slot fields at all.
- `status` and `for_sale` overlap confusingly and have already caused one wrong
  report (`reference_baseball_cards_for_sale_flag`).

## Open questions for the brainstorm

1. Separate repo, or a second app in this one? He said the workspace is out of
   hand, which argues for separate.
2. Same Supabase project with a new schema, or a new project? He just upgraded,
   so quota is no longer the constraint it was.
3. Migrate all 832 rows, or start clean and backfill? 515 are live eBay listings,
   so the `ebay_item_id` mapping has to survive either way.
4. Does pokestonks keep **any** card surface, or is the split total?
5. Sports cards only, or Pokemon singles too? He has One Piece, Naruto/Kayou and
   MTG knowledge in memory as well.
6. Phone-first means a real mobile web app at minimum. Does he want to keep
   driving it from Discord, or is the app the interface now?
7. What runs the scan? The reading in this session was done by me off contact
   sheets. In-app it needs to be an actual model call per card.

## The one thing to get right

The reason to build this at all is that **the hand-typing step is the weak link**.
Tonight a correctly-read "97" was typed into a staging array as "44" and only the
collision check caught it. Wax Cache does not make that mistake. Whatever gets
built must remove the human transcription step between reading a card and storing
it, or it has not solved the actual problem.

---

## Measured evidence from the live app, 2026-10-05

Michael sent screenshots of the Cards page calling it "totally broken" and "in
complete disarray". He is right, and the numbers are specific. Every one of these
is the same root cause: **no field means exactly one thing.**

| what the UI says | what is actually true |
|---|---|
| **PC 112** | **53** are genuine PC, **59** are second copies held off sale from the mega rip. The 53 is the Mariners Sapphire core: 9x Felnin Celesten, 5x Colt Emerson, 4x Jonny Farmelo, 4x Kade Anderson, 3x Lazaro Montes, 3x Ricardo Cova, 3x Yorger Bautista, plus the rest |
| **Photographed 263** | only **52** have an image. 211 render "NO PHOTO YET" |
| **Needs Back 155** | **119 of them already have 2+ photo URLs.** The flag is wrong 77% of the time, and **0** of them are flagged for a reason their own notes support |

**A correction worth recording, because it is the same disease.** The first pass
at this table reported only **9** genuine PC keepers. That was measured by asking
whether a row's `notes` literally contain the phrase "PC keeper" or "not for
sale". Only 9 happen to be worded that way. Michael corrected it immediately:
*"there are a lot more than 9 cards in the PC it's basically all the mariners
sapphire + some."* He was right, the real number is **53**.

So the analysis diagnosing "notes is prose that gets regex'd back out" was itself
produced by regexing prose. **If the operator cannot reliably count the owner's
own collection from this schema, the app certainly cannot.** "Is this mine?" has
to be a column with a real answer, not a phrase someone hopes to find in a
sentence. That single failure is the strongest argument in this document.

Causes, field by field:

- **`for_sale`** is doing three jobs: personal-collection flag, "second copy held
  so it cannot be double-listed", and "not priced yet". The duplicate guard's
  CHECK (`duplicate_of_id IS NULL OR for_sale = false`) *forces* every second copy
  into the PC bucket. One night of cataloguing pushed 59 cards into "PC".
- **`status`** describes the operator's workflow, not the data. `photographed`
  means "a human read photos off disk", which is why 263 rows claim it and 52 have
  an image.
- **`needs_back_photo`** is written once at insert and never reconciled against
  `photo_urls`.
- **`notes`** holds team, box provenance, 1st Bowman, RC, serial and parallel
  reasoning as prose, then gets regex'd back out.

**Two inventory errors found the same evening, both now fixed:**
- 8 Bowman Basketball Blasters sold on the Topps marketplace 2026-09-30 for
  $336.72 and never booked, because the exit was off eBay so nothing synced.
  Booked as sale 628, $55.22 profit on $265.20 of cost.
- The six mega boxes ripped on 10-04 and 10-05 were never logged as rips, so
  $331.62 of cost basis sat in sealed inventory for boxes that are now cardboard.
  Held corrected 14 -> 8.

## The ledger must survive, verbatim

His first question on hearing "new app" was whether the record survives. It does,
and the numbers as of 2026-10-05 are:

```
CARDS    832 rows | 514 listed | 54 sold ($460.29)
         568 rows carry an ebay_item_id across 71 live listings
SEALED   555 purchase lots | 548 sales rows | $29,425.95 revenue
```

The ledger lives in Postgres, not in the app, so a new front end does not threaten
it. **The one thing migration must not break is the `ebay_item_id` / `ebay_sku`
mapping on those 568 rows**, because that is what ties a physical card to a live
listing and to the order that eventually sells it. Everything else can be
restructured freely.

## Requirements he added on 2026-10-05

In his words, these are needs that "have evolved over time":

1. **Keep a sealed wax section.** The pokestonks P&L job does not go away.
2. **A catalogued overview of every card ingested**, not a list bolted onto a
   sealed-product tracker.
3. **An in-app ingest tool** like the Wax Cache video: photos in, both sides read,
   fields filled, no terminal and no operator.
4. **A Cards section that is feature rich and not an afterthought.**
5. **Sort and filter by team, by set, by insert, and more.**

**Point 5 is the one that forces a rewrite rather than a patch.** Today:
- **team does not exist as a column.** It lives inside `notes` as prose.
- **insert is encoded in the `set_name` string**, e.g.
  `2026 Bowman Chrome (Spring Breakout insert)`, so filtering inserts means
  string-matching a parenthetical.
- **parallel is free text**, which is why normalising it has its own memory entry.

You cannot sort by a field that does not exist. That is a data model problem, not
a UI problem, and it is the clearest argument for building fresh rather than
bolting filters onto this schema.
