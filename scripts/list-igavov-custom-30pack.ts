/**
 * Custom order for the igavov buyer (bought the Journey Together 18-pack lot):
 * 25 Destined Rivals @ $9.50 + 5 Surging Sparks @ $8.00 = $277.50 sum of parts,
 * rounded down to $270.00 flat at the buyer's request. One lot, one shipment.
 *
 *   npx tsx scripts/list-igavov-custom-30pack.ts            # dry run
 *   npx tsx scripts/list-igavov-custom-30pack.ts --stage    # create item + offer, NOT live
 *   npx tsx scripts/list-igavov-custom-30pack.ts --publish  # publish + write the vault mapping
 *
 * Inventory reconciled 2026-08-05: Surging Sparks was short 2 in the vault
 * (lot #527 added, +2 @ $5). This order clears the SS position to zero and
 * takes Destined Rivals from 106 to 81.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const STAGE = process.argv.includes('--stage');
const PUBLISH = process.argv.includes('--publish');

const SKU = 'CUSTOM-IGAVOV-30PACK';
const DR_QTY = 25, DR_PPP = 9.5, DR_CI = 17236;
const SS_QTY = 5, SS_PPP = 8.0, SS_CI = 19928;
// Buyer asked to round 277.50 down to 270 even; Michael took it.
const PRICE = '270.00';
const SUM_OF_PARTS = (DR_QTY * DR_PPP + SS_QTY * SS_PPP).toFixed(2);
const TOTAL_PACKS = DR_QTY + SS_QTY;
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const TITLE = `${TOTAL_PACKS} Sealed Pokemon Booster Packs ${DR_QTY} Destined Rivals ${SS_QTY} Surging Sparks`;

const DESCRIPTION = [
  `<p>${TOTAL_PACKS} sealed Pokemon booster packs.</p>`,
  `<p>${DR_QTY}x Destined Rivals and ${SS_QTY}x Surging Sparks. All packs are sealed and shipped together in one package.</p>`,
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
  // ~0.8 oz per pack x 30 = 24 oz, plus shipper and filler
  packageWeightAndSize: {
    dimensions: { length: 8, width: 8, height: 4, unit: 'INCH' },
    weight: { value: 32, unit: 'OUNCE' },
    shippingIrregular: false,
  },
  availability: { shipToLocationAvailability: { quantity: 1 } },
  product: {
    title: TITLE,
    description: DESCRIPTION,
    brand: 'Pokemon',
    mpn: 'Does Not Apply',
    // Category 183456 requires Game and Set (both free text, single value),
    // and Configuration is SELECTION_ONLY with "Pack" as the only valid value.
    aspects: {
      Game: ['Pokémon TCG'],
      Set: ['Destined Rivals, Surging Sparks'],
      Configuration: ['Pack'],
      Language: ['English'],
      'Number of Packs': [String(TOTAL_PACKS)],
      Features: ['Sealed'],
    },
    // Shot for this exact order. Stack leads; the spread is second and the
    // full 25 + 5 is countable in frame, which is the proof of count.
    imageUrls: [
      BASE + 'CombinedLot_DestinedRivals_plus_SurgingSparks_25plus5_01_stack.JPEG',
      BASE + 'CombinedLot_DestinedRivals_plus_SurgingSparks_25plus5_02_spread.JPEG',
    ],
  },
};

const offer = {
  sku: SKU,
  marketplaceId: 'EBAY_US',
  format: 'FIXED_PRICE',
  availableQuantity: 1,
  // 183456 = Toys & Hobbies > Collectible Card Games > CCG Sealed Packs, the
  // same category as the Lorcana 12-pack lot. NOT 183454 (CCG Individual
  // Cards), which rejects condition NEW on publish.
  categoryId: '183456',
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
  const gross = Number(PRICE);
  const net = gross * 0.864 - 0.3;
  const cost = DR_QTY * 5 + SS_QTY * 5;
  console.log(`${TITLE}\n  ${TITLE.length} chars | $${PRICE} | ${DR_QTY} DR @ $${DR_PPP} + ${SS_QTY} SS @ $${SS_PPP}`);
  console.log(`  sum of parts $${SUM_OF_PARTS}, rounded to $${PRICE}`);
  console.log(`  net after 13.6% + $0.30 = $${net.toFixed(2)} | cost $${cost.toFixed(2)} | profit $${(net - cost).toFixed(2)}`);

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
    VALUES (${u.user_id}, ${itemId},
      ${sql.json([{ qty: DR_QTY, catalogItemId: DR_CI }, { qty: SS_QTY, catalogItemId: SS_CI }])})`;
  console.log(`mapped ${DR_QTY}x ci${DR_CI} + ${SS_QTY}x ci${SS_CI} per unit sold`);
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
