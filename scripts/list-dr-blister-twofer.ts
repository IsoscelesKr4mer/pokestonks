/**
 * Destined Rivals single-pack blister TWOFER: one Eevee promo, one Zarude promo.
 *
 *   npx tsx scripts/list-dr-blister-twofer.ts            # dry run
 *   npx tsx scripts/list-dr-blister-twofer.ts --stage
 *   npx tsx scripts/list-dr-blister-twofer.ts --publish
 *
 * Michael, 2026-08-12: "List the twofer for $29.99 - sorry looks like it was
 * one eevee and one zarude." Lot #553 was corrected from 2x Zarude to 1x
 * Zarude (ci17247) + new lot #554 for 1x Eevee (ci17246).
 *
 * COST $7.17/blister, $14.34 the pair. $6.49 shelf at Fred Meyer plus an
 * INFERRED 10.5% tax; store was not specified and Lynnwood runs 10.7%.
 *
 * PRICE $29.99, Michael's number. Sum of parts at vault market is $31.20
 * (Eevee $17.81 + Zarude $13.39), so this is $1.21 under, well inside the
 * round-to-a-clean-number noise and NOT a real discount.
 *
 * These were a genuinely good buy: a loose Destined Rivals booster is $9.85 at
 * market and he paid $7.17 for one plus a promo, a coin and a TCG Live code.
 *
 * UPC 820650853319, read off both backs. NOTE both promo variants carry the
 * SAME barcode, it is an assorted SKU where only the promo differs. Check
 * digit validates.
 *
 * Contents quoted verbatim from the back panel, nothing inferred:
 *   "1 Scarlet & Violet-Destined Rivals booster pack, 1 promo card,
 *    1 Pokemon coin, and a code card for Pokemon TCG Live"
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight } from './lib/preflight';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'DR-BLISTER-TWOFER';
const PRICE = '29.99';
const QTY = 1;
const COST = 14.34;
const UPC = '820650853319';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = 'Pokemon Destined Rivals Blister Lot of 2 Eevee Zarude Promo Coin Sealed';

const DESCRIPTION = [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  '<p>Two sealed Pokemon TCG Scarlet &amp; Violet Destined Rivals single-pack blisters, one with the <strong>Eevee</strong> promo and one with the <strong>Zarude</strong> promo.</p>',
  '<p><strong>Each blister contains:</strong></p>',
  '<ul>',
  '<li>1 Scarlet &amp; Violet Destined Rivals booster pack</li>',
  '<li>1 promo card (Eevee on one, Zarude on the other)</li>',
  '<li>1 Pokemon coin</li>',
  '<li>1 code card for Pokemon TCG Live</li>',
  '</ul>',
  '<p>Both blisters brand new and factory sealed on the card, never opened. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const IMAGES = [
  BASE + 'DestinedRivals_Blister_twofer_01_front.JPEG',
  BASE + 'DestinedRivals_Blister_twofer_02_back.JPEG',
];

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

const inventoryItem: any = {
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    packageType: 'PACKAGE_THICK_ENVELOPE',
    dimensions: { length: 10, width: 7, height: 2, unit: 'INCH' },
    weight: { value: 10, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Pokemon',
    mpn: 'Does Not Apply',
    upc: [UPC],
    aspects: {
      Game: ['Pokémon TCG'],                                    // required in 183456
      Set: ['Scarlet & Violet: Destined Rivals'],                // required in 183456
      Configuration: ['Pack'],                                   // SELECTION_ONLY, must be exactly "Pack"
      Language: ['English'],
      Features: ['Sealed'],
      'Number of Packs': ['2'],
      Manufacturer: ['The Pokemon Company International'],
    },
    imageUrls: IMAGES,
  },
};

async function main() {
  const price = Number(PRICE);
  const ship = 7.0;
  const net = price - ((price + ship) * 0.1325 + 0.4);
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} + calculated shipping | qty ${QTY}`);
  console.log(`  cost $${COST.toFixed(2)} the pair | net ~$${net.toFixed(2)} | profit ~$${(net - COST).toFixed(2)} (${(((net - COST) / COST) * 100).toFixed(0)}% ROI)`);
  console.log(`  sum of parts at vault market $31.20 (Eevee $17.81 + Zarude $13.39), so $29.99 is $1.21 under`);
  console.log(`  break-even ask $${((COST + 0.4 + ship * 0.1325) / (1 - 0.1325)).toFixed(2)}`);

  const pf = await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(price * 100),
    costCentsPerUnit: Math.round(COST * 100), unitsPerListing: 1,
    upc: UPC, imageUrls: IMAGES,
  });
  for (const w of pf.warnings ?? []) console.log(`  warning: ${w}`);
  for (const e of pf.errors ?? []) console.log(`  ERROR: ${e}`);
  if ((pf.errors ?? []).length) { console.error('preflight failed, not publishing'); process.exit(1); }
  console.log('  preflight ok');

  if (!STAGE && !PUBLISH) { console.log('\ndry run'); return; }
  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  console.log('inventory item written');

  const offerBody = {
    sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: QTY,
    categoryId: '183456', merchantLocationKey: 'edmonds-wa',
    listingDescription: DESCRIPTION, listingDuration: 'GTC',
    listingPolicies: {
      paymentPolicyId: '269110704012',
      returnPolicyId: '269110705012',
      fulfillmentPolicyId: '269110723012', // Ground Advantage Calculated, buyer pays
      eBayPlusIfEligible: false,
    },
    pricingSummary: { price: { value: PRICE, currency: 'USD' } },
    tax: { applyTax: false },
  };
  let offerId: string;
  try {
    offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0].offerId;
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerBody);
    console.log('offer updated', offerId);
  } catch {
    offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerBody)).offerId;
    console.log('offer created', offerId);
  }
  if (!PUBLISH) { console.log('STAGED, not live.'); return; }

  let itemId = '';
  try {
    itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`publish errored, checking whether it applied: ${String(e).slice(0, 160)}`);
    itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0]?.listing?.listingId ?? '');
    if (!itemId) { console.error('publish genuinely failed'); process.exit(1); }
  }
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${x.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  console.log(`  shipping ${x.match(/<ShippingType>([^<]*)</)?.[1]} | UPC ${x.match(/<UPC>([^<]*)</)?.[1] ?? 'MISSING'}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
