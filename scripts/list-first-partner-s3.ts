/**
 * Pokemon First Partner Illustration Collection (Series 3), qty 2.
 *
 *   npx tsx scripts/list-first-partner-s3.ts            # dry run
 *   npx tsx scripts/list-first-partner-s3.ts --stage    # create, NOT live
 *   npx tsx scripts/list-first-partner-s3.ts --publish
 *
 * PRICING, 2026-08-10, eBay Browse active scan (n=59 single-box listings,
 * delivered price = item + shipping):
 *   low $27.99 | median $39.98 | dense cluster $35.00-$40.00
 *   ~15 listings land under $37 delivered, most of the inventory sits at $39.99
 * TCGCSV market the same day: $37.19.
 *
 * SHIPPING: Ground Advantage Calculated, buyer pays. This first went live at
 * $36.99 with free shipping and Michael killed it immediately: "You offered
 * free shipping? wtf don't do that ever." Standing rule, no exceptions, on any
 * listing. The free-shipping policy created for it has been deleted.
 *
 * Repriced to $33.99 so the DELIVERED price still lands at the market median
 * (~$40 with ~$6.50 of calculated postage) instead of the ~$43.50 that $36.99
 * plus shipping would have shown.
 *
 * This is also strictly better for him. Buyer-paid shipping is a wash against
 * the label, so he stops eating postage: $8.34/box here versus $5.31/box on
 * the free-shipping version, despite the lower sticker. He was right on both
 * counts.
 *
 * UPC 196214157217, read off the barcode on the back of the box.
 * Contents below are taken from the back panel only, nothing inferred.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight } from './lib/preflight';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'FPIC-S3';
const PRICE = '33.99';
const QTY = 2;
const COST_CENTS = 1988;
const UPC = '196214157217';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

// 79 chars.
const TITLE = 'Pokemon TCG First Partner Illustration Collection Series 3 Sealed 3 Promo Cards';

const DESCRIPTION = [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  '<p>Pokemon TCG First Partner Illustration Collection, Series 3. Celebrating 30 years of first partner Pokemon.</p>',
  '<p><strong>In this box:</strong></p>',
  '<ul>',
  '<li>1 booster pack containing 3 of 9 illustration rare-style promo cards</li>',
  '<li>2 Pokemon TCG Mega Evolution Series booster packs</li>',
  '<li>1 sticker sheet</li>',
  '</ul>',
  '<p>The promo cards feature beloved first partner Pokemon from the Hoenn, Kalos and Paldea regions.</p>',
  '<p>Brand new, unopened, factory sealed. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

// Marble reshoot, swapped in ~1h after go-live, replacing the car-seat
// originals. New filenames deliberately: eBay copies images to its own CDN at
// publish time and will not necessarily re-fetch an unchanged URL.
const IMAGES = [
  BASE + 'FirstPartner_IllustrationCollection_S3_reshoot_01_front.JPEG',
  BASE + 'FirstPartner_IllustrationCollection_S3_reshoot_02_back.JPEG',
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
    // eBay rejects MAILING_BOX for this flow; every working sealed listing on
    // this account uses PACKAGE_THICK_ENVELOPE. Dims are Michael's standard
    // 8x8x4 shipper. Calculated shipping quotes off these, so they need to be
    // honest. Confirm the weight when packing.
    packageType: 'PACKAGE_THICK_ENVELOPE',
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
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
      Game: ['Pokémon TCG'],                                  // required
      Set: ['First Partner Illustration Collection'],          // required
      Manufacturer: ['The Pokemon Company International'],
      Configuration: ['Collection Box'],
      Features: ['Sealed'],
      Language: ['English'],
      'Year Manufactured': ['2026'],
      'Age Level': ['6+'],
      'Number of Boxes': ['1'],
    },
    imageUrls: IMAGES,
  },
};

async function main() {
  const price = Number(PRICE);
  const postage = 6.5; // Ground Advantage, ~10 oz, mid-zone. Buyer pays it.
  // 13.25% of the FULL order total (item + shipping + tax) + $0.40. Buyer-paid
  // shipping is a wash against the label, so it does not reduce net, but eBay
  // still charges its cut on it.
  const fee = (price + postage) * 0.1325 + 0.4;
  const net = price - fee;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} + calculated shipping | qty ${QTY}`);
  console.log(`  cost $${(COST_CENTS / 100).toFixed(2)}/ea | fee ~$${fee.toFixed(2)} | shipping ~$${postage.toFixed(2)} paid by buyer, a wash`);
  console.log(`  net ~$${net.toFixed(2)}/ea | profit ~$${(net - COST_CENTS / 100).toFixed(2)}/ea (${(((net - COST_CENTS / 100) / (COST_CENTS / 100)) * 100).toFixed(0)}% ROI)`);
  console.log(`  both units ~$${((net - COST_CENTS / 100) * QTY).toFixed(2)}`);
  console.log(`  delivered to buyer ~$${(price + postage).toFixed(2)} vs market median $39.98`);
  console.log(`  market: TCGCSV $37.19, active median $39.98 delivered, cluster $35-$40`);

  const pf = await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(price * 100),
    costCentsPerUnit: COST_CENTS, unitsPerListing: 1,
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
    categoryId: '261044', merchantLocationKey: 'edmonds-wa',
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
  if (!PUBLISH) { console.log('STAGED, not live. Re-run with --publish to go live.'); return; }

  let itemId = '';
  try {
    itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`publish errored, checking whether it applied: ${String(e).slice(0, 160)}`);
    itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0]?.listing?.listingId ?? '');
    if (!itemId) { console.error('publish genuinely failed'); process.exit(1); }
  }
  // The Inventory API lies about listing state. Trading GetItem is the only
  // trustworthy confirmation.
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${x.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  console.log(`  shipping: ${x.match(/<ShippingServiceCost[^>]*>([^<]*)</)?.[1] ?? 'n/a'} | UPC ${x.match(/<UPC>([^<]*)</)?.[1] ?? 'MISSING'}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
