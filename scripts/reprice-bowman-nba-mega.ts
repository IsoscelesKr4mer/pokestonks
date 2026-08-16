/**
 * Reprice the 2025-26 Bowman Basketball Mega Boxes, $99.99 -> $89.99.
 *
 *   npx tsx scripts/reprice-bowman-nba-mega.ts          # dry run
 *   npx tsx scripts/reprice-bowman-nba-mega.ts --write
 *
 * Michael, 2026-08-11: "My Bowman boxes have zero views. I think you priced it
 * way too aggressively." He is right, and the mistake was mine.
 *
 * WHAT I GOT WRONG: I priced to the MEDIAN OF ACTIVE LISTINGS. Active listings
 * are by definition the inventory that has NOT sold, so on a commodity with
 * 140+ identical competitors the median ask measures what is failing to move,
 * not what buyers pay. I even wrote in list-bowman-nba-mega.ts that I was
 * "deliberately not chasing the crowded $85-$90 band" -- but the crowd is
 * exactly where the transactions are. eBay hard-blocks sold-comp scraping and
 * Marketplace Insights is not approved on this account, so I had no sold data
 * and should have said so and anchored low, rather than treating the ask
 * median as a market price.
 *
 * Diagnosed before repricing so this was not a guess:
 *   - HideFromSearch false, listing IS indexed and appears in buyer-side Browse
 *     search at rank 36 of 200. Visibility is fine, so price is the variable.
 *   - At $99.99 it sat 73rd of 140 by delivered price: 70 sellers cheaper.
 * $89.99 moves that to 33 cheaper (24%) and keeps $10.38/box.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const SKU = 'BOWMAN-NBA-2026-MEGA';
const ITEM_ID = '168604274457';
const NEW_PRICE = '89.99';
const OLD_PRICE = 99.99;
const COST = 66.29;
const SHIP = 7.5;

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const net = (ask: number) => ask - ((ask + SHIP) * 0.1325 + 0.4);

async function main() {
  console.log(`Bowman NBA Mega, ${ITEM_ID}, qty 2`);
  console.log(`  $${OLD_PRICE.toFixed(2)} -> $${NEW_PRICE}`);
  console.log(`  cost $${COST.toFixed(2)} | break-even ask $${((COST + 0.4 + SHIP * 0.1325) / (1 - 0.1325)).toFixed(2)}`);
  console.log(`  was: net $${net(OLD_PRICE).toFixed(2)}, profit $${(net(OLD_PRICE) - COST).toFixed(2)}/box, 70 of 140 sellers cheaper`);
  console.log(`  now: net $${net(Number(NEW_PRICE)).toFixed(2)}, profit $${(net(Number(NEW_PRICE)) - COST).toFixed(2)}/box, 33 of 140 cheaper`);
  console.log(`  giving up $${(net(OLD_PRICE) - net(Number(NEW_PRICE))).toFixed(2)}/box to get in front of 37 more competitors`);

  if (!WRITE) { console.log('\ndry run'); return; }
  const tok = await userToken();

  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(SKU)}`);
  const offer = offers.offers?.[0];
  if (!offer) throw new Error(`no offer for SKU ${SKU}`);
  if (String(offer.listing?.listingId ?? '') !== ITEM_ID) {
    throw new Error(`offer ${offer.offerId} points at ${offer.listing?.listingId}, expected ${ITEM_ID}`);
  }

  // Price-only change; everything else echoed back so nothing silently moves.
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
    sku: SKU,
    marketplaceId: offer.marketplaceId,
    format: offer.format,
    availableQuantity: offer.availableQuantity,
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
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${live}, qty ${x.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  if (live !== NEW_PRICE) { console.error(`PRICE DID NOT TAKE: live $${live}`); process.exit(1); }
  console.log(`  confirmed live at $${NEW_PRICE}  https://www.ebay.com/itm/${ITEM_ID}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
