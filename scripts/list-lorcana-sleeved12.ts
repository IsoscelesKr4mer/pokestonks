/**
 * List the 12-pack lot of Disney Lorcana Attack of the Vine! Sleeved Boosters
 * at $132, sold as one unit. Mapping is 12x ci135074 per unit so a sale clears
 * the whole lot509 stack from held.
 *
 *   npx tsx scripts/list-lorcana-sleeved12.ts            # show the payload
 *   npx tsx scripts/list-lorcana-sleeved12.ts --apply    # create + publish
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SKU = 'LOR-AOTV-SLEEVED-12';
const CATALOG_ITEM_ID = 135074;
const PACKS = 12;
const PRICE = '132.00';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = 'Disney Lorcana Attack of the Vine 12 Sleeved Booster Packs Sealed Lot 144 Cards';

const DESCRIPTION = [
  '<p>12x sealed Disney Lorcana Attack of the Vine! sleeved booster packs.</p>',
  '<p>12 cards per pack, 144 cards total. Sleeved (hanger) packs, sold as one lot of 12.</p>',
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
  // 12 sleeved packs run ~13 oz; Michael's standard 8x8x4 box plus padding puts
  // it near 20 oz. Ground Advantage bills 16-32 oz at the same 2 lb rate, so
  // rounding up here costs the buyer nothing and avoids under-collecting.
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 20, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: 1 } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Ravensburger',
    mpn: 'Does Not Apply',
    aspects: {
      Game: ['Disney Lorcana TCG'],
      Set: ['Attack of the Vine!'],
      Manufacturer: ['Ravensburger'],
      Language: ['English'],
      'Number of Cards': ['144'],
      'Year Manufactured': ['2026'],
      Autographed: ['No'],
      Vintage: ['No'],
    },
    imageUrls: [
      BASE + 'Lorcana_AttackOfTheVine_Sleeved12_01_stack.JPEG',
      BASE + 'Lorcana_AttackOfTheVine_Sleeved12_02_spread.JPEG',
    ],
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: 1,
  categoryId: '183456', // Toys & Hobbies > Collectible Card Games > CCG Sealed Packs
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
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} | 1 lot of ${PACKS} | category ${offer.categoryId} | 8x8x4, 20 oz`);
  if (!APPLY) { console.log('dry run - pass --apply to publish'); await sql.end(); return; }

  const tok = await userToken();
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  console.log('inventory item written');

  const created = await api(tok, 'POST', '/sell/inventory/v1/offer', offer);
  console.log('offer', created.offerId);

  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${created.offerId}/publish`);
  const itemId = pub.listingId;
  console.log('published', itemId, `https://www.ebay.com/itm/${itemId}`);

  const u: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${u[0].user_id}, ${String(itemId)},
            ${sql.json([{ qty: PACKS, catalogItemId: CATALOG_ITEM_ID }])})`;
  console.log(`mapped ${PACKS}x ci${CATALOG_ITEM_ID} per unit sold`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
