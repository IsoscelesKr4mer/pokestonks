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
