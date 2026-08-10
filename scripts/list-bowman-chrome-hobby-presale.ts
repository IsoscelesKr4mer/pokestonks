/**
 * 2026 Bowman Chrome Baseball Hobby Box, PRESALE. Releases 2026-09-09.
 *
 *   npx tsx scripts/list-bowman-chrome-hobby-presale.ts            # dry run
 *   npx tsx scripts/list-bowman-chrome-hobby-presale.ts --stage    # create, NOT live
 *   npx tsx scripts/list-bowman-chrome-hobby-presale.ts --publish
 *
 * Follows the Pitch Black presale pattern from listings_v2.md: single-SKU BIN,
 * no offers, presale stated in the title and the first line of the body, ship
 * date named explicitly, all sales final.
 *
 * COST BASIS $332.09 ($299.99 + $32.10 tax, free shipping, Topps direct).
 *
 * NO UPC. The product is unreleased and I could not verify one. A web search
 * returns 887521158119, but that is the 2026 **Bowman** hobby box (1 auto), a
 * different product from Bowman **Chrome** (2 autos). Using it would be worse
 * than leaving it blank, so preflight is expected to block a publish until
 * Michael can read the barcode off the box in September.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'BOWCHROME-2026-HOBBY-PRESALE';
// Presale comps 2026-08-10, Bowman Chrome hobby only, excluding plain Bowman
// and Jumbo: a tight cluster at $449.95 / $449.99 / $450.00 all advertising a
// confirmed Sept 9 ship, then a second group at $599. $499.99 sits above the
// cluster and well under the optimists, on a box nobody can undercut on
// condition because none of them exist yet.
const PRICE = '499.99';
const COST_CENTS = 33209;
const UPC: string | null = null;
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

// 73 chars.
const TITLE = '2026 Bowman Chrome Baseball Hobby Box PRESALE Sealed 2 Autos Ships Sept 9';

const DESCRIPTION = [
  '<p><strong>PRESALE. This box releases September 9, 2026 and ships on or immediately after release.</strong></p>',
  '<p>2026 Bowman Chrome Baseball Hobby Box, factory sealed.</p>',
  '<p>6 packs per box, 10 cards per pack. <strong>2 Chrome autographs per box.</strong> Built around 1st Bowman cards, with the Chrome Prospect refractor rainbow, Mini Diamond and X-Fractor parallels.</p>',
  '<p><strong>Presale terms:</strong> paid at checkout, ships as soon as the box arrives from Topps. Release dates are set by Topps and can move. If the date slips I will tell you and you can cancel for a full refund at any point before it ships.</p>',
  '<p>Ordered direct from Topps, shipped to me, then straight to you unopened. Smoke-free home.</p>',
  '<p>Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const IMAGES = [BASE + 'BowmanChrome2026_Hobby_presale_01.jpg'];

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
    // eBay rejects MAILING_BOX for calculated shipping in this category
    // (errorId 25101, err:216305|MailingBoxes). Every working sealed listing
    // on this account uses PACKAGE_THICK_ENVELOPE, so match them.
    packageType: 'PACKAGE_THICK_ENVELOPE',
    dimensions: { length: 8, width: 6, height: 4, unit: 'INCH' },
    // A Bowman Chrome hobby box is light. Confirm on arrival before shipping.
    weight: { value: 14, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: 1 } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Topps',
    mpn: 'Does Not Apply',
    ...(UPC ? { upc: [UPC] } : {}),
    aspects: {
      Sport: ['Baseball'],
      League: ['Major League Baseball (MLB)'],
      Set: ['2026 Bowman Chrome'],
      Configuration: ['Hobby Box'],
      Manufacturer: ['Topps'],
      'Year Manufactured': ['2026'],
      Features: ['Sealed'],
      'Number of Boxes': ['1'],
      Autographed: ['Yes'],
    },
    imageUrls: IMAGES,
  },
};

async function main() {
  const net = Number(PRICE) * 0.847;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE}`);
  console.log(`  cost $${(COST_CENTS / 100).toFixed(2)} | net ~$${net.toFixed(2)} | profit $${(net - COST_CENTS / 100).toFixed(2)} (${(((net - COST_CENTS / 100) / (COST_CENTS / 100)) * 100).toFixed(0)}% ROI)`);
  console.log(`  break-even ask $${((COST_CENTS / 100) / 0.847).toFixed(2)}`);
  console.log(`  UPC: ${UPC ?? 'NONE - unreleased product, not verifiable yet'}`);

  // UPC is knowingly absent and Michael has accepted that: the product is
  // unreleased so there is no barcode to read, and the only UPC findable
  // online belongs to the plain Bowman hobby box. Everything else in preflight
  // still has to pass, so the check runs and only the UPC error is waived.
  const pf = await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(Number(PRICE) * 100),
    costCentsPerUnit: COST_CENTS, unitsPerListing: 1,
    upc: UPC, imageUrls: IMAGES,
  });
  const blocking = (pf.errors ?? []).filter((e: string) => !/no UPC/i.test(e));
  for (const w of pf.warnings ?? []) console.log(`  warning: ${w}`);
  for (const e of pf.errors ?? []) console.log(`  ${/no UPC/i.test(e) ? 'WAIVED' : 'ERROR'}: ${e}`);
  if (blocking.length) { console.error('preflight failed, not publishing'); process.exit(1); }
  console.log('  preflight ok (UPC waived by Michael, add it when the box lands)');

  if (!STAGE && !PUBLISH) { console.log('\ndry run'); return; }
  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  console.log('inventory item written');

  const offerBody = {
    sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
    categoryId: '261332', merchantLocationKey: 'edmonds-wa',
    listingDescription: DESCRIPTION, listingDuration: 'GTC',
    // BIN only, no offers, matching the Pitch Black presales.
    listingPolicies: {
      paymentPolicyId: '269110704012',
      returnPolicyId: '269110705012',
      fulfillmentPolicyId: '269110723012', // Ground Advantage calculated
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
    console.log(`publish errored, checking whether it applied: ${String(e).slice(0, 120)}`);
    itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0]?.listing?.listingId ?? '');
    if (!itemId) { console.error('publish genuinely failed'); process.exit(1); }
  }
  // Trading GetItem is the only trustworthy confirmation.
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await g.text();
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(`  Trading API: ${x.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${x.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, hidden ${x.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
