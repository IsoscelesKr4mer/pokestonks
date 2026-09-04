/**
 * Destined Rivals Checklane blister LOT OF 7: 4x Eevee promo, 3x Zarude promo.
 *
 *   npx tsx scripts/list-dr-blister-lot7.ts            # dry run
 *   npx tsx scripts/list-dr-blister-lot7.ts --stage    # write item + offer, not live
 *   npx tsx scripts/list-dr-blister-lot7.ts --publish
 *
 * Michael, 2026-09-03: "end my listings for the destined blister packs and make
 * one with all 7 for 84 so I can send it to this bloke." The bloke is eBay buyer
 * zappescollection, who opened at $24 for a twofer ($12/blister) and agreed to
 * $84 for all 7 at the same per-blister number. The old qty-3 twofer listing
 * #168609434868 was ended first so the 7 blisters are not committed twice.
 *
 * INVENTORY, queried not assumed: 4x ci17246 Eevee (pu554 x1, pu557 x3) and
 * 3x ci17247 Zarude (pu553 x1, pu558 x2), all held, none sold. Exactly 7.
 *
 * COST $7.17/blister = $50.19 for the lot.
 *
 * PRICE $84.00 is the negotiated number, and it holds up against SOLD data even
 * though it is under the vault's TCGCSV market. Vault sum-of-parts is $119.62
 * (4 x $19.63 Eevee + 3 x $13.70 Zarude), but blisters do not transact there:
 * his own sold search shows twofers at $24.99 and $30.00 ($12.50-$15/blister)
 * and a 4-pack at $49.95 ($12.49/blister). $84/7 = $12.00, the bottom of that
 * band. TCGCSV market on a checklane blister runs above realised prices.
 *
 * WEIGHT is measured, not inferred: Michael weighed all 7 at 10.6 oz
 * (2026-09-03), plus the 8x8x4 shipper with paper at 4.2 oz = 14.8 oz, declared
 * 15 oz. Deliberately kept under 16 oz so Ground Advantage does not price it as
 * a full pound, which the buyer would pay.
 *
 * UPC 820650853319, read off the backs. Both promo variants share the barcode,
 * it is an assorted SKU where only the promo differs.
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

const SKU = 'DR-BLISTER-LOT7';
const PRICE = '84.00';
const QTY = 1;
const COST = 50.19; // 7 x $7.17
const UPC = '820650853319';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = 'Pokemon TCG Destined Rivals Checklane Blister Lot of 7 Eevee Zarude Sealed';

const DESCRIPTION = [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  '<p>Seven sealed Pokemon TCG Scarlet &amp; Violet Destined Rivals single-pack checklane blisters: <strong>4 with the Eevee promo</strong> and <strong>3 with the Zarude promo</strong>.</p>',
  '<p><strong>Each blister contains:</strong></p>',
  '<ul>',
  '<li>1 Scarlet &amp; Violet Destined Rivals booster pack</li>',
  '<li>1 promo card (Eevee or Zarude)</li>',
  '<li>1 Pokemon coin</li>',
  '<li>1 code card for Pokemon TCG Live</li>',
  '</ul>',
  '<p>That is 7 booster packs, 7 foil promos and 7 coins across the lot.</p>',
  '<p>All seven blisters brand new and factory sealed on the card, never opened. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

// Lead with the shot of all 7 so the count is the first thing a buyer sees;
// second image is a back-panel detail of the same product.
const IMAGES = [
  BASE + 'DestinedRivals_Blister_lot7_01_spread.JPEG',
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
    // packageType deliberately omitted, it has broken publishes before.
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 15, unit: 'OUNCE' },
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
      'Number of Packs': ['7'],
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
  console.log(`  cost $${COST.toFixed(2)} the lot ($7.17 x 7) | net ~$${net.toFixed(2)} | profit ~$${(net - COST).toFixed(2)} (${(((net - COST) / COST) * 100).toFixed(0)}% ROI)`);
  console.log(`  $${(price / 7).toFixed(2)}/blister. Sold comps: twofers $24.99-$30.00 ($12.50-$15 each), 4-pack $49.95 ($12.49 each)`);
  console.log(`  vault sum-of-parts $119.62 (4 x $19.63 + 3 x $13.70), but TCGCSV blister market sits above realised prices`);
  console.log(`  break-even ask $${((COST + 0.4 + ship * 0.1325) / (1 - 0.1325)).toFixed(2)}`);
  console.log(`  package 8x8x4, 15 oz (7 blisters weighed 10.6 oz + 4.2 oz shipper), under the 1 lb break`);

  const pf = await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(price * 100),
    costCentsPerUnit: Math.round(COST * 100), unitsPerListing: 1,
    upc: UPC, imageUrls: IMAGES,
  });
  for (const w of pf.warnings ?? []) console.log(`  preflight warning: ${w}`);
  for (const e of pf.errors ?? []) console.log(`  preflight ERROR: ${e}`);
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
