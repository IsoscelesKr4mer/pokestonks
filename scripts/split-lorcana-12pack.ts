/**
 * Replace the dead Lorcana 12-pack lot with three 4-pack lots.
 *
 *   npx tsx scripts/split-lorcana-12pack.ts            # plan
 *   npx tsx scripts/split-lorcana-12pack.ts --publish  # LIVE
 *
 * Michael: "can we relist the loorcana stuff to reinvigorate the algorithm?"
 * then "do whatever you think will make it move".
 *
 * Relisting the same 12-pack would only restart the clock on a format nobody is
 * buying: 19 days, 0 watchers, and it was 15% over market until today. Since new
 * listings are being created anyway, fix the format at the same time.
 *
 * ECONOMICS. Pack market is $9.57 (TCGCSV), cost is $6.62.
 *   12-lot at $109.99  -> net $95.02 on $79.44  = +$15.58, one buyer, $110 buy-in
 *   3 x 4 at $37.99    -> net $32.56 on $26.48  = +$6.08 each, +$18.24 total
 * The split makes MORE money at a third of the buy-in and gives three chances to
 * sell instead of one. $37.99 is $9.50 a pack, right at market.
 *
 * PHOTO. The old listing's spread shows twelve packs, which cannot front a
 * four-pack listing. The lead image is a crop of the top-left 2x2 of that same
 * spread: four real sealed packs he owns, nothing staged or borrowed. The single
 * stack shot carries over as the second image.
 *
 * The 12-pack offer is withdrawn BEFORE the new ones publish, so the same twelve
 * packs are never committed to four listings at once.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const OLD_SKU = 'LOR-AOTV-SLEEVED-12';
const OLD_ITEM = '168574098363';
const CATALOG_ITEM = 135074;          // Attack of the Vine! Sleeved Booster Pack
const PACKS_PER_LOT = 4;
/**
 * ONE listing at quantity 3, not three listings.
 *
 * Three separate 4-pack listings is what I tried first and eBay refused it:
 * "We don't allow listings for identical items from the same seller to appear
 * on eBay at the same time" (errorId 25002). Identical title, identical item.
 *
 * A single multi-quantity listing is what eBay wants here and is better anyway:
 * one listing accruing all the search history instead of three splitting it,
 * and a buyer can take one, two or all three. The low buy-in, which was the
 * whole point of splitting, is preserved at $37.99.
 */
const LOTS = ['LOR-AOTV-SLEEVED-4A'];
const LOT_QTY = 3;
const PRICE = '37.99';
const COST_EACH = 662;                // cents per pack
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const TITLE = 'Disney Lorcana Attack of the Vine 4 Sleeved Booster Packs Sealed 48 Cards';
const DESCRIPTION = [
  '<p>4x sealed Disney Lorcana: Attack of the Vine! sleeved booster packs.</p>',
  '<p>12 cards per pack, 48 cards total. Sleeved (hanger) packs, sold as one lot of 4.</p>',
  '<p>Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('\n');

const PHOTOS: [string, string][] = [
  ['eBay_assets/v2_photos/Lorcana_AttackOfTheVine_Sleeved4_01_four_packs.jpg', 'Lorcana_AttackOfTheVine_Sleeved4_01_four_packs.jpg'],
  ['eBay_assets/v2_photos/Lorcana_AttackOfTheVine_Sleeved12_01_stack.JPEG', 'Lorcana_AttackOfTheVine_Sleeved4_02_stack.jpg'],
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
  const t = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
}
async function live(tok: string, item: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  }).then((r) => r.text());
  return { status: g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?', price: g.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? '?' };
}

async function main() {
  const src = PHOTOS[0][0];
  if (!existsSync(src)) { console.error(`4-pack crop not found: ${src}`); process.exit(1); }
  if (!existsSync(PHOTOS[1][0])) { console.error('stack photo missing'); process.exit(1); }
  if (TITLE.length > 80) { console.error(`title ${TITLE.length} chars`); process.exit(1); }

  const [h]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${CATALOG_ITEM} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  const held = Number(h.held);
  const need = LOTS.length * LOT_QTY * PACKS_PER_LOT;
  const net = Number(PRICE) * 0.8675 - 0.4;
  const cost = (COST_EACH * PACKS_PER_LOT) / 100;

  console.log(`${TITLE}  (${TITLE.length} chars)`);
  console.log(`  held ${held} packs, need ${need} for ${LOT_QTY} units of ${PACKS_PER_LOT}`);
  console.log(`  $${PRICE} each = $${(Number(PRICE) / PACKS_PER_LOT).toFixed(2)}/pack | net $${net.toFixed(2)} on $${cost.toFixed(2)} = +$${(net - cost).toFixed(2)} each, +$${((net - cost) * LOT_QTY).toFixed(2)} total`);
  if (need > held) { console.error(`  REFUSING: need ${need}, hold ${held}`); process.exit(1); }
  if (!PUBLISH) { console.log('\nplan only, pass --publish'); await sql.end(); return; }

  const tok = await userToken();

  // 1. end the 12-pack FIRST so the same packs are never on four listings
  const before = await live(tok, OLD_ITEM);
  if (before.status === 'Active') {
    const o = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${OLD_SKU}`)).offers[0];
    await api(tok, 'POST', `/sell/inventory/v1/offer/${o.offerId}/withdraw`);
    const after = await live(tok, OLD_ITEM);
    console.log(`\n12-pack ${OLD_ITEM}: ${before.status} -> ${after.status}`);
    if (after.status === 'Active') { console.error('  still Active, stopping'); process.exit(1); }
  } else console.log(`\n12-pack already ${before.status}`);

  // 2. photos
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const urls: string[] = [];
  for (const [path, name] of PHOTOS) {
    const { error } = await sb.storage.from(BUCKET).upload(name, readFileSync(path), { contentType: 'image/jpeg', upsert: true });
    if (error) { console.error(`upload ${name}: ${error.message}`); process.exit(1); }
    if (!(await fetch(PUB + name, { method: 'HEAD' })).ok) { console.error(`unreachable ${name}`); process.exit(1); }
    urls.push(PUB + name);
  }
  console.log(`uploaded ${urls.length} photos`);

  // 3. three lots
  const [u]: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  for (const sku of LOTS) {
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${sku}`, {
      locale: 'en_US', condition: 'NEW',
      packageWeightAndSize: {
        packageType: 'PACKAGE_THICK_ENVELOPE',
        dimensions: { length: 9, width: 6, height: 1, unit: 'INCH' },
        weight: { value: 6, unit: 'OUNCE' }, shippingIrregular: false,
      },
      availability: { shipToLocationAvailability: { quantity: LOT_QTY } },
      product: {
        title: TITLE, description: DESCRIPTION, brand: 'Ravensburger', mpn: 'Does Not Apply',
        aspects: {
          // Category 183456 takes Configuration as SELECTION_ONLY and the only
          // valid value here is exactly "Pack". "Booster Pack" is rejected, and
          // Set is free text. Same constraint as the DR checklane blister.
          Game: ['Disney Lorcana'], Set: ['Attack of the Vine!'], Configuration: ['Pack'],
          Language: ['English'], Features: ['Sealed'],
        },
        imageUrls: urls,
      },
    });
    const offerBody = {
      sku, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: LOT_QTY,
      // 183456 = CCG Sealed Packs, taken off the listing this replaces.
      // 183454 is CCG Individual Cards and rejects condition NEW outright.
      categoryId: '183456', merchantLocationKey: 'edmonds-wa',
      listingDescription: DESCRIPTION, listingDuration: 'GTC',
      listingPolicies: { paymentPolicyId: '269110704012', returnPolicyId: '269110705012', fulfillmentPolicyId: '269110723012', eBayPlusIfEligible: false },
      pricingSummary: { price: { value: PRICE, currency: 'USD' } }, tax: { applyTax: false },
    };
    let offerId: string;
    try {
      offerId = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${sku}`)).offers[0].offerId;
      await api(tok, 'PUT', `/sell/inventory/v1/offer/${offerId}`, offerBody);
    } catch {
      offerId = (await api(tok, 'POST', '/sell/inventory/v1/offer', offerBody)).offerId;
    }
    const itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offerId}/publish`)).listingId);
    const chk = await live(tok, itemId);
    console.log(`  ${sku} -> ${itemId} [${chk.status}] $${chk.price}  https://www.ebay.com/itm/${itemId}`);
    if (chk.status !== 'Active') { console.error('   not Active'); process.exit(1); }
    const ex: any = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
    if (!ex.length) {
      await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
        VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: PACKS_PER_LOT, catalogItemId: CATALOG_ITEM }])})`;
      console.log(`     mapped ${PACKS_PER_LOT}x ci${CATALOG_ITEM} per unit sold`);
    }
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
