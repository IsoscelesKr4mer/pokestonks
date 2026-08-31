/**
 * Relist the Prismatic Evolutions + Destined Rivals booster bundle combo,
 * SKU DRPRIS-TWOFER, offer 218664176011 (currently UNPUBLISHED).
 *
 *   npx tsx scripts/relist-drpris-twofer-0821.ts            # dry run
 *   npx tsx scripts/relist-drpris-twofer-0821.ts --write     # needs Michael's go-ahead
 *
 * History on this exact SKU: sold 2026-07-28 at $159.99 in about an hour,
 * relisted 08-13 at $159.99, killed 08-16 for asking $15 over sum-of-parts
 * while tying up one of each bundle. So the price is the whole question and
 * $159.99 is the number NOT to repeat.
 *
 * $149.99 = sum-of-parts at today's vault market (DR $67.67 + PE $82.61 =
 * $150.28), so no bundle discount and no premium, and $10 under the ask that
 * stalled.
 *
 * NO UPC on purpose: two different products in one listing, so no single
 * manufacturer barcode describes it. preflight gets expectUpc:false rather
 * than being bypassed.
 *
 * Inventory guard: DR held 6, PE held 4, and both are fully committed to the
 * single listings right now. The singles MUST come down first
 * (DR 6 -> 5, PE 4 -> 3) or the same two bundles are committed twice.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import postgres from 'postgres';
import { preflight } from './lib/preflight';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const SKU = 'DRPRIS-TWOFER';
const PRICE = '149.99';
const COST = 30.0 + 30.0; // DR lot#547 $30 + PE lot#552 $30, both vending
const TITLE = 'Pokemon TCG Prismatic Evolutions + Destined Rivals Booster Bundle Lot Sealed';
const IMAGES = [
  'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/dr_prismatic_twofer_front.jpg',
  'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/dr_prismatic_twofer_back.jpg',
];
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function getItem(tok: string, itemId: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  return g.text();
}

async function held(ci: number) {
  const h: any = await sql`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0)),0)::int h
    FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL`;
  return h[0].h as number;
}

async function main() {
  const net = Number(PRICE) - ((Number(PRICE) + 11) * 0.1325 + 0.4);
  const drHeld = await held(17235), peHeld = await held(19776);
  console.log(`${SKU} relist at $${PRICE}`);
  console.log(`  cost $${COST.toFixed(2)} | net ~$${net.toFixed(2)} | profit ~$${(net - COST).toFixed(2)}`);
  console.log(`  held: DR ${drHeld}, PE ${peHeld}`);

  const pf = await preflight({
    sku: SKU, title: TITLE,
    priceCents: Math.round(Number(PRICE) * 100),
    costCentsPerUnit: Math.round(COST * 100), unitsPerListing: 1,
    upc: null, expectUpc: false,
    imageUrls: IMAGES,
  });
  for (const w of pf.warnings ?? []) console.log(`  warning: ${w}`);
  for (const e of pf.errors ?? []) console.log(`  ERROR: ${e}`);
  if ((pf.errors ?? []).length) { console.error('preflight failed'); await sql.end(); process.exit(1); }
  console.log('  preflight ok');

  if (!WRITE) {
    console.log('\ndry run. Before --write, cut the singles so nothing is double-committed:');
    console.log('  npx tsx scripts/set-bundle-qty.ts DR-BUNDLE-SINGLE 5 --apply');
    console.log('  npx tsx scripts/set-bundle-qty.ts PE-BUNDLE-SINGLE 3 --apply');
    await sql.end();
    return;
  }

  const tok = await userToken();
  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: 1 } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inv);

  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
  const offer = offers.offers?.[0];
  if (!offer) throw new Error(`no offer for ${SKU}`);
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
    availableQuantity: 1,
    categoryId: offer.categoryId,
    listingDescription: offer.listingDescription,
    listingDuration: offer.listingDuration,
    listingPolicies: offer.listingPolicies,
    merchantLocationKey: offer.merchantLocationKey,
    pricingSummary: { price: { value: PRICE, currency: 'USD' } },
    tax: offer.tax,
  });
  let itemId = String(offer.listing?.listingId ?? '');
  try {
    itemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${offer.offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`  publish reported an error, checking whether it applied: ${String(e).slice(0, 140)}`);
    itemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0]?.listing?.listingId ?? itemId);
  }
  const xml = await getItem(tok, itemId);
  const status = xml.match(/<ListingStatus>([^<]*)</)?.[1];
  console.log(`${itemId}: ${status} @ $${xml.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${xml.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${xml.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  console.log(`  https://www.ebay.com/itm/${itemId}`);
  if (status !== 'Active') { console.error('NOT Active, needs a look'); await sql.end(); process.exit(1); }

  const mapping = [{ qty: 1, catalogItemId: 19776 }, { qty: 1, catalogItemId: 17235 }];
  await sql`
    INSERT INTO ebay_listing_mappings (ebay_item_id, mappings, updated_at)
    VALUES (${itemId}, ${sql.json(mapping)}, now())
    ON CONFLICT (ebay_item_id) DO UPDATE SET mappings=${sql.json(mapping)}, updated_at=now()`;
  console.log('  mapped 1x ci19776 (PE bundle) + 1x ci17235 (DR bundle)');
  await sql.end();
}
main().catch(async (e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
