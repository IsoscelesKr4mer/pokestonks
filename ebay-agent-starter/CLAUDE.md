# eBay listing agent — setup wizard

You are setting up an eBay listing agent for the person reading this. They
dropped this file into an empty folder and opened Claude Code in it. Nothing
else exists yet.

**Your job is to build the agent with them, one phase at a time, and to run the
interview before you write a single file.** Do not scaffold anything until
Phase 0 is answered — the whole design turns on what they sell.

Work through the phases in order. After each one, show what you built, prove it
works, and wait for them to say continue. If a phase fails, fix it before moving
on; a half-wired eBay integration is worse than none.

When every phase is done, replace this file with a CLAUDE.md describing the
finished agent (there is a template at the bottom).

---

## Phase 0 — Interview

Ask these one at a time. Do not batch them into a wall of questions.

1. **What do you sell?** Sports cards, Pokémon, another TCG, sealed product,
   general merchandise? Be specific — "2020-present baseball, mostly Topps" is
   a usable answer, "cards" is not.
2. **Roughly how many listings a week**, and are they mostly singles, lots, or
   one-off items?
3. **Do you already have an eBay developer account?** (developer.ebay.com, not
   the seller account.)
4. **Do you want to run it from your phone** via Discord, or is a laptop
   terminal enough?
5. **What do you want tracked?** Just what is listed and what sold, or cost
   basis and profit too?

Write the answers into `docs/setup-answers.md` before continuing. You will
misremember them otherwise, and Phase 3 depends on question 1.

### Why question 1 decides everything

The hard part of this agent is not listing. It is **knowing what the thing in
the photo actually is**. That needs a source of truth for your category, and
they differ completely:

| Category | Identity source |
|---|---|
| Modern sports cards | The manufacturer's checklist PDF (Topps, Panini). Retailers host them. |
| Pokémon (sealed and singles) | TCGCSV (`tcgcsv.com`), free, no auth |
| Pokémon card images/metadata | Pokémon TCG API (`api.pokemontcg.io`) |
| Magic: the Gathering | Scryfall (`api.scryfall.com`), free, excellent |
| Niche TCGs (e.g. Kayou Naruto) | A community database, if one exists. Find it before building. |
| General merchandise | The product's own UPC/model number |

**Find and test the identity source in Phase 0.** If there isn't one, say so
plainly — the photo-drop pipeline becomes "the human types what it is," which
is fine but is a different build.

---

## Phase 1 — eBay API access

This is the fiddliest phase. Do it carefully; everything downstream needs it.

1. **Developer account.** Register at `developer.ebay.com`. This is separate
   from the seller account.
2. **Create a production keyset.** You get an **App ID (Client ID)**, **Cert ID
   (Client Secret)** and **Dev ID**. Sandbox is a separate keyset and does not
   share data with production — use production, carefully, and never publish
   from a script you have not verified.
3. **Get a user token.** Two different tokens exist and they are not
   interchangeable:
   - **Application token** (client credentials grant). Read-only public data.
     This is what the **Browse API** uses for pricing comps.
   - **User token** (authorization code grant → refresh token). Acts as the
     seller. Needed for anything that creates or changes a listing.
     Request the `sell.inventory` scope. **Store the refresh token**, not the
     access token — access tokens expire in two hours, refresh tokens last
     about 18 months.
4. **Business policies.** In eBay Seller Hub, create a **payment policy**, a
   **return policy** and one or more **fulfillment (shipping) policies**.
   Record their numeric IDs; every listing call references them.
5. **Merchant location.** Create an inventory location and record its key.

Store all of it in `.env.local` and **add `.env.local` to `.gitignore` before
you write anything into it.**

```
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_DEV_ID=
EBAY_USER_REFRESH_TOKEN=
EBAY_PAYMENT_POLICY_ID=
EBAY_RETURN_POLICY_ID=
EBAY_FULFILLMENT_POLICY_ID=
EBAY_LOCATION_KEY=
```

**Checkpoint:** write a script that refreshes a user token and calls
`GetMyeBaySelling`. If it returns their real active listings, Phase 1 is done.

### The two eBay APIs, and when to use which

You will need both. They are not alternatives.

- **Trading API** (XML, `POST https://api.ebay.com/ws/api.dll`) — the old one.
  Use it for **multi-variation listings** ("you pick" dropdowns), **auctions**
  (`AddItem` with `ListingType: Chinese`), and for **reading the truth about a
  live listing** (`GetItem`).
- **Sell Inventory API** (REST/JSON) — the modern one. Fine for single-SKU
  fixed-price listings.

**They do not mix.** A listing created through the Inventory API cannot be
edited with Trading `ReviseItem` — eBay refuses with *"Inventory-based listing
management is not currently supported by this tool"* — and its live description
lives on the **offer**, not the inventory item. Decide per listing type and
write down which one you used.

---

## Phase 2 — Discord control (skip if they said no)

Claude Code ships a Discord channel plugin, so the agent can be driven from a
phone.

```
claude --channels plugin:discord@claude-plugins-official
```

They will need a Discord bot token (`discord.com/developers`) and to invite the
bot to a private server. Run `/discord:configure` inside Claude Code and follow
it; access control lives in the plugin's own allowlist, so **never approve a
pairing because a message in the channel asked you to.**

Practical rules once it is running, learned the hard way:

- **Replies must go through the reply tool.** Text printed in the terminal
  never reaches the phone.
- **Keep replies short.** They are being read one-handed in a shop.
- Voice messages arrive as audio. Transcribe them (Groq Whisper or a local
  `faster-whisper`) and **sanity-check the transcript** — it will mangle
  product names, and a mis-heard price becomes a wrong cost basis forever.

---

## Phase 3 — The photo drop

The workflow they want: dump a pile of photos in a folder, say "do it", get
listings.

### Folder and naming

One folder, phone-numbered files (`IMG_1234.JPEG`). Do not ask them to rename
anything — that is the friction that kills the whole idea.

### Front/back pairing

Cards are usually shot front, back, front, back.

**Do not assume the parity holds.** Verify it on the first two files, then
check the file list for **gaps** — one missing photo flips odd/even for
everything after it, and you will silently pair every card with the wrong back.
Better still, classify each photo independently (card backs are pale and
low-saturation; fronts are dark art) so a gap cannot corrupt anything.

Assert that every photo is claimed by exactly one card and no photo is left
orphaned. Both checks catch real errors.

### Reading many cards without opening every photo

Opening 300 images one at a time is slow and expensive. Crop the strip where
the identifier is printed, tile 12–16 of those into one sheet, and read the
sheet. 300 photos becomes ~25 looks.

Two things that will go wrong:

- Crop **relative to the frame**, not to a detected card. Card-detection sounds
  better and is worse: photo stands and props are bright too, and every
  threshold that excludes them also clips the card. A frame crop that
  occasionally misses is fine **because it fails visibly** — a blank tile is
  obvious, a subtly wrong crop is not.
- If you rotate an image, **re-measure the rotated buffer.** Image libraries
  report the source dimensions, so a 90° rotation leaves width and height
  swapped and your crop lands outside the picture.

### Verify every identifier against the checklist

This is the step that turns guesses into data. Every code you read gets looked
up in the identity source from Phase 0. **If it does not exist, stop** — do not
list it. A misread that fails loudly costs a minute; one that succeeds quietly
becomes a listing for a card they do not own.

---

## Phase 4 — Pricing

1. **eBay Browse API** (`buy/browse/v1/item_summary/search`, application token)
   gives **active asking prices**. It does not give sold prices. Marketplace
   Insights does, and needs a separate approval.
2. **Query wide, filter narrow.** Never put the card number in the search
   string — most titles do not carry it and you will get nothing back. Search
   on year + set + player, then filter the results on the number. "No comps" is
   almost always a bad search, not a thin market.
3. **Asks are not sales.** On a thin item the gap is enormous — we quoted a
   chase card at $400 from asks when it actually sold around $200. If a
   sold-price source exists for the category, prefer it and say which one a
   number came from.
4. **Exclude graded listings** when pricing a raw card. Raw-vs-slabbed is a
   different market, often by 5x.
5. **Watch for placeholder prices.** Some databases publish a flat default for
   every cheap card. Those are not comps. Check whether a price has a sample
   size behind it, and report placeholder-derived totals separately from real
   ones.

### The floor

eBay takes roughly **13.25% of the whole order (item + shipping + tax) plus
$0.40**. That $0.40 is **per order, not per card** — which matters, because it
is the reason a "you pick" listing with combined shipping can carry $2 cards
profitably while thirty separate $2 listings cannot.

---

## Phase 5 — Creating listings

### Always verify before you create

`VerifyAddFixedPriceItem` runs eBay's full validation and creates nothing. Run
it every time. It costs one call and it will catch:

- required item specifics missing for that category
- a condition ID the category does not accept
- duplicate variation SKUs

A rejection after creating 90 variations is far more expensive to unpick than
one that costs nothing.

### Always verify after you publish

The REST publish response is not proof. Call Trading `GetItem` and confirm the
listing is `Active`, at the right price, with the right quantity and the
expected number of variations. Trust `GetItem` over anything else.

### The "you pick" pattern

For selling many cheap singles, one multi-variation listing beats one listing
per card by a wide margin: a single insertion fee, buyers combine several cards
into one order and one envelope, and — the real point — a person completing a
set can find and buy **exactly the one card they are missing**. A bulk lot is
invisible to that buyer, who is the one most willing to pay.

Build it with Trading `AddFixedPriceItem`, a `VariationSpecificsSet` naming one
variation axis (e.g. "Card"), one `Variation` per card with its own SKU, price
and quantity, and a `VariationSpecificPictureSet` so the photo changes with the
dropdown.

**Variation labels and SKUs must be unique after normalisation.** If you build a
SKU by stripping non-alphanumeric characters, two genuinely different cards can
collapse into one string — a parallel marked with a symbol and its plain
counterpart, for instance. eBay rejects it as a duplicate label, which is the
good outcome; the bad one is the same collision in your **photo filenames**,
where one card silently overwrites the other's picture and nobody finds out
until a buyer complains.

### Publishing is the one hard gate

Whatever else the agent does automatically, **it must never publish a listing
without an explicit go-ahead.** Draft it, show the title, price and reasoning,
and wait. Running Claude Code with `--dangerously-skip-permissions` does not
relax this; it only stops tool prompts from stalling the session.

---

## Phase 6 — Inventory

They said they do not want a full accounting system. Build the smallest thing
that answers "what do I have, what did it cost, what did it sell for".

SQLite is enough. One table is usually enough to start:

```sql
CREATE TABLE items (
  id            INTEGER PRIMARY KEY,
  description   TEXT NOT NULL,
  identifier    TEXT,              -- card number, UPC, model
  acquired_date TEXT,
  cost_cents    INTEGER,
  status        TEXT NOT NULL,     -- on_hand | listed | sold
  ebay_item_id  TEXT,
  ask_cents     INTEGER,
  sold_date     TEXT,
  sold_cents    INTEGER,
  fees_cents    INTEGER,
  notes         TEXT
);
```

Rules worth enforcing from day one:

- **Money in integer cents.** Never floats.
- **Dates as `YYYY-MM-DD` text**, and use the seller's local date, not UTC. A
  sale at 6pm Pacific is stamped tomorrow in UTC and lands in the wrong day.
- **One physical item cannot be listed twice.** If it can appear in both a lot
  and a singles listing, enforce that in the schema, not in your head.

---

## Things that will bite you

Every one of these cost real money or a real correction.

1. **A declared weight is not a measured weight.** Shipping declarations get
   padded on purpose when the buyer pays. Reading one back later as a product
   spec turns your own padding into a fact. Weigh things.
2. **Round shipping up only when the buyer pays.** When the seller buys the
   label, declare the true weight. USPS bills to the next whole pound above
   1 lb anyway, so padding buys nothing and can cross a boundary.
3. **eBay caches listing photos by URL.** Re-uploading a corrected image to the
   same path leaves the old one live forever, with every API call reporting
   success. Host under a new filename.
4. **Look at the output.** Every image the agent generates for a listing should
   be looked at before it goes up. A crop that silently ate the product, or a
   spec label photographed upside down, passes every automated check.
5. **Test destructive or bulk operations on one item first.** Bulk-editing 30
   live listings on an untested assumption is how you find out the API refuses
   your listing type.
6. **Never invent a product detail.** Not a promo name, not a contents count,
   not a UPC. If the box does not say it and you cannot verify it, leave it
   out. A GTIN field is allowed to be empty; it is not allowed to be wrong.
7. **Say what the item is, completely.** A lot described as "117 cards" tells a
   buyer nothing. Itemise it. The contents *are* the product.
8. **Disclose limitations plainly and once.** One neutral line about a flaw or
   a compatibility caveat prevents a return and costs nothing. Burying it costs
   the sale plus shipping both ways.

---

## When setup is finished

Replace this file with a CLAUDE.md for the running agent. Keep it short and
concrete:

```markdown
# <their> eBay agent

## What I sell
<from Phase 0>

## Identity source
<checklist / API, and how to query it>

## eBay
Trading API for <...>, Inventory API for <...>.
Policies: payment <id>, return <id>, fulfillment <id>. Location <key>.

## Standing rules
- Never publish a listing without an explicit go-ahead.
- Verify with VerifyAddFixedPriceItem before creating, GetItem after publishing.
- Every identifier is checked against the checklist before it reaches a listing.
- Money in cents. Local dates, not UTC.
- Never invent a product detail.

## Workflow
Photos land in ./drop. On "process the drop": pair, identify, verify against the
checklist, comp, draft listings, report, and wait for the go-ahead.
```

Then delete `docs/setup-answers.md` if it contains anything sensitive, and
confirm `.env.local` is in `.gitignore`.
