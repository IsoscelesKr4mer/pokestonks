# Pokestonks Storefront — Plan 10.1 (opt-out flip)

**Date:** 2026-05-03
**Status:** Approved (single-session iteration on Plan 10's opt-in flow)
**Supersedes:** Sections of `2026-05-02-pokestonks-storefront-design.md` (Q3 default, §6.5 filtering, §7.3 admin table, §8.1 CTA states)

## Why

Plan 10 shipped with **opt-in** semantics: an item appears on the storefront only after the user explicitly sets an asking price. After ~30 minutes of actual use, the friction of "price every item one by one before any buyer can see anything" was untenable. User feedback: "I want to add all my holdings to a storefront and then if I don't want any included I can just toggle a hide button."

This patch flips the model to **opt-out** with a market-price fallback.

## Locked decisions (this session)

- **Q1 default price:** `roundUpToNearest($5)` of `last_market_cents`. Manual override per item still wins.
- **Q2 no-market items:** auto-hidden from public storefront. Admin shows "no price; not visible to buyers" until override is set. Listings without any price source (no market AND no manual override) are not eligible to render to buyers.
- **Q3 hide toggle location:** admin `/storefront` table only. Holding detail page shows a "Hidden from storefront" indicator chip (read-only signal); managing visibility happens in admin. No grid-level quick-hide.

## Data model change

Reuse `storefront_listings` table. The semantic flips from "row exists = listed" to "row exists = override":

```sql
-- supabase/migrations/20260502000004_storefront_optout.sql

ALTER TABLE storefront_listings ALTER COLUMN asking_price_cents DROP NOT NULL;

-- Drop the existing >=0 check, re-add with NULL allowance.
ALTER TABLE storefront_listings DROP CONSTRAINT storefront_listings_asking_price_nonneg;
ALTER TABLE storefront_listings ADD CONSTRAINT storefront_listings_asking_price_nonneg
  CHECK (asking_price_cents IS NULL OR asking_price_cents >= 0);

ALTER TABLE storefront_listings ADD COLUMN hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN storefront_listings.asking_price_cents IS
  'Per (user, catalog_item) explicit price override in cents. NULL = use rounded market fallback.';
COMMENT ON COLUMN storefront_listings.hidden IS
  'TRUE = exclude this item from the public storefront, even though qty > 0. FALSE = include normally.';
```

Existing Plan 10 rows: `asking_price_cents` non-null, `hidden=false` default → render exactly as today.

## Service layer

New pure helper `roundUpToNearest(cents, step = 500)` → `Math.ceil(cents / step) * step`.

`loadStorefrontView` rewires from listing-driven to holdings-driven:

```
1. For (user_id), aggregate every catalog_item where qty raw > 0 (existing aggregation, graded excluded).
2. LEFT JOIN storefront_listings on (user_id, catalog_item_id) for the same set.
3. For each candidate:
     if override.hidden = true → exclude
     else if override.asking_price_cents not null → display price = override.asking_price_cents (mark as overrideOrigin='manual')
     else if catalog.last_market_cents not null → display price = roundUpToNearest(last_market_cents) (origin='auto')
     else → exclude (no price source)
4. Sort: items with override first (recently-priced), then market-only by name.
   Tiebreak: name ASC.
```

The output preserves the existing `StorefrontViewItem` shape but adds `priceOrigin: 'manual' | 'auto'`.

`computeTypeLabel` is unchanged.

## API surface

`GET /api/storefront/listings` returns every eligible holding (qty raw > 0), each row carrying:
- `catalogItemId`, `askingPriceCents | null`, `hidden`, `createdAt | null`, `updatedAt | null`
- `displayPriceCents` (resolved per service rules above) `| null` (only null when item is hidden in admin view's filtered set; admins still see the row)
- `priceOrigin: 'manual' | 'auto' | 'none'`
- joined `item` (same shape as Plan 10)
- `qtyHeldRaw`, `typeLabel`

`POST /api/storefront/listings` body becomes `{ catalogItemId, askingPriceCents?: number | null, hidden?: boolean }`. Upserts on conflict, updating only the fields supplied. `askingPriceCents = null` explicitly clears any override (revert to auto). `hidden = false` un-hides. If body has neither field, return the existing row unchanged.

Validation: at least one of `askingPriceCents` or `hidden` MUST be present (otherwise 422 `nothing_to_update`).

`DELETE /api/storefront/listings/[catalogItemId]` removes the override entirely. Equivalent to "reset to defaults" — item reverts to visible + auto-priced.

## Admin route (`/storefront`) UX

`ListingsTable` is now a full holdings table:

- Header columns unchanged (Image · Item · Market · Ask · Qty · ×). The × column becomes a hide-toggle column with two icons: 👁 (visible, click to hide) / 🚫 (hidden, click to show).
- Every holding row appears, sorted: visible-with-override first, visible-with-auto-price next, hidden-rows last, name ASC tiebreaker.
- The "Asking" cell:
  - When override is set: shows the override price, **bold**. Click → inline-edit. Empty input on save → clears override (price reverts to auto). The visual delta between override and auto market is a small caret pill (e.g., "▲ $5" or "▼ $3" vs market).
  - When auto: shows `auto $XX.XX` in muted text. Click → inline edit promotes to override.
- Hidden rows: row has `opacity-50` and a "hidden from storefront" muted label in the Item cell. Hide toggle still operable.
- Items with no market price AND no override AND not hidden: row shows "no price set" muted label in Asking cell. Public-storefront column shows "(not visible to buyers)" instead of qty.
- Footer: keep `+ Add item from holdings` (still useful: lets you set a price on something proactively before it's at qty>0; relevant for newly bought items not yet logged). And `Copy as text`.

## Holding detail integration

`<SetAskingPriceCta>` becomes `<StorefrontStatusCta>` (rename, but keep the file path). Label states:

| Holding state | Label | Click action |
|---|---|---|
| Listed (override set, not hidden) | `On storefront · $X` | Opens dialog (edit / hide / clear override) |
| Auto-priced (no override, not hidden) | `Auto-priced for storefront · ~$X` | Opens dialog (set explicit price / hide) |
| Hidden (override flag) | `Hidden from storefront` | Opens dialog (unhide / set price) |
| No price source AND no override AND not hidden | `Storefront: no market price · set one` | Opens dialog (set price; no auto fallback available) |
| qty raw == 0 | (hidden — same as Plan 10) | n/a |

Dialog (`AskingPriceDialog`) gains a "Hide from storefront" toggle alongside Save and Remove (now labeled "Reset to default"). Validation: hidden + no price is fine (means "user actively hidden"). Save commits any changed fields.

## Public route

Filter: `qty raw > 0 AND not hidden AND price source available (override OR market)`. Display price = override if set, else `roundUpToNearest(last_market_cents)`. Sort, layout, white-label rules unchanged from Plan 10.

## Out of scope (still)

- Per-lot price overrides (still per catalog item).
- Graded item listings.
- Configurable rounding step UI (default $5; if user wants $1 or $10 later, add as a profile setting in a future plan).
- "DM for price" rendering for unpriced items. They auto-hide.
- Per-token visibility overrides (a hide is global across all of user's tokens).
- Markdown export of `auto`-priced rows is included (treats them like any other row); `(auto)` is NOT shown in the markdown — buyers shouldn't care.

## Test plan delta from Plan 10

- New service tests: `roundUpToNearest`; `loadStorefrontView` returns auto-priced items, excludes hidden, excludes no-market-no-override, sorts override-first.
- API: GET returns all eligible (not just override-bearing); POST accepts `hidden`-only and `null`-asking-price bodies; validation rejects empty body.
- Admin: ListingsTable renders all holdings; hide toggle fires expected mutation; auto-price displayed as muted "auto $X"; hidden rows visually de-emphasized.
- Public route: hidden + no-price both filtered out; rounded price shown.

## Migrations to apply (in order)

1. `20260502000003_storefront.sql` (Plan 10) — if not yet applied.
2. `20260502000004_storefront_optout.sql` (Plan 10.1).
