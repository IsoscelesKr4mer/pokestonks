# Baseball Cards Inventory Gallery (Design Spec)

**Date:** 2026-07-23
**Author:** brainstormed with Michael via Discord
**Status:** design approved, ready for an implementation plan / focused build session
**App:** pokestonks (Next.js + Vercel + Supabase + Drizzle)

## Purpose

A dedicated page in pokestonks for Michael's baseball-card singles (pulled from ripping
boxes), separate from the Pokemon sealed vault. It's an **inventory gallery** whose job is
to show, at a glance, **what still needs photos** and **what's priced / listed**. Replaces
the manual markdown tracker (`eBay_assets/baseball_singles_haul_2026-07-14.md`).

Baseball singles are NOT in the Pokemon vault (no `catalog_item_id`, no FIFO P&L) - this is
a standalone, lightweight tracker.

## Status flow (confirmed)

Each card carries one status, shown as a color-coded badge:

`Needs Photos -> Photographed -> Priced -> Listed -> Sold`

Status is an explicit field (set in-app or by the agent). The UI may suggest the next
status (e.g. once photos + price + eBay link exist) but does not force it.

**Not-For-Sale / documented cards (added 2026-07-23):** some cards are keepers Michael only
wants to DOCUMENT, not sell (e.g. his Mariners Sapphire collection). Add a `for_sale`
boolean (default true). When false, the card shows a "Keep / Not For Sale" badge, is
excluded from the sell-flow status counts (needs-photos/priced/etc.), and can be filtered
separately. It still lives in the gallery for documentation.

## Data model

New table, separate from the vault. Drizzle schema; money in integer cents; ISO dates.

```sql
CREATE TABLE baseball_cards (
  id             BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id        UUID NOT NULL,
  player         TEXT NOT NULL,
  set_name       TEXT,                 -- e.g. "2026 Topps Chrome"
  year           INTEGER,
  card_number    TEXT,                 -- string ("16", "A-5", "092/088")
  parallel       TEXT,                 -- e.g. "RayWave Refractor", "base"
  sport          TEXT NOT NULL DEFAULT 'Baseball',
  status         TEXT NOT NULL DEFAULT 'needs_photos',
                 -- needs_photos | photographed | priced | listed | sold
  for_sale       BOOLEAN NOT NULL DEFAULT true,  -- false = keeper/documented only (e.g. Mariners Sapphire)
  asking_price_cents INTEGER,          -- current ask (null until priced)
  comp_note      TEXT,                 -- e.g. "RayWave sold $139 on 2026-07-21"
  photo_urls     JSONB NOT NULL DEFAULT '[]',  -- ordered array of Supabase URLs (lead first)
  ebay_item_id   TEXT,                 -- live listing id (null until listed)
  ebay_offer_id  TEXT,
  ebay_sku       TEXT,
  sold_price_cents INTEGER,            -- when status=sold
  sold_date      DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_baseball_cards_status ON baseball_cards(status);
```

Follow existing pokestonks data conventions: Drizzle for service-role writes, Supabase
client for user-side reads, TanStack Query in the frontend.

## Page / UI

New nav tab **"Cards"** (baseball). Route `/cards`.

- **Header:** title + status filter chips (All / Needs Photos / Photographed / Priced /
  Listed / Sold) with live counts, e.g. "3 need photos - 5 priced - 2 listed". The counts
  are the whole point: Michael opens the page and immediately sees his to-do.
- **Gallery grid:** responsive (2 cols on phone, more on desktop). Each tile:
  - lead photo, or a clear "No photo yet" placeholder (placeholder doubles as the visual
    cue for the Needs Photos state)
  - player, set + year, parallel
  - color-coded status badge
  - asking price if set (and a small "listed" link to the eBay item when present)
- **Card detail (tap a tile):** all photos, editable fields (status, asking price, comp
  note, notes), add/replace photos (upload to the Supabase `ebay-listings` bucket or a
  dedicated `baseball-cards` bucket), and the eBay item link.
- **Add card** button -> form (player/set/year/#/parallel + optional photos + status).

No app branding concerns (internal page, not a public/shareable route).

## Entry paths

1. **In-app:** add/edit cards and upload photos directly.
2. **Discord/agent:** Michael sends a card (photo + info) in Discord; the agent inserts the
   row and hosts the photos (same flow already used for listings). This keeps the phone-first
   workflow he already uses.

## Seed (day one)

Pre-load the ~20 baseball singles from the markdown tracker (EXCLUDE the Aurorus - that's a
Pokemon card, out of scope here). Map each with player/set/parallel/card #/status:
- **Listed:** Kevin McGonigle RayWave RC (#168555697322, $99.99), Shohei Ohtani RWB
  Refractor (#168555750100, $199) - with their hosted photos.
- **Photographed / needs pricing:** the 2026 Topps Finest batch (Karros /150, Bichette
  /150, Crawford /250, Witt Jr WF insert, Pete Crow-Armstrong WF insert, Crochet /250, Woo
  /75, Murakami x3, Okamoto, Griffin, Montgomery, Beavers, Burns, Sanford, Hartman) + the
  two other Ohtanis (Finest base #50, 2021 Chrome #159).
- **Seed photo note:** McGonigle + Ohtani RWB photos are already hosted on Supabase. The
  Finest-batch photos were only received in Discord (not hosted); during seed either
  re-host them from the Discord inbox, or seed those as status `needs_photos` in-app so
  they surface in the to-do. Decide at build time.

## eBay integration (light for v1)

`ebay_item_id` links a card to its live listing; setting it flips status to Listed and
shows the link. v1 does NOT auto-sync price/sold state from eBay (manual/agent updates).
Future: pull live status + auto-mark Sold.

## Out of scope for v1

Vault P&L integration (these are non-vault), auto-sync of sold status from eBay, grading
workflow, Pokemon singles (Aurorus etc.), multi-user.

## Build plan (focused session)

1. Drizzle: add `baseball_cards` table + migration; push.
2. API routes: list (with status filter), create, update, photo upload.
3. `/cards` page: grid + status filter chips + counts (TanStack Query).
4. Card add/edit detail (form + photo upload to Supabase).
5. Nav link to "Cards".
6. Seed script for the ~20 cards (data + hosted photos + status).
7. `npm run build` before deploy; push so Vercel ships.

Conventions: money in cents, ISO dates, no em-dashes in UI copy, Drizzle service-role for
writes / Supabase client for reads, TanStack Query for fetching.
