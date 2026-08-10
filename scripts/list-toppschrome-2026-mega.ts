/**
 * 2026 Topps Chrome Baseball Mega Box, single sealed box @ $129.99.
 * Mirrors the FINEST-2026-MEGA setup (category 261332, same policies,
 * 8x8x4 @ 1 lb Ground Advantage calculated).
 *
 *   npx tsx scripts/list-toppschrome-2026-mega.ts            # dry run, show payload
 *   npx tsx scripts/list-toppschrome-2026-mega.ts --stage    # create item + offer, NOT live
 *   npx tsx scripts/list-toppschrome-2026-mega.ts --publish  # publish the staged offer
 *
 * Baseball sealed stays off-book (no vault catalog item), same as the Bowman
 * and Finest boxes, so no ebay_listing_mappings row is written.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
import { quantityForPublish } from './lib/live-qty';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'CHROME-2026-MEGA';
// 129.99 -> 119.99 -> 109.99, all on 2026-08-05. The last cut is a deliberate
// sell-now price: every sold comp is a presale, Michael has these in hand, and
// he wants them gone before the preorder buyers take delivery.
// 129.99 -> 119.99 -> 109.99 -> 94.99. The last cut on 2026-08-07 is about
// demand, not positioning: daily sales collapsed from 12/day pre-release to
// 0-2/day once the product filled shelves, and a buyer can walk into Dick's
// and pay $77.38 all-in. A 42% premium over the shelf does not clear.
// $94.99 still nets +$15.44/box against the $66.33 lots.
// 94.99 -> 89.99 on 2026-08-07 evening, Michael's call. Shelves restocked and
// daily sales had collapsed to 0-2, so this is about clearing rather than
// positioning. Break-even is $78.31 on the $66.33 lots.
const PRICE = '89.99';
const QTY = 8; // 8 listed, 2 held back to rip (funded by the 8)
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

// "Factory" dropped to fit IN HAND inside the 80-char limit.
const TITLE = '2026 Topps Chrome Baseball Mega Box IN HAND Sealed MLB 42 Cards X-Fractor';

const DESCRIPTION = [
  '<p><strong>IN HAND and ships within 1 business day. This is not a presale.</strong></p>',
  '<p>Factory-sealed 2026 Topps Chrome Baseball Mega Box.</p>',
  '<p>6 packs per box, 7 cards per pack (42 cards total). Look for the Mega Box exclusive X-Fractor parallels: Aqua /199, Blue /150, Green /99, Purple /75, Gold /50, Orange /25 and Black /10. 300-card base set, with Helix, Ultraviolet and World Series at Night returning alongside new Diamond Moments and Static Noise inserts.</p>',
  '<p>Brand new, unopened. Smoke-free home. Ships within 1 business day.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 700)}`);
  return text ? JSON.parse(text) : null;
}

const inventoryItem = {
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    // 12 oz, from Michael actually weighing a packed one at 11.8 oz on
    // 2026-08-07. Do not guess this: Ground Advantage has tiers under a
    // pound, so 12 oz is materially cheaper for the buyer than 16, and
    // far cheaper than the 2 lb bracket.
    weight: { value: 12, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Topps',
    mpn: 'Does Not Apply',
    upc: ['887521159635'],
    aspects: {
      Sport: ['Baseball'],
      League: ['Major League Baseball (MLB)'],
      Autographed: ['No'],
      Set: ['2026 Topps Chrome'],
      Configuration: ['Box'],
      'Number of Cards': ['42'],
      Manufacturer: ['Topps'],
      'Number of Boxes': ['1'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
    },
    // Reshoot on the marble background, replaces the release-day car-seat shots.
    imageUrls: [
      BASE + 'ToppsChrome2026_MegaBox_reshoot_01_front.JPEG',
      BASE + 'ToppsChrome2026_MegaBox_reshoot_02_back.JPEG',
    ],
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: QTY,
  categoryId: '261332',
  merchantLocationKey: 'edmonds-wa',
  listingDescription: DESCRIPTION,
  listingDuration: 'GTC',
  listingPolicies: {
    paymentPolicyId: '269110704012',
    returnPolicyId: '269110705012',
    fulfillmentPolicyId: '269110723012', // Ground Advantage Calculated, buyer pays
    eBayPlusIfEligible: false,
  },
  pricingSummary: { price: { value: PRICE, currency: 'USD' } },
  tax: { applyTax: false },
};

// eBay 404s this endpoint when the SKU has no offers yet, rather than
// returning an empty list, so a 404 means "none" and not an error.
async function existingOfferId(tok: string): Promise<string | null> {
  try {
    const res = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
    return res?.offers?.[0]?.offerId ?? null;
  } catch (e) {
    if (String(e).includes('-> 404')) return null;
    throw e;
  }
}

async function main() {
  const net = Number(PRICE) * 0.864 - 0.3;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} x ${QTY} | category ${offer.categoryId}`);
  console.log(`  net after 13.6% + $0.30 = $${net.toFixed(2)}`);

  assertPreflight(SKU, await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(Number(PRICE) * 100),
    costCentsPerUnit: 6633, unitsPerListing: 1,
    upc: inventoryItem.product.upc, imageUrls: inventoryItem.product.imageUrls,
  }));

  if (!STAGE && !PUBLISH) { console.log('\ndry run - pass --stage to create (not live) or --publish to go live'); return; }

  const tok = await userToken();

  if (STAGE) {
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
    console.log('inventory item written');
    let offerId = await existingOfferId(tok);
    if (offerId) {
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offer);
      console.log('offer updated', offerId);
    } else {
      const created = await api(tok, 'POST', '/sell/inventory/v1/offer', offer);
      offerId = created.offerId;
      console.log('offer created', offerId);
    }
    // A PUT against an already-published offer revises the live listing in
    // place, so this same flag is how price changes go out after go-live.
    console.log('offer written (revises the live listing if already published)');
    return;
  }

  const offerId = await existingOfferId(tok);
  if (!offerId) throw new Error('no staged offer for ' + SKU);
  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
  console.log('published', pub.listingId, `https://www.ebay.com/itm/${pub.listingId}`);
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
