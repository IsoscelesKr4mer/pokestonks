# eBay Marketplace Insights API — access application

**Why:** our pricer currently uses the Browse API (active *asking* listings, which run high). Marketplace Insights returns actual **sold** prices (last 90 days) — the real comps we want before bulk-listing.

**Status (checked 2026-07-24):** our production app does NOT have the scope. A client-credentials token request for `buy.marketplace.insights` returns `invalid_scope`, i.e. not granted. It requires a manual access request.

**Reality check:** Marketplace Insights is a **Limited Release** API. eBay grants it mainly to large/approved partners; individual sellers can apply but approval is not guaranteed and is often denied. Sandbox access does not imply production access.

## How to apply (must be done by Michael — needs eBay dev-account login)

There is no "open a ticket" button until **Support is activated** on the developer account. Do this first:

1. Sign in at https://developer.ebay.com with the account that owns the Pokestonks keyset.
2. **Activate Support:** go to **Profile & Contacts** (account menu). In the **Primary Contact** section, fill name, email, phone, country → click **Activate Support**. This unlocks the ticketing UI.
3. Go to **Developer Technical Support**: https://developer.ebay.com/support/developer-technical-support → **AI-Assisted Support** tab → create a ticket (the AI flow will offer "create a ticket" if it can't self-resolve).
4. **Subject:** `Buy API Production Access (Marketplace Insights) - <your eBay user ID>`
5. Paste the justification below. eBay reviews (Buy API production access is gated behind eBay Partner Network approval of the business model), and if approved, enables the scope on the app.

**Production App ID (Client ID):** `MichaelD-Pokeston-PRD-21addb012-c6718f0b`

**Justification to paste:**
> I operate a small single-user eBay reselling business (sealed Pokémon TCG product and sports-card singles). I've built an internal inventory and pricing tool that currently uses the Browse API for active-listing comps. I'm requesting production access to the Marketplace Insights API so I can price my own inventory against actual recent sold prices (last 90 days) rather than aspirational active listings, to list accurately and competitively. Usage is read-only, internal, and low volume (a few hundred `item_sales/search` calls per week). Production App ID: MichaelD-Pokeston-PRD-21addb012-c6718f0b.

## Once granted
The pricer (`scripts/price-cards.ts`) swaps the Browse endpoint for `GET /buy/marketplace_insights/v1_beta/item_sales/search` with the `buy.marketplace.insights` scope. The existing tightened matcher (exact card # + product gate) carries over unchanged; we just comp against `lastSoldPrice` instead of active `price`.

## Fallback if eBay denies (likely)
**PriceCharting API** (paid) — covers sports-card singles and sealed TCG with market/sold values, no eBay approval needed. Fully automatable; would drop into the pricer the same way. This is the pragmatic path if Insights is denied. (Free manual option: Seller Hub → Research/Terapeak shows sold comps to eyeball per card.)
