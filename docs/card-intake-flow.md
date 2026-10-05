# Card drop and identification flow

The companion to `ebay-agent-setup.md`. That one covers getting a listing live.
This one covers the harder half: knowing what you actually pulled.

Every rule below exists because getting it wrong cost money or had to be undone.

---

## The drop

One folder the phone dumps into. That is the whole interface. The agent watches
it, and once cards are catalogued and photos are hosted, the originals move to
an archive folder. Move, never delete.

**Shoot in a consistent way and the rest of this gets much easier:**

- same backdrop every time, and a plain saturated colour beats a busy one,
  because it lets code find the card edges automatically
- card in a clear stand, same distance, same lighting
- **front, back, front, back**, in order

**Confirm the pairing on the first two files rather than assuming it.** And
check the file list for gaps before mapping pairs, because **one missing file
flips front/back parity for every card after it.** That has happened: a drop
ran odd-numbered-is-front up to a gap and even-numbered-is-front after it.

In the ingest script, assert that every photo is claimed by exactly one card and
that no photo on disk is left orphaned. Both halves of that check have caught
real errors.

---

## Identification

### Never infer a parallel from the card number, the product, or the price

Read it off the card. Three specific traps:

**The back marker is product-specific.** 2026 Topps Chrome prints the word
`REFRACTOR` on the back under `@TOPPS`, beside the team logo. `CHROME` is on
every card and means nothing. But Bowman Chrome does **not** print that word at
all. A confirmed Orange /25 and a confirmed Blue /150 both had blank backs.

So before trusting any marker on a product you have not checked, **find a
control pair**: two copies of the same card number where the parallel differs,
and see what actually changes. A hobby box that yields the same base card twice,
once refracting and once not, is worth more than an hour of guessing.

**Where there is no back marker, the front does the work.** Crop a strip of the
card's outer border and blow it up. A refractor shows a broad rainbow sweep
across the dark area; a base card stays flat neutral. Compare against known
anchors from the same batch, not from memory, because a chrome card is a mirror
and lighting alone will not fool a side-by-side.

**Named parallels are obvious once you look for the pattern instead of the
word.** Checkerboard is X-Fractor. Sweeping waves are RayWave. Repeating logos
are Logofractor. The word `REFRACTOR` only appears on the plain undesigned one.

### Read the serial before naming a colour

Numbered parallels print the serial on the front, usually right side just above
the nameplate. **Scan every card for one.** Do not assume a plain-looking card
is unnumbered: a prospect refractor that looked ordinary turned out to be
460/499, and that is the difference between a $2 card and a $20 one.

If a digit is genuinely obscured, record what you can read and flag which digit
needs confirming. Never round a serial to a probably.

### Colour names are not guessable, and the same colour has variants

One product had Purple Refractor, Purple Pulsar, Purple Wave and Purple Shimmer,
all at the same 1:37 odds and the same serial. Odds cannot separate them. Only
the texture can:

- **Wave** is dense vertical ribbing, like corduroy
- **Shimmer** is diagonal streaks
- **True <colour>** is the plain one, dead smooth

**Pull reference photos of known examples off live listings and compare.** That
is thirty seconds of work and it is the difference between a right answer and a
confident wrong one. The market also has its own vocabulary; a parallel the
manufacturer calls "Blue Refractor" may be universally listed as "True Blue",
and searching the official name finds nothing.

### A logo on the card is not implied by the card number

"1st Bowman" is printed on the front. It is **not** implied by the BCP- prefix.
A subset contains both a player's first card and repeat prospects, and only the
first carries the logo. Out of 24 prospects in one box, 17 had it and 7 did not.
Inferring it from the prefix put a false claim in a listing title.

A player can also appear in two products in the same year with two different
card numbers. Those are different cards with different values and must be
comped separately.

---

## Verify against the official checklist

The checklist is the only source that catches a misread the photos agree on.
Every manufacturer publishes one and retailers host the PDF.

Parse it and validate **every coded card**: does the code exist, and does the
player name on the card match the name on the checklist? That single pass
confirmed 33 of 33 cards in one box, which is worth far more than spot-checking.

Two parsing traps, both of which silently turn every double-digit card into an
unknown code: the PDF extracts codes glued to names (`BTP-11Juan Soto`), and
accented names lose characters to U+FFFD. Treat U+FFFD as a wildcard and match
on surname.

**Then run the collision check.** Two different players cannot hold the same
card number inside one set:

```sql
SELECT set_name, card_number, string_agg(DISTINCT player, ' | ')
FROM cards
WHERE card_number IS NOT NULL
GROUP BY 1,2 HAVING count(DISTINCT player) > 1;
```

Resolve every hit by re-reading both cards, never by picking the likelier one.
Beware that a hit can also be two legitimately different products filed under
one set name, which is its own bug worth finding.

---

## Pricing

**Never put the card number in the search query.** It throttles results to near
zero because most titles do not carry it. Query wide on year, set and player,
then filter on the number afterwards. "No comps" is almost always a bad search,
not a thin market.

**Every comp needs a not-list as well as a must-list.** A query wide enough to
find the card is wide enough to find its autograph and its /25. A plain insert
once priced at $45 when the real market was $3, because every comp above $10 was
an auto or a serial-numbered colour.

Exclude autos, serials and other colours for a plain card. Invert it for a
numbered one: require the colour and the run size.

**Watch for cards that look like base cards and are not.** Some products hide
premium cards behind titles with no serial and no parallel word: rookie
variations, image variations, case-hit inserts. One of those dragged a base
card's median from $6 to $50.

**Report the ask count next to every median and flag anything under four.** One
seller with no competition is an opinion, not a price.

**A serial is a multiplier, not a floor.** Price the player first, then apply
scarcity. And a colour that matches the team's colours carries a real premium
that sellers name explicitly, but it is set by the player, not the parallel.

---

## What actually goes in the database

Not everything deserves a row. Plain base cards are worth filing only if they
are a rookie, a big name, or carry something else. An unexplained base card is
usually a misread parallel, so re-check before filing one.

**When you cannot settle a parallel from the photos, file it with no price and a
note saying so, and have the pricer skip it.** That is always cheaper than a
wrong call. Flagging one card for a human costs a minute. Selling a refractor at
the base price does not come back.
