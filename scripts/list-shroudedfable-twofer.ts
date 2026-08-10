/**
 * Shrouded Fable Booster Bundle twofer: 2 bundles per unit, qty 3 units,
 * covering all 6 Michael bought at Target on 2026-08-05.
 *
 *   npx tsx scripts/list-shroudedfable-twofer.ts            # dry run
 *   npx tsx scripts/list-shroudedfable-twofer.ts --stage    # create, NOT live
 *   npx tsx scripts/list-shroudedfable-twofer.ts --publish  # publish + map
 *
 * Mapping is 2x ci5283 per unit sold, so one sale decrements the vault by 2.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'SF-BUNDLE-TWOFER';
const CATALOG_ITEM_ID = 5283;
const PER_UNIT = 2;   // bundles inside one listing unit
const QTY = 3;        // listing units
// 119.99 -> 109.99 on 2026-08-07, Michael's call. That is $54.99/bundle, about
// 9% under the $60.53 single-bundle sold median and under the one real 2X comp
// ($113.77 on 2026-08-05). Still +$23.99 per twofer.
const PRICE = '109.99';
const COST_EACH = 35.37;
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = 'Pokemon Shrouded Fable Booster Bundle Lot of 2 Sealed 12 Booster Packs';

const DESCRIPTION = [
  '<p>2x sealed Pokemon Scarlet &amp; Violet Shrouded Fable Booster Bundles.</p>',
  '<p>Each bundle contains 6 booster packs, 10 cards per pack, so 12 packs and 120 cards total across the two. Both bundles are sealed and ship together in one package.</p>',
  '<p>Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
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
  // Each bundle box runs ~8 oz; two plus shipper and filler.
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 24, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Pokemon',
    mpn: 'Does Not Apply',
    aspects: {
      Game: ['Pokémon TCG'],
      Set: ['Scarlet & Violet: Shrouded Fable'],
      Configuration: ['Booster Bundle'],
      Language: ['English'],
      'Number of Packs': ['12'],
      Features: ['Sealed'],
    },
    // Marble reshoot, replaces the car-seat originals.
    imageUrls: [
      BASE + 'ShroudedFable_BoosterBundle_twofer_reshoot_01_front.JPEG',
      BASE + 'ShroudedFable_BoosterBundle_twofer_reshoot_02_back.JPEG',
    ],
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: QTY,
  categoryId: '261044', // CCG Sealed Boxes, same as the Lorcana Trove
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

async function existingOfferId(tok: string): Promise<string | null> {
  try {
    const res = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
    return res?.offers?.[0]?.offerId ?? null;
  } catch (e) {
    if (String(e).includes('-> 404')) return null;
    throw e;
  }
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const net = Number(PRICE) * 0.864 - 0.3;
  const cost = PER_UNIT * COST_EACH;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} x ${QTY} units | ${PER_UNIT} bundles per unit`);
  console.log(`  net $${net.toFixed(2)} | cost $${cost.toFixed(2)} | profit $${(net - cost).toFixed(2)}/unit | $${((net - cost) * QTY).toFixed(2)} if all 3 clear`);
  console.log(`  break-even ask $${((cost + 0.3) / 0.864).toFixed(2)}`);

  if (!STAGE && !PUBLISH) { console.log('\ndry run - pass --stage to create (not live)'); await sql.end(); return; }

  const tok = await userToken();

  if (STAGE) {
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
    let offerId = await existingOfferId(tok);
    if (offerId) { await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offer); console.log('offer updated', offerId); }
    else { offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offer)).offerId; console.log('offer created', offerId); }
    console.log('STAGED, not published');
    await sql.end();
    return;
  }

  const offerId = await existingOfferId(tok);
  if (!offerId) throw new Error('no staged offer for ' + SKU);
  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
  const itemId = String(pub.listingId);
  console.log('published', itemId, `https://www.ebay.com/itm/${itemId}`);

  const [u] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: PER_UNIT, catalogItemId: CATALOG_ITEM_ID }])})`;
  console.log(`mapped ${PER_UNIT}x ci${CATALOG_ITEM_ID} per unit sold`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
