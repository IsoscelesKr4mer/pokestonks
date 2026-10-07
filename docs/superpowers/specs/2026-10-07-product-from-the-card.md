# The card says what set it is

**Michael, pairing his first real batch:**

> "There's a single drop down for 1 product but 2 of the 3 cards are 2026
> bowman chrome from a hobby box and the 3rd is from Road to Opening Day which
> is a new set we haven't paired anythig to yet. Ideally you are able to scan
> the cards and know the product w/o me having to manually insert that."

He is right on both counts, and the second is the design error.

**The assumption I built on was "one batch is one rip is one product".** That
holds for a hobby box and fails for how he actually works: he photographs
whatever is on the table, so a batch is a sitting, not a product. Forcing one
product per batch makes a mixed batch unrepresentable.

**And the information was never his to supply.** A card prints its own year,
brand and set. Asking him to type what the card already says is asking him to
do the scanner's job.

---

## How it works now, and the one thing that must not change

Today the product is chosen at confirm, `scan:next` writes a brief containing
**that one product's** checklist and parallels, and the hard gate in
`core/products/verify.ts` verifies the card number and player against it.

**The hard gate stays exactly as it is.** It is the thing that stops a
misread becoming a wrong row, it was fought for across two plans, and nothing
here loosens it. What changes is only *which* checklist it is handed.

## The change

**1. The product on a batch becomes a hint, not a requirement.**

The confirm screen keeps the dropdown but it is optional and renamed to what
it is: *"Mostly from"*, with *"Not sure"* as a first-class choice. When he
names one, the brief carries that product's checklist, so the agent can
resolve an insert precisely from candidates, which is what plan 3's work
bought and must not be thrown away.

**2. The brief carries the product list.**

Every product he owns, as `id`, year, brand, name, format, sport. Eleven rows
today. Not every checklist: that is 8,567 entries and the brief is read into
a context window.

**3. The agent names the product per card.**

`ScanResult.cards[]` gains `productId` when the card matches one of the listed
products, and `productGuess` as free text when it does not, taken from what is
printed on the card. A card that says *2026 Topps Road to Opening Day* yields
a guess of exactly that and no id.

**4. The commit resolves per card, not per batch.**

`scan:commit` already queries the checklist fresh rather than trusting the
brief, which is Ruling 10 from plan 3 and is what makes this cheap. It now
does that **per card** using that card's product, and gates against the right
checklist.

**5. Two new routing reasons, because the owner needs different words.**

| reason | when | what he sees |
|---|---|---|
| `unknown-product` | the agent named a set he does not have | "This looks like 2026 Topps Road to Opening Day, which you have not added yet." with a link to add it |
| `product-mismatch` | the agent's product disagrees with the batch hint | both named, so he can see which is wrong |

Neither commits a card. Both are reviewable rather than fatal, so a card from
an unknown set is **parked, not lost** — which is exactly what he hit tonight
with a Road to Opening Day card in a Bowman Chrome batch.

## What this buys, beyond not typing

- **A mixed batch becomes normal.** He photographs a stack and the app sorts
  it out.
- **An unknown set announces itself** instead of failing as a card number that
  does not exist in a checklist it was never in.
- **The add-product screen gains its real entry point.** "You have not added
  this set" with a link is how a product gets added in practice, rather than
  him remembering to do it first.

## What this does not do

It does not identify a product from the photograph alone as a feature of the
system. **The agent reads the card, and the card says the set.** There is no
model call in the application, and nothing here adds one: the reading happens
in the same session-drained job that already reads the player and the number.

It does not loosen the hard gate, remove the checklist requirement, or let an
unverified card into the catalogue.

## Acceptance

The case he actually hit, end to end: three photographs, two of a Bowman
Chrome card and one of a Road to Opening Day card, in one batch, with no
product chosen. Two cards commit against the Bowman Chrome checklist. The
third lands in review saying which set it looks like and offering to add it.
Nothing is lost and he typed nothing.
