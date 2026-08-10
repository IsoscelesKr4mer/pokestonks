/**
 * List the Disney Lorcana Attack of the Vine! Illumineer's Trove, qty 4 @ $89.99.
 * Inventory API (SKU-based) so the existing eBay sync path works, then the
 * ebay_listing_mappings row so a sale decrements ci135073 by 1.
 *
 *   npx tsx scripts/list-lorcana-trove.ts            # show the payload
 *   npx tsx scripts/list-lorcana-trove.ts --apply    # create + publish
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SKU = 'LOR-AOTV-TROVE';
const CATALOG_ITEM_ID = 135073;
const PRICE = '89.99';
const QTY = 4;
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = "Disney Lorcana Attack of the Vine Illumineer's Trove Factory Sealed 8 Packs";

const DESCRIPTION = [
  "<p>Disney Lorcana Attack of the Vine! Illumineer's Trove, new and sealed.</p>",
  '<p>Contents per the box: 1 storage box, 6 card dividers, 6 damage-counter dice, 1 spin-dial lore counter, and 8 booster packs of 12 cards each. Note the box states this product does not include a Disney Lorcana deck.</p>',
  '<p>Ships within 1 business day.</p>',
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
  condition: 'NEW',
  // 13.75 oz for the box itself (Michael weighed it) plus ~5 oz of shipper and padding
  packageWeightAndSize: {
    dimensions: { length: 9, width: 7, height: 4, unit: 'INCH' },
    weight: { value: 19, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Ravensburger',
    mpn: 'Does Not Apply',
    aspects: {
      Game: ['Disney Lorcana TCG'],
      Set: ['Attack of the Vine!'],
      Manufacturer: ['Ravensburger'],
      Configuration: ['Box'],
      Language: ['English'],
      'Number of Cards': ['96'],
      'Year Manufactured': ['2026'],
      Autographed: ['No'],
      Vintage: ['No'],
    },
    imageUrls: [
      BASE + 'Lorcana_AttackOfTheVine_Trove_01_front.JPEG',
      BASE + 'Lorcana_AttackOfTheVine_Trove_03_back_contents.JPEG',
      BASE + 'Lorcana_AttackOfTheVine_Trove_02_top_sealed.JPEG',
    ],
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: QTY,
  categoryId: '261044',
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

async function main() {
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} x ${QTY} | category ${offer.categoryId} | 19 oz shipped`);
  if (!APPLY) { console.log('dry run - pass --apply to publish'); await sql.end(); return; }

  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  console.log('inventory item written');

  const created = await api(tok, 'POST', '/sell/inventory/v1/offer', offer);
  const offerId = created.offerId;
  console.log('offer', offerId);

  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
  const itemId = pub.listingId;
  console.log('published', itemId, `https://www.ebay.com/itm/${itemId}`);

  const u: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${u[0].user_id}, ${String(itemId)},
            ${sql.json([{ qty: 1, catalogItemId: CATALOG_ITEM_ID }])})`;
  console.log(`mapped 1x ci${CATALOG_ITEM_ID} per unit sold`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
