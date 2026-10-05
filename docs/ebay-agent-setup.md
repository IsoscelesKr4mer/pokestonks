# Setting up an eBay listing agent

Companion doc: `card-intake-flow.md` covers photographing, identifying and
pricing the cards before any of this runs.

Everything below is from running this for real on a live seller account. The
order matters: step 1 takes a day of waiting, and steps 3 and 4 cannot be done
from code no matter how much you want them to be.

Nothing here contains anyone else's credentials. Every ID you need is one you
generate on your own account.

---

## 1. Apply for the eBay developer program first

https://developer.ebay.com/

Do this before anything else. Approval is not instant and has taken about a day.
Everything else is blocked until you have production keys.

You want a **production** keyset, not sandbox. Sandbox does not behave like
production and you will debug ghosts.

From the keyset you need:

- **App ID (Client ID)**
- **Cert ID (Client Secret)**

## 2. Get a user token, not just an app token

Two different tokens, and mixing them up is the first thing that goes wrong.

**Application token** (`client_credentials`) is fine for read-only public data,
like the Browse API for comps. It cannot touch your listings.

**User token** (`authorization_code` then `refresh_token`) is what you need to
create and publish listings. Get it once through the OAuth consent screen, then
store the **refresh token**, which is long-lived. Your code exchanges it for a
short-lived access token on every run:

```
POST https://api.ebay.com/identity/v1/oauth2/token
Authorization: Basic base64(clientId:clientSecret)
grant_type=refresh_token&refresh_token=<yours>&scope=https://api.ebay.com/oauth/api_scope/sell.inventory
```

Store the client id, secret and refresh token somewhere your agent can read and
git cannot. Environment file or the MCP server env block, never in a script.

## 3. Create your business policies in the eBay web UI

**These cannot be created through the API.** `create_fulfillment_policy` fails
validation for the two shipping options you actually want. Make them by hand:

Seller Hub → Business Policies → Create policy

- a **payment** policy
- a **return** policy
- a **shipping** policy using **eBay Standard Envelope** (cheap tracked mail for
  cards under $20)
- a second **shipping** policy using **Ground Advantage** (for anything over the
  eSE value limit)

Then read their IDs back with `GET /sell/account/v1/fulfillment_policy` etc. and
hard-code those IDs in your agent. They never change.

## 4. Create an inventory location

```
PUT /sell/inventory/v1/location/{merchantLocationKey}
```

Pick a short key like `home-wa`. Every offer references it. One-time setup.

---

## The listing flow

Two different APIs, and you need both. Pick per job:

**Inventory API** for normal single listings.

```
PUT  /sell/inventory/v1/inventory_item/{sku}      the card: title, photos, aspects
POST /sell/inventory/v1/offer                     the listing: price, policies, category
POST /sell/inventory/v1/offer/{offerId}/publish   goes live
```

An offer that exists but is unpublished is a genuine draft. Nothing is visible
to buyers until you publish, which makes it safe to build everything up front
and have a human approve before the last call.

**Trading API** (the old XML one) when you need per-variation pictures. If you
want a "you pick your card" listing where selecting a different card shows a
different photo, the Inventory API simply has no field for it and every option
will show the same picture. Use `AddFixedPriceItem` with
`Variations.Pictures.VariationSpecificPictureSet`.

**Photos: upload to eBay, not to your own storage.** `UploadSiteHostedPictures`
returns a permanent eBay-hosted URL. If you host listing photos yourself and
that host goes down or runs out of quota, every listing you own breaks at once.
Ask me how I know.

---

## Gotchas that cost real time or money

**Verify publishes with the Trading API.** The Inventory API will report success
it did not achieve, and reports sold-out listings as revivable. After
publishing, confirm with `GetItem` and check `ListingStatus`. A 500 from publish
often means it worked anyway, so check before retrying.

**`packageWeightAndSize.packageType` breaks publish.** Omit the field entirely
or you get "Invalid \<ShippingPackage\>".

**Send `Accept-Language: en-US` and `Content-Language: en-US` on every REST
call, and `locale: "en_US"` on the inventory item.** Missing any of them is a
400 that does not explain itself.

**Titles are 80 characters, hard.** Count them in code. Decide in advance which
words get dropped when you run over, because the thing that gets cut is always
the thing you needed. Lead with what people search, not with what describes the
item best.

**Quantity on a variation revise means AVAILABLE, not total.** Resending
variation nodes on a revise refilled seven sold-out cards and put them back on
sale. If you are only changing pictures, send only the pictures.

**One value per aspect for some aspects.** `Set` takes exactly one. A two-card
lot spanning two products will be rejected if you list both.

**Raw ungraded card condition recipe:**
```
condition: "USED_VERY_GOOD"
conditionDescriptors: [{ name: "40001", values: ["400010"] }]
categoryId: "261328"        (Baseball singles)
```

**Weight drives eBay Standard Envelope pricing, not item value.** 1 oz, 2 oz and
3 oz are different price tiers. A card in a penny sleeve, toploader and rigid
mailer weighs about 1.2 oz, which is the 2 oz tier. Declaring 3 oz out of
caution costs you roughly 40 cents on every sale. Declaring 1 oz to save money
is under-declaring and gets eSE revoked.

**Fees are 13.25% of the entire order, including shipping and tax, plus $0.40.**
Not 13.25% of the item price. Budget net as `ask * 0.847`. The flat $0.40 is why
cheap singles want to be one multi-card listing rather than twenty listings.

**Ending and recreating a listing throws away its search standing.** eBay's Best
Match rewards views and watchers. If you need to change a price, update the
offer in place. Only end and recreate when you genuinely must, like reordering
dropdown variations.

---

## Agent rules worth copying

The technical setup is the easy half. These are the rules that make an agent
safe to leave running:

1. **Never publish without an explicit human go-ahead.** Build the draft, post a
   summary, wait for the word. Everything else can be automatic because
   everything else is reversible.
2. **Log purchases automatically**, ask one short question when the product,
   quantity, cost or source is missing. Never invent a cost.
3. **Write back to your own database when something sells**, if your listings do
   not sync automatically. A card marked available in one place and sold in
   another is how you oversell.
4. **Audit after any bulk change.** Pull your active listings and check for
   duplicate titles and for listings nothing in your database points at. Do this
   even when the API said everything succeeded.
5. **Price from live comps every time, never from memory.** And report how many
   live asks a price is based on. A median off one listing is one person's
   opinion, not a market.

---

## Order to do it in

1. Apply for the developer program, then wait
2. Production keyset, then the OAuth consent flow, then store the refresh token
3. Business policies by hand in Seller Hub, then read back the IDs
4. Inventory location
5. One listing end to end by hand through the API before automating anything
6. Then automate
