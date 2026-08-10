/**
 * List the 2021 Topps Chrome Ohtani #159 Black & White Mini-Diamond Refractor.
 * $699.99 BIN with Best Offer, auto-decline under $550 (Michael's call: no exact
 * comp is listed anywhere, his is the only one, and he is fine sitting on it).
 *
 *   npx tsx scripts/list-ohtani-minidiamond.ts            # show the payload
 *   npx tsx scripts/list-ohtani-minidiamond.ts --apply    # create + publish
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CARD_ID = '1';
const SKU = 'OHTANI-BW-MINIDIAMOND-2021';
const PRICE = '699.99';
const AUTO_DECLINE = '550.00';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';
const TITLE = '2021 Topps Chrome Shohei Ohtani #159 Black & White Mini Diamond Refractor Angels';

const PHOTOS = [
  'Ohtani2021_ToppsChrome_BWMiniDiamond_01_front.JPEG',
  'Ohtani2021_ToppsChrome_BWMiniDiamond_04_one_touch.JPEG',
  'Ohtani2021_ToppsChrome_BWMiniDiamond_02_back.JPEG',
  'Ohtani2021_ToppsChrome_BWMiniDiamond_03_in_case.JPEG',
].map((f) => BASE + f);

const DESCRIPTION = [
  '<p>2021 Topps Chrome Shohei Ohtani #159, Black &amp; White Mini-Diamond Refractor, Los Angeles Angels.</p>',
  '<p>Raw / ungraded, near mint or better. Shipped in the magnetic one touch holder shown, protected between rigid cardboard with tracking. Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

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
  condition: 'USED_VERY_GOOD',
  conditionDescriptors: [{ name: '40001', values: ['400010'] }], // ungraded, near mint or better
  packageWeightAndSize: {
    dimensions: { length: 7, width: 5, height: 1, unit: 'INCH' },
    weight: { value: 6, unit: 'OUNCE' }, // card in a one touch, boxed
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: 1 } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Topps',
    mpn: 'Does Not Apply',
    aspects: {
      Sport: ['Baseball'],
      League: ['Major League Baseball (MLB)'],
      Type: ['Sports Trading Card'],
      Set: ['2021 Topps Chrome'],
      Season: ['2021'],
      Manufacturer: ['Topps'],
      'Player/Athlete': ['Shohei Ohtani'],
      'Card Name': ['Shohei Ohtani'],
      'Card Number': ['159'],
      'Parallel/Variety': ['Black and White Mini-Diamond Refractor'],
      Features: ['Refractor'],
      Team: ['Los Angeles Angels'],
      Grade: ['Ungraded'],
      Graded: ['No'],
      Vintage: ['No'],
      Autographed: ['No'],
    },
    imageUrls: PHOTOS,
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: 1,
  categoryId: '261328',
  merchantLocationKey: 'edmonds-wa',
  listingDescription: DESCRIPTION,
  listingDuration: 'GTC',
  listingPolicies: {
    paymentPolicyId: '269110704012',
    returnPolicyId: '269110705012',
    fulfillmentPolicyId: '269110723012', // Ground Advantage Calculated, buyer pays
    eBayPlusIfEligible: false,
    bestOfferTerms: {
      bestOfferEnabled: true,
      autoDeclinePrice: { value: AUTO_DECLINE, currency: 'USD' },
    },
  },
  pricingSummary: { price: { value: PRICE, currency: 'USD' } },
  tax: { applyTax: false },
};

async function main() {
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} BIN | best offer on, auto-decline under $${AUTO_DECLINE} | ${PHOTOS.length} photos`);
  if (!APPLY) { console.log('dry run - pass --apply to publish'); await sql.end(); return; }

  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  console.log('inventory item written');

  const created = await api(tok, 'POST', '/sell/inventory/v1/offer', offer);
  console.log('offer', created.offerId);

  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${created.offerId}/publish`);
  const itemId = pub.listingId;
  console.log('published', itemId, `https://www.ebay.com/itm/${itemId}`);

  await sql`
    UPDATE baseball_cards
    SET status = 'listed', for_sale = true, asking_price_cents = 69999,
        ebay_item_id = ${String(itemId)}, ebay_offer_id = ${String(created.offerId)}, ebay_sku = ${SKU},
        photo_urls = ${sql.json(PHOTOS)},
        comp_note = 'Active asks 2026-07-31 (eBay Browse, no exact comp exists): B&W Mini Diamond Ohtani $299 PSA 9 / $535 raw 2022 Platinum / $1200 PSA 10. Priced $699.99 on Michael''s read of the post-$11M-1/1 Ohtani spike.',
        notes = 'Black and White Mini-Diamond Refractor. Listed 2026-07-31 at $699.99 BIN with best offer, auto-decline under $550. Michael: no exact comp listed anywhere, his is the only one, happy to sit on it.',
        updated_at = now()
    WHERE id = ${CARD_ID}`;
  console.log('db updated: card 1 -> listed @ $699.99');
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
