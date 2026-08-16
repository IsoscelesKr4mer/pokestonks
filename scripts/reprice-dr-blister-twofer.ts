/**
 * DR blister twofer: qty 1 -> 3, price $29.99 -> $27.99.
 *
 *   npx tsx scripts/reprice-dr-blister-twofer.ts          # dry run
 *   npx tsx scripts/reprice-dr-blister-twofer.ts --write
 *
 * Michael, 2026-08-13: "let's make quantity on my listing and drop the price
 * by a dollar or two. This will not get much after a day of being listed. I
 * think I was like one view."
 *
 * INVENTORY after today's 5-blister buy (lots #557 3x Eevee, #558 2x Zarude):
 *   4 Eevee + 3 Zarude held
 *   a twofer is 1 of each, so capacity is min(4,3) = 3 twofers
 *   that leaves 1 SPARE EEVEE uncommitted, flagged to Michael
 * He may buy 5 more on the way home, which would change this again.
 *
 * PRICING NOTE, and it argues against reading much into one view:
 * the only genuine direct comp on eBay is a single listing at $41.00
 * delivered ("Destined Rivals Single Pack Blisters x2, Eevee Zarude"), the
 * identical pairing. At $27.99 plus ~$7 calculated shipping he lands at ~$35
 * delivered, already ~$6 under the only listing selling the same thing.
 *
 * The 90-of-186 "cheaper than you" count from the scan is NOT comparable.
 * Pokemon "2 Pack Blister" is a different product (one blister holding two
 * boosters); his is two separate single-pack blisters. The search cannot
 * distinguish them, so most of those cheaper listings are a different SKU.
 *
 * The real headwind is that these are $6.49 on a Fred Meyer peg right now and
 * he just cleared a 5-per limit off it. Anyone near a store can beat any
 * price he sets, so the buyer is someone without local stock. That is a thin,
 * slow audience, not a pricing error.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const SKU = 'DR-BLISTER-TWOFER';
const ITEM_ID = '168609434868';
const NEW_PRICE = '27.99';
const OLD_PRICE = 29.99;
const NEW_QTY = 3;
const COST = 14.34;
const SHIP = 7.0;

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}
async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const net = (a: number) => a - ((a + SHIP) * 0.1325 + 0.4);

async function main() {
  console.log(`DR blister twofer ${ITEM_ID}`);
  console.log(`  $${OLD_PRICE.toFixed(2)} -> $${NEW_PRICE}, qty 1 -> ${NEW_QTY}`);
  console.log(`  cost $${COST.toFixed(2)}/twofer | net $${net(Number(NEW_PRICE)).toFixed(2)} | profit $${(net(Number(NEW_PRICE)) - COST).toFixed(2)}/twofer (${(((net(Number(NEW_PRICE)) - COST) / COST) * 100).toFixed(0)}% ROI)`);
  console.log(`  all 3 sold: $${((net(Number(NEW_PRICE)) - COST) * NEW_QTY).toFixed(2)}`);
  console.log(`  delivered ~$${(Number(NEW_PRICE) + SHIP).toFixed(2)} vs the only true direct comp at $41.00`);
  console.log(`  inventory: 4 Eevee + 3 Zarude = 3 twofers, 1 SPARE EEVEE left over`);

  if (!WRITE) { console.log('\ndry run'); return; }
  const tok = await userToken();

  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: NEW_QTY } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inv);

  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
  const offer = offers.offers?.[0];
  if (!offer) throw new Error(`no offer for ${SKU}`);
  if (String(offer.listing?.listingId ?? '') !== ITEM_ID) {
    throw new Error(`offer ${offer.offerId} points at ${offer.listing?.listingId}, expected ${ITEM_ID}`);
  }
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
    sku: SKU,
    marketplaceId: offer.marketplaceId,
    format: offer.format,
    availableQuantity: NEW_QTY,
    categoryId: offer.categoryId,
    merchantLocationKey: offer.merchantLocationKey,
    listingDescription: offer.listingDescription,
    listingDuration: offer.listingDuration,
    listingPolicies: offer.listingPolicies,
    pricingSummary: { price: { value: NEW_PRICE, currency: 'USD' } },
    tax: offer.tax,
  });
  console.log(`offer ${offer.offerId} updated`);

  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  const live = x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1];
  const qty = x.match(/<Quantity>([^<]*)</)?.[1];
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${live}, qty ${qty}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  if (live !== NEW_PRICE || qty !== String(NEW_QTY)) { console.error(`DID NOT TAKE: live $${live} qty ${qty}`); process.exit(1); }
  console.log(`  confirmed  https://www.ebay.com/itm/${ITEM_ID}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
