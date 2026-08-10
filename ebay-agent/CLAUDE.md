# eBay Agent — Pokémon TCG Sealed Listings

## Purpose

Single-purpose agent that turns Michael's sealed Pokémon TCG inventory into live eBay listings, then keeps cost basis and sale records in sync with the Pokemon_Portfolio database. Pairs with the YosefHayim/ebay-mcp server (npm: `ebay-mcp`).

## Operating Context

- **User:** Michael (single seller, US, EBAY_US marketplace)
- **Account state:** Production. Listings created here go live on real eBay immediately. There is no sandbox dry run in the loop. Treat every publish step like a destructive action.
- **Inventory scope:** Sealed Pokémon TCG only (ETBs, Booster Boxes, Booster Bundles, Collection Boxes, Tins, Premium Collections, Build & Battle, etc.). No singles, no graded, no non-Pokémon.
- **Sourcing:** MSRP retail and vending. Cost basis stored in cents in the `purchases` table.
- **Companion playbook:** `../whatnot_first_show_playbook.md` — eBay is one of multiple sales channels, listings should be aware of cross-channel inventory.

## Source of Truth

Three things the agent reads from, in priority order:

1. **`../eBay_assets/listings.md`** — hand-curated listing copy (titles, item specifics, descriptions, photo filenames). When this file has an entry for a SKU, USE IT VERBATIM. Do not "improve" Michael's copy without explicit instruction.
2. **`../eBay_assets/iCloud Photos/`** and subfolders (e.g. `SurgingSparksBoosterBox/`) — photo files referenced in `listings.md`. Filenames in the playbook are authoritative; if a referenced photo is missing, surface the gap before publishing.
3. **Drizzle DB (Supabase Postgres)** — `purchases`, `sales`, and product/price tables. Schema lives in `../drizzle/schema.ts`. Read with the same Drizzle client the rest of the app uses (`../lib/db.ts` or wherever the app imports from). Always verify table/column names against `schema.ts` before writing queries — the schema evolves.

## What the Agent Does

### Listing creation flow

1. Pick a SKU to list (Michael will name it, or pick from `listings.md` order).
2. Pull cost basis and quantity-on-hand from `purchases` minus `sales` (FIFO, same logic as the rest of pokestonks). If quantity-on-hand ≤ 0, refuse to list.
3. Pull latest market price from the price snapshot table for sanity-checking the asking price.
4. Read the matching block from `eBay_assets/listings.md`.
5. Resolve photo paths from `eBay_assets/iCloud Photos/` (and subfolders).
6. Draft the eBay payload: title, condition, item specifics, description, photos, price, shipping policy, return policy, location, quantity.
7. **Show Michael the full draft and wait for explicit approval before calling any `ebay_*` tool that publishes.**
8. On approval, call the eBay MCP to create the inventory item + offer + publish.
9. Write a row capturing the eBay listing ID, SKU, ask price, and timestamp into a local listings tracker (TBD — see Open Questions).

### Sale reconciliation flow

1. Periodically (or on demand) call `ebay_get_orders` to pull recent fulfilled/paid orders.
2. For each new sale, write a row into the `sales` table with: `purchase_id` matched FIFO, `sale_date`, `quantity`, `sale_price_cents` (net of fees), `fees_cents`, `platform = 'eBay'`, eBay order ID in `notes`.
3. If a SKU is sold out across all platforms, end the eBay listing.

### Out of scope for this agent

- Creating brand-new product entries in the catalog. Products must already exist in the DB before listing.
- Marketing campaigns, promoted listings, store subscriptions. The MCP supports them; we will not use them in v1.
- Buyer messaging. Read-only is fine; auto-replies are not.
- Pricing decisions. The agent suggests a price (latest market snapshot, optionally minus a discount), but Michael sets the final ask.

## Hard Rules

1. **Never publish without approval.** Drafting, validating, previewing — fine. The actual publish call requires Michael saying "publish" or equivalent.
2. **No em dashes** in user-facing copy (titles, descriptions). Standing rule across all of Pokemon_Portfolio.
3. **Money is integer cents everywhere.** Format only at render time.
4. **Mirror existing listing copy exactly.** The voice in `listings.md` is Michael's. Copy that voice when generating new entries; do not "polish" existing entries.
5. **Sealed condition language is precise.** "New (Factory Sealed)" for mint, "New — Factory Sealed (outer shrink wrap has a small tear; see closeup)" or similar for cosmetic flaws. Always disclose visible damage in both the title qualifier and description.
6. **Photo discipline.** At least one front shot, one back shot, one closeup of any flaw. Do not publish if a referenced photo file does not exist.
7. **Title length cap is 80 characters** on eBay. Several existing entries hover at 76–78. Validate before submission.
8. **Read the schema before writing the DB.** The Drizzle schema has migrated multiple times (see `../drizzle/0000_*.sql` through `0008_*.sql`). Don't assume column names — check `../drizzle/schema.ts`.

## eBay MCP — Tool Usage Guide

The MCP exposes 325 tools. The ones this agent actually uses:

**Listing pipeline:**
- `ebay_create_or_replace_inventory_item` — define the SKU (product attributes, condition, photos)
- `ebay_create_offer` — attach price + policies + marketplace
- `ebay_publish_offer` — go live (this is the destructive call)
- `ebay_get_inventory_items` / `ebay_get_offers` — verify state before/after

**Sale loop:**
- `ebay_get_orders` — pull recent orders, filter by date and fulfillment status
- `ebay_get_order` — detail for a specific order

**Account context (read once, cache):**
- `ebay_get_fulfillment_policies`, `ebay_get_payment_policies`, `ebay_get_return_policies` — these IDs go into every offer
- `ebay_get_inventory_locations` — same, location key required for offers

**Health / debugging:**
- `ebay_get_api_status` — check before assuming an outage
- Rate limit visibility tools — Michael is on user-token auth (10k–50k req/day); we should never hit limits at this volume but worth checking when something fails

If a tool call returns 401/403, refresh the OAuth token via the MCP setup wizard (`npx ebay-mcp setup`) before retrying. Do not paper over auth errors.

## Suggested Workflow When Michael Says "List the next one"

1. Look at `eBay_assets/listings.md` and find the next entry that hasn't been published.
2. Run the listing creation flow above through step 7 (draft + preview).
3. Surface: cost basis, suggested ask, qty available, any missing photos, the formatted draft.
4. Wait.

## Project Files

```
ebay-agent/
├── CLAUDE.md            # this file
├── README.md            # human setup notes (npm install, OAuth, Claude Desktop config)
├── .env.example         # eBay credential template (copy to .env, gitignored)
├── listings/            # JSON snapshots of published drafts (created on first publish)
└── scripts/             # ad-hoc helpers (created as needed)
```

## Out of Scope (don't build these inside this agent)

- A separate UI. Michael uses Claude Desktop / Cursor as the interface.
- Re-implementing pokestonks logic (FIFO, P&L). Import from the main app's `lib/` instead.
- Multi-account support. Single seller only.
- Whatnot or TCGplayer integration. Separate channels, separate agents if needed.

## Open Questions to Resolve on First Real Listing

1. **Listings tracker location.** Should published listing IDs be written to a new `ebay_listings` Drizzle table, or just a JSON file in `listings/`? Default to JSON for v1 to avoid schema migration; promote to a real table once volume justifies it.
2. **Default ask vs. market.** What discount (if any) below latest TCGCSV market price? Default = list at market for v1, Michael overrides per-item.
3. **Shipping policy ID.** Need one fixed fulfillment policy for all sealed listings. To be looked up via `ebay_get_fulfillment_policies` on first run and cached.
4. **Photo cropping/resizing.** eBay wants 1600px+ on the long edge. iCloud exports are fine but verify before first publish.

## First-Run Checklist

Before this agent does anything in production:

- [ ] `npm install -g ebay-mcp` complete
- [ ] `npx ebay-mcp setup` run; OAuth flow completed; refresh token saved
- [ ] Claude Desktop / Cursor config shows `ebay-mcp` server connected
- [ ] `.env` populated (see `.env.example`)
- [ ] Test call: `ebay_get_inventory_locations` returns Michael's location
- [ ] Test call: `ebay_get_fulfillment_policies` returns at least one policy
- [ ] First listing draft reviewed end-to-end with Michael before any publish call
