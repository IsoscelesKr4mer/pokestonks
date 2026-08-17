---
name: everett-auto-targets
description: Use when planning in-person autograph hunting at Everett AquaSox games - finds which Northwest League prospects are coming to Everett, which of their cards Michael already owns, and which 1st Bowmans are cheap enough to buy before the player arrives.
---

# Everett in-person autograph targets

Michael collects in-person autographs at Everett AquaSox home games. This finds
who is worth targeting and what cardboard to have in hand.

```
npx tsx scripts/everett-auto-targets.ts                 # next 45 days
npx tsx scripts/everett-auto-targets.ts --days=200      # rest of the season
npx tsx scripts/everett-auto-targets.ts --future        # add the feeder levels
npx tsx scripts/everett-auto-targets.ts --max-price=15  # only cheap buys
npx tsx scripts/everett-auto-targets.ts --no-ebay       # skip price lookups, fast
```

## Why the Northwest League makes this tractable

The NWL is **league 126** inside **sportId 13** (High-A) and has only six clubs,
so every road team at Everett comes from a fixed pool of five organisations:

| NWL club | parent org |
|---|---|
| Eugene Emeralds | San Francisco Giants |
| Hillsboro Hops | Arizona Diamondbacks |
| Spokane Indians | Colorado Rockies |
| Tri-City Dust Devils | Los Angeles Angels |
| Vancouver Canadians | Toronto Blue Jays |
| *Everett AquaSox* | *Seattle Mariners (home)* |

A prospect anywhere in those five systems eventually passes through Everett as
he climbs. That is what `--future` covers: it walks Single-A and rookie ball for
the same five orgs, which is where **next season's** visitors are sitting now.
Michael's own examples all fit this shape: Ethan Holliday in Rockies A ball is a
Spokane visitor next year, Jojo Parker in the Blue Jays system is a Vancouver
visitor.

**Away players are the soft target.** The crowd swarms the home dugout, so the
visiting side is reachable. The tool therefore never suggests Everett's own
roster; the home team is the hard ask, not the opportunity.

## The output that matters is ACQUIRE, not BRING

The obvious framing is "which of my cards should I bring". That is the smaller
half. When this was first run, Michael owned cards for **9 Everett players but
only 3 across all five visiting organisations**. The bottleneck was never
knowing who to bring, it was owning nothing for the people actually coming.

So every rostered player is checked against eBay for a **1st Bowman** and its
cheapest active listing, which answers two questions at once: does a signable
card exist, and what does it cost to get one before he arrives. Graded copies
are excluded, since nobody hands a slab over a rail.

Three sections come out:

- **BRING** - owns an unsigned card, player is coming. Pull it from the binder.
- **ACQUIRE** - player is coming, has a 1st Bowman, owns nothing. Buy before the
  date. Most Single-A 1st Bowmans run **$1-2**, so a whole series costs very
  little to prepare for.
- **already signed** - skip, he has the auto.

## Rules

- **Everything is fetched live.** Rosters churn weekly. Michael has called out
  stale prospect data before: *"youre data is old felnin and farmelo are in AA
  now in arkansas. this is readily available info dont poison my chat with old
  info."* Nothing is hardcoded except the league id, and even the club list and
  parent orgs are read from the API each run.
- **Never assert a player's level or org from memory.** Run the tool.
- The eBay pass is roughly 110ms per player, so a single visiting roster (~50)
  takes under a minute and `--future` (~1,100 players) is a long run. Use
  `--no-ebay` when you only need the roster and ownership cross-reference.
- A player can appear on two rosters (rehab assignment, complex-league entry).
  The tool collapses to one line per player, keeping the soonest visit.

## When the schedule is empty

Outside the season, `--days` will find no home games and BRING/ACQUIRE will be
empty. That is expected. Use `--future --no-ebay` to work the feeder systems for
next year, then re-run with the eBay pass once next season's schedule is posted.
