/**
 * Reprice the last 2025-26 Topps Chrome Update Basketball Mega Box.
 *
 *   npx tsx scripts/reprice-nba-mega.ts            # dry run
 *   npx tsx scripts/reprice-nba-mega.ts --write
 *
 * Michael, 2026-08-11: "Move my nba mega to 135" then "Or 134.99".
 *
 * Listing 168598630696, SKU CHROMEUPD-NBA-MEGA-R3, was $139.99 x qty 1.
 * Open lot is #542, Target 2026-08-08, $93.96 (the last of 7 megas).
 *
 * Buyer pays calculated shipping, so it is a wash against the label. The eBay
 * fee is still 13.25% of the FULL order total including shipping and the
 * buyer's tax, plus $0.40.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const SKU = 'CHROMEUPD-NBA-MEGA-R3';
const ITEM_ID = '168598630696';
const NEW_PRICE = '134.99';
const OLD_PRICE = 139.99;
const COST = 93.96;
const SHIP_EST = 9.0; // 16 oz in an 8x8x4, mid-zone Ground Advantage

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
const net = (ask: number) => ask - ((ask + SHIP_EST) * 0.1325 + 0.4);

async function main() {
  console.log(`Chrome Update NBA Mega, ${ITEM_ID}`);
  console.log(`  $${OLD_PRICE.toFixed(2)} -> $${NEW_PRICE}`);
  console.log(`  cost $${COST.toFixed(2)} (lot #542, Target 2026-08-08)`);
  console.log(`  was: net $${net(OLD_PRICE).toFixed(2)}, profit $${(net(OLD_PRICE) - COST).toFixed(2)}`);
  console.log(`  now: net $${net(Number(NEW_PRICE)).toFixed(2)}, profit $${(net(Number(NEW_PRICE)) - COST).toFixed(2)} (${(((net(Number(NEW_PRICE)) - COST) / COST) * 100).toFixed(0)}% ROI)`);
  console.log(`  giving up $${(net(OLD_PRICE) - net(Number(NEW_PRICE))).toFixed(2)} of net to move it`);
  console.log(`  break-even ask $${((COST + 0.4 + SHIP_EST * 0.1325) / (1 - 0.1325)).toFixed(2)}`);

  if (!WRITE) { console.log('\ndry run'); return; }
  const tok = await userToken();

  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(SKU)}`);
  const offer = offers.offers?.[0];
  if (!offer) throw new Error(`no offer found for SKU ${SKU}`);
  if (String(offer.listing?.listingId ?? '') !== ITEM_ID) {
    throw new Error(`offer ${offer.offerId} points at listing ${offer.listing?.listingId}, expected ${ITEM_ID}`);
  }

  // Price-only change. Send the offer back with everything it already had so
  // nothing else silently moves.
  const body = {
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
  };
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, body);
  console.log(`offer ${offer.offerId} updated`);

  // The Inventory API reports success it did not achieve, so confirm with
  // Trading GetItem rather than trusting the PUT.
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  const live = x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1];
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${live}, qty ${x.match(/<Quantity>([^<]*)</)?.[1]}, shipping ${x.match(/<ShippingType>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  if (live !== NEW_PRICE) { console.error(`PRICE DID NOT TAKE: live is $${live}, expected $${NEW_PRICE}`); process.exit(1); }
  console.log(`  confirmed live at $${NEW_PRICE}  https://www.ebay.com/itm/${ITEM_ID}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
