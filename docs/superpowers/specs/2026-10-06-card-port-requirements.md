# Card port requirements

Captured 2026-10-06, from Michael: "Make sure that you have my sales from ebay
as well so that we arent relisting old cards that already sold when we do the
port over."

This governs the plan that moves `baseball_cards` (the pokestonks table) into
Isosceles Insights' `cards` table. Every figure below was measured on
2026-10-06, not estimated.

## What the source data actually looks like

832 rows in `baseball_cards`:

| status | for_sale | count | has sold_price | has ebay_item_id |
|---|---|---|---|---|
| listed | true | 514 | 0 | 514 |
| photographed | true | 151 | 0 | 0 |
| photographed | false | 112 | 0 | 0 |
| sold | false | 54 | 54 | 54 |
| priced | true | 1 | 0 | 0 |

**The sold set is internally consistent.** All three cross-checks returned zero:
no card with a `sold_price_cents` whose status is not `sold`, no `sold` card
still flagged `for_sale`, and no sold card missing a `sold_date`. The most
recent recorded sale is 2026-10-05.

So the already-sold cards are not the relist risk. They are correctly marked.

## The four rules the port must follow

1. **Reconcile against eBay immediately before the port, not days before.**
   The 514 `listed` rows carrying a live `ebay_item_id` are only as accurate as
   the last reconcile. A card that sold since then still reads as available, and
   that is the one path that actually causes a relist. This is the same failure
   shape as [[feedback-offebay-exits-leave-listings-live]].
   Note `ebay_sync_state.last_synced_at` reads 2026-07-06 while card sales are
   recorded as recently as 2026-10-05, so that marker tracks a different
   subsystem and must not be trusted as proof of card freshness.

2. **Port sold cards as sold. Do not drop them.** Michael's instruction is about
   not relisting, not about discarding history. Dropping the 54 would destroy
   realized P&L, which is the thing the app exists to compute.

3. **Do not port a card with `duplicate_of_id` set as a separate listable card.**
   59 non-sold rows carry one. Porting them flat reintroduces the double-listing
   problem the duplicate guard was built to make impossible
   ([[reference-card-duplicate-guard]]).

4. **`for_sale` is the PC flag, not a backlog marker.** The 112
   `photographed, for_sale=false` rows are Mariners personal-collection keepers.
   They belong in the catalogue but must never be surfaced as sellable, and
   their stale asking prices must not be quoted
   ([[reference-baseball-cards-for-sale-flag]]).

## Open at time of writing

The eBay MCP server failed to connect during this session, so rule 1's
reconcile has not been run. It is a precondition of the port, not a step inside
it.
