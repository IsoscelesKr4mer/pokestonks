/**
 * Shrouded Fable Booster Bundle, SINGLE-bundle listing at qty 2, alongside the
 * existing twofer which drops from qty 3 to qty 2.
 *
 * Michael wanted variety: some buyers want one bundle, not two. Split of the
 * six he holds:
 *   twofer  #168592071604  qty 2 units x 2 bundles = 4
 *   single  (this)         qty 2 units x 1 bundle  = 2
 *                                                   -- 6 total, no overcommit
 *
 * Price: $57.99, cut from the original $62.99 draft.
 *
 * Michael, 2026-08-11, proposed this as an A/B test rather than nuking the
 * twofer: "why dont we start w/ 2 singles of SF and 2 quantity of the twofer
 * to test the theory and not nuke the listing that already has a watcher on
 * it." Right call, the twofer keeps its watcher and its history.
 *
 * Active scan 2026-08-11 (n=87 single bundles, delivered): low $49.99,
 * Q1 $57.50, median $62.99, Q3 $75.32. The old $62.99 draft was the MEDIAN,
 * and the median is the price that is not selling. $57.99 sits at Q1, in the
 * band where the transactions are. See memory feedback_dont_price_to_active_median.
 *
 * The twofer at $109.99 is $54.99/bundle, already under Q1, so SF was never
 * overpriced. Its problem is format: it asks buyers to take two when 87
 * sellers offer one. That is the theory this test checks.
 *
 * Economics at $57.99 vs the twofer, per bundle:
 *   single  net $48.85 on $35.37 cost -> +$13.48
 *   twofer  net $93.69 on $70.74 cost -> +$11.48
 * So the single is better per unit AND reaches a bigger pool.
 *
 *   npx tsx scripts/list-shroudedfable-single.ts            # dry run
 *   npx tsx scripts/list-shroudedfable-single.ts --stage    # create, NOT live
 *   npx tsx scripts/list-shroudedfable-single.ts --publish
 *
 * BLOCKED ON A UPC. This product ships in two box footprints with different
 * barcodes, so it cannot be guessed. preflight refuses to publish without one.
 * Set UPC below from a photo of the barcode on Michael's actual box.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'SF-BUNDLE-SINGLE';
const TWOFER_SKU = 'SF-BUNDLE-TWOFER';
const CATALOG_ITEM_ID = 5283;
const PRICE = '57.99';
const QTY = 2;
const TWOFER_QTY = 2; // units, each 2 bundles
const COST_EACH = 35.37;
// Read off the barcode on Michael's actual box, 2026-08-11: "0 820650 413513",
// item code 290-41351. Check digit validates. This product ships in two box
// footprints with DIFFERENT barcodes assigned at random, so it could never be
// looked up online; it had to come from his box.
const UPC: string | null = '820650413513';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = 'Pokemon Shrouded Fable Booster Bundle Sealed 6 Booster Packs Scarlet Violet';

const DESCRIPTION = [
  '<p>Sealed Pokemon Scarlet &amp; Violet Shrouded Fable Booster Bundle.</p>',
  '<p>6 booster packs, 10 cards per pack, 60 cards total.</p>',
  '<p>Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

// Marble reshoot Michael sent 2026-08-11 for this listing specifically.
const PHOTOS = ['ShroudedFable_BoosterBundle_single_reshoot_01_front.JPEG', 'ShroudedFable_BoosterBundle_single_reshoot_02_back.JPEG'];

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const inventoryItem: any = {
  locale: 'en_US',
  condition: 'NEW',
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 14, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: QTY } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Pokemon',
    mpn: 'Does Not Apply',
    ...(UPC ? { upc: [UPC] } : {}),
    aspects: {
      Game: ['Pokémon TCG'],
      Set: ['Scarlet & Violet: Shrouded Fable'],
      Configuration: ['Booster Bundle'],
      Language: ['English'],
      'Number of Packs': ['6'],
      Features: ['Sealed'],
    },
    imageUrls: PHOTOS.map((p) => BASE + p),
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
    fulfillmentPolicyId: '269110723012',
    eBayPlusIfEligible: false,
  },
  pricingSummary: { price: { value: PRICE, currency: 'USD' } },
  tax: { applyTax: false },
};

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const net = Number(PRICE) * 0.864 - 0.3;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} x ${QTY} | net $${net.toFixed(2)} | cost $${COST_EACH.toFixed(2)} | +$${(net - COST_EACH).toFixed(2)}/bundle`);
  console.log(`  split: twofer qty ${TWOFER_QTY} (${TWOFER_QTY * 2} bundles) + single qty ${QTY} (${QTY} bundles) = ${TWOFER_QTY * 2 + QTY} of 6 held`);

  assertPreflight(SKU, await preflight({
    sku: SKU, title: TITLE, priceCents: Math.round(Number(PRICE) * 100),
    costCentsPerUnit: Math.round(COST_EACH * 100), unitsPerListing: 1,
    upc: UPC, imageUrls: PHOTOS.map((p) => BASE + p),
  }));

  if (!STAGE && !PUBLISH) { console.log('\ndry run'); await sql.end(); return; }
  const tok = await userToken();

  // Free up two bundles by shrinking the twofer BEFORE the single goes up.
  const tw = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${TWOFER_SKU}`);
  const to = tw.offers[0];
  if (to.availableQuantity !== TWOFER_QTY) {
    const tinv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${TWOFER_SKU}`);
    tinv.availability = { shipToLocationAvailability: { quantity: TWOFER_QTY } };
    delete tinv.sku;
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${TWOFER_SKU}`, tinv);
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${to.offerId}`, {
      availableQuantity: TWOFER_QTY, categoryId: to.categoryId, listingDescription: to.listingDescription,
      listingDuration: to.listingDuration, listingPolicies: to.listingPolicies,
      merchantLocationKey: to.merchantLocationKey, pricingSummary: to.pricingSummary, tax: to.tax,
    });
    console.log(`twofer ${to.listing.listingId} qty ${to.availableQuantity} -> ${TWOFER_QTY}`);
  }

  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inventoryItem);
  let offerId: string;
  try {
    const ex = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
    offerId = ex.offers[0].offerId;
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offer);
  } catch {
    offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offer)).offerId;
  }
  if (!PUBLISH) { console.log(`offer ${offerId} STAGED, not published`); await sql.end(); return; }

  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`);
  const itemId = String(pub.listingId);
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  const [u] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  const exists = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
  if (exists.length === 0) {
    await sql`
      INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
      VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: CATALOG_ITEM_ID }])})`;
    console.log(`mapped 1x ci${CATALOG_ITEM_ID} per unit sold`);
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
