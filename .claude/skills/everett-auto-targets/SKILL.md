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
npx tsx scripts/everett-auto-targets.ts --offseason     # plan next season (see below)
```

## Offseason mode is the main event

`--offseason` sweeps **every roster below Double-A** in all six NWL
organisations: High-A, Single-A and rookie ball. AA and above is the cutoff,
because that is where a player has actually left the league.

An earlier version dropped the current High-A rosters, reasoning that they all
graduate to AA. That was wrong. Michael: *"That's not true some of these guys
just got pulled up in the last week. Let's just keep it at <AA."* Promotions run
continuously, so someone who reached High-A days ago is still an NWL body next
season.

Everett's own roster is in scope. Away players are the easier ask, but there are
81 home dates a year to work the home side too.

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
| Everett AquaSox | Seattle Mariners (home) |

A prospect anywhere in those five systems eventually passes through Everett as
he climbs. That is what `--future` covers: it walks Single-A and rookie ball for
the same five orgs, which is where **next season's** visitors are sitting now.
Michael's own examples all fit this shape: Ethan Holliday in Rockies A ball is a
Spokane visitor next year, Jojo Parker in the Blue Jays system is a Vancouver
visitor.

**Away players are the soft target.** The crowd swarms the home dugout, so the
visiting side is reachable. Everett's own roster is still included, because
there are 81 home dates to work it: *"no I def want it to incluide Everett's
roster"*.

**Affiliations move, so never name an affiliate from memory.** In 2026 the
Mariners' Single-A club is the Inland Empire 66ers, not Modesto. The tool reads
every club and parent org from the API on each run for exactly this reason.

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
- **NEVER trust a roster call for where a player is now.** `rosterType=fullSeason`
  is CUMULATIVE: it lists everyone who suited up for the club at any point this
  season, including players long since promoted. It had Felnin Celesten and
  Jonny Farmelo on Everett after both moved up to Double-A Arkansas, and it had
  Ricardo Cova as a future arrival when he is already there. Michael, twice:
  *"felnin and farmelo are in AA now in arkansas... dont poison my chat with old
  info"*, then *"you need to have a better source for these players"*.

  The roster call is only used to discover **who to consider**. Each player is
  then re-seated on his own `currentTeam`
  (`people?personIds=...&hydrate=currentTeam`) and dropped if that club is not
  one of the below-AA clubs in these six orgs. On the first corrected run this
  cut 1,502 roster entries to 931 real players. It also removes the need for any
  highest-level dedupe, since a player has exactly one current team.
- **A 429 must never look like a zero.** eBay Browse has a daily call cap and a
  full sweep is ~930 lookups; two sweeps exhausted it and every lookup returned
  429. The original code caught the error and returned "0 listings", which is
  indistinguishable from "this player has no 1st Bowman", and quietly emptied
  the ACQUIRE list. `firstBowman` now returns **null** for unknown, stops after
  20 failures, and the report says loudly that the list is incomplete. Results
  are cached to `scripts/_bowman_cache.json` for 14 days so re-runs cost no
  quota.
- The eBay pass runs six concurrent. Sequential was fine for one roster but the
  full below-AA sweep is 1,500 players and ran past ten minutes.
- **`rosterType=fullSeason` includes MLB players on rehab.** A Single-A roster
  can contain Shane Bieber, Alek Manoah or Yusei Kikuchi, and projecting them
  into next season's Northwest League is nonsense. Anyone with an `mlbDebutDate`
  is filtered out of `--offseason` (35 of 400 on the first run). In-season they
  are left in, because a rehabbing big leaguer at Everett is a genuine target.

## When the schedule is empty

Outside the season, `--days` will find no home games and BRING/ACQUIRE will be
empty. That is expected. Use `--future --no-ebay` to work the feeder systems for
next year, then re-run with the eBay pass once next season's schedule is posted.
