/**
 * 2025-26 Bowman Basketball Mega Box, qty 2.
 *
 *   npx tsx scripts/list-bowman-nba-mega.ts            # dry run
 *   npx tsx scripts/list-bowman-nba-mega.ts --stage    # create, NOT live
 *   npx tsx scripts/list-bowman-nba-mega.ts --publish
 *
 * PRICING, 2026-08-10, eBay Browse active scan (scripts/comp-scan.ts, n=159,
 * delivered = item + shipping, singles/loose packs/multi-box lots excluded):
 *   floor $75-$79 | body $85-$120 | MEDIAN $99.97 | Q3 $119.99
 * Cost $66.29/box, break-even ask $78.25.
 *
 * $99.99 is the median, not an outlier ask. Deliberately not chasing the
 * crowded $85-$90 band: at $89.99 the profit is $10.18/box against a $78.25
 * break-even, too thin to be worth handling. If it sits a week, $89.99 is the
 * next step down.
 *
 * SHIPPING: Ground Advantage Calculated, buyer pays. NEVER free shipping,
 * standing rule (see memory feedback_never_offer_free_shipping).
 *
 * UPC 887521155583. NOT on the panel Michael photographed (that is the legal
 * panel with the QR code), so it was verified against two independent
 * retailers that agree exactly: DA Card World structured data gtin12
 * "887521155583" and Steel City Collectibles gtin13 "0887521155583". The
 * 887521 prefix matches his other Topps boxes (887521161485, 887521161430).
 *
 * CONTENTS: the box front only says "Look for Autograph* Cards", so the
 * pack/card counts come from Beckett's 2025-26 Bowman Mega checklist page,
 * which is mega-specific. Autographs are a "look for", NOT guaranteed, and the
 * box asterisk warns some may be redemptions. The copy says so.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight } from './lib/preflight';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'BOWMAN-NBA-2026-MEGA';
const PRICE = '99.99';
const QTY = 2;
const COST_CENTS = 6629;
const UPC = '887521155583';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

// 75 chars.
const TITLE = '2025-26 Bowman NBA Basketball Mega Box SEALED IN HAND 42 Cards Cooper Flagg';

const DESCRIPTION = [
  '<p><strong>SEALED and IN HAND. Ships within 1 business day.</strong></p>',
  '<p>2025-26 Bowman Basketball Mega Box, factory sealed. Topps brought Bowman back to the NBA, so this is the first Bowman basketball product with 1st Bowman prospects alongside the current rookie class.</p>',
  '<p><strong>Configuration:</strong> 6 packs per box, 7 cards per pack, 42 cards total.</p>',
  '<p><strong>Per box:</strong></p>',
  '<ul>',
  '<li>11 Mojo base parallels, the mega-exclusive chrome parallel</li>',
  '<li>1 insert</li>',
  '<li>1 Mega Rookies or Mega Prospect card</li>',
  '</ul>',
  '<p>The 200-card base set carries a Bowman Chrome variant plus Rookie Red RC and Etched in Glass variations, and the 100-card Prospect insert set features 1st Bowman cards.</p>',
  '<p><strong>Look for autograph cards.</strong> Autographs are a chase, not a guarantee, and Topps notes some autograph cards may be redemptions.</p>',
  '<p>Brand new, unopened, factory sealed. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

// Marble reshoot, swapped in ~35 min after go-live, replacing the dashboard
// originals. New filenames deliberately: eBay copies images to its own CDN at
// publish time and will not necessarily re-fetch an unchanged URL.
const IMAGES = [
  BASE + 'BowmanNBA_MegaBox_reshoot_01_front.JPEG',
  BASE + 'BowmanNBA_MegaBox_reshoot_02_back.JPEG',
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
    // MAILING_BOX is rejected for calculated shipping in this category; every
    // working sealed listing here uses PACKAGE_THICK_ENVELOPE. 8x8x4 shipper,
    // same as the Chrome Update mega which weighed 16 oz packed.
    packageType: 'PACKAGE_THICK_ENVELOPE',
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 16, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Topps',
    mpn: 'Does Not Apply',
    upc: [UPC],
    aspects: {
      Sport: ['Basketball'],
      League: ['National Basketball Association (NBA)'],
      Set: ['2025-26 Bowman Basketball'],
      Configuration: ['Mega Box'],
      Manufacturer: ['Topps'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
      'Number of Boxes': ['1'],
    },
    imageUrls: IMAGES,
  },
};

const SHIP_EST = 9.0;
const net = (ask: number) => ask - ((ask + SHIP_EST) * 0.1325 + 0.4);

async function main() {
  const price = Number(PRICE);
  const cost = COST_CENTS / 100;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} + calculated shipping | qty ${QTY}`);
  console.log(`  cost $${cost.toFixed(2)}/box | net ~$${net(price).toFixed(2)} | profit ~$${(net(price) - cost).toFixed(2)}/box (${(((net(price) - cost) / cost) * 100).toFixed(0)}% ROI)`);
  console.log(`  both boxes ~$${((net(price) - cost) * QTY).toFixed(2)} | break-even ask $${((cost + 0.4 + SHIP_EST * 0.1325) / (1 - 0.1325)).toFixed(2)}`);
  console.log(`  market: floor $75-79, body $85-120, median $99.97 delivered (n=159)`);

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
    categoryId: '261332', merchantLocationKey: 'edmonds-wa',
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
  // The Inventory API misreports listing state; Trading GetItem is the check.
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${x.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  console.log(`  shipping: ${x.match(/<ShippingType>([^<]*)</)?.[1]} (${x.match(/<ShippingProfileName>([^<]*)</)?.[1]}) | UPC ${x.match(/<UPC>([^<]*)</)?.[1] ?? 'MISSING'}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
