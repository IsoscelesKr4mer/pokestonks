/**
 * Michael, 2026-08-16: "drop shrouded fable bundles to 54.99 and kill the dr/pe
 * twofer and add to their signle quntities"
 *
 *   npx tsx scripts/rework-bundle-listings-0816.ts           # dry run
 *   npx tsx scripts/rework-bundle-listings-0816.ts --apply
 *
 * 1. SF single 168606265372 goes $57.99 -> $54.99. Read as the single listing
 *    only: the SF twofer at $109.99 is ALREADY $54.99 a bundle, so this aligns
 *    the single with the twofer's per-bundle price rather than undercutting it.
 * 2. The DR/PE combo 168606266070 ($159.99, SKU DRPRIS-TWOFER) is withdrawn.
 *    It committed 1 DR + 1 PE while asking $15 over sum-of-parts.
 * 3. Those freed units go onto the singles: DR 4 -> 5, PE 1 -> 2.
 *
 * ORDER MATTERS. The combo is killed BEFORE the quantities go up, so the stock
 * is never committed to two live listings at once. Each quantity raise is also
 * re-checked against held minus what is still committed to an Active listing,
 * and the script aborts rather than overselling.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SF_SINGLE = { sku: 'SF-BUNDLE-SINGLE', item: '168606265372', price: '54.99' };
const COMBO = { sku: 'DRPRIS-TWOFER', item: '168606266070' };
const RAISES = [
  { sku: 'DR-BUNDLE-SINGLE', item: '168617483804', catalogItemId: 17235, qty: 5, label: 'Destined Rivals' },
  { sku: 'PE-BUNDLE-SINGLE', item: '168617484171', catalogItemId: 19776, qty: 2, label: 'Prismatic Evolutions' },
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
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
async function live(tok: string, item: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  }).then((r) => r.text());
  const q = Number(g.match(/<Quantity>(\d+)</)?.[1] ?? 0), sold = Number(g.match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
  return { status: g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?', price: g.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? '?', avail: Math.max(0, q - sold) };
}
async function heldOf(ci: number) {
  const [h]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  return Number(h.held);
}
/**
 * Units of `ci` committed to Active listings, ignoring `skip`.
 *
 * The combo is always skipped, not just the listing being raised. It is being
 * ended as part of this same operation, so counting it would refuse the raise
 * on a dry run purely because the withdraw has not happened yet - a false
 * positive that hides whether the real numbers work.
 */
async function committed(tok: string, ci: number, skip: string[]) {
  const rows: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  let n = 0;
  for (const row of rows) {
    const id = String(row.ebay_item_id);
    if (skip.includes(id)) continue;
    const hit = ((row.mappings as any[]) ?? []).filter((m) => Number(m.catalogItemId) === ci);
    if (!hit.length) continue;
    const l = await live(tok, id);
    if (l.status !== 'Active') continue;
    for (const m of hit) n += Number(m.qty) * l.avail;
  }
  return n;
}

async function main() {
  const tok = await userToken();

  // ---- 1. Shrouded Fable single price cut ----
  const sfBefore = await live(tok, SF_SINGLE.item);
  console.log(`SF single ${SF_SINGLE.item} [${sfBefore.status}] $${sfBefore.price} -> $${SF_SINGLE.price}  (twofer is already $54.99/bundle)`);
  if (APPLY) {
    const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SF_SINGLE.sku}`)).offers[0];
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
      availableQuantity: offer.availableQuantity, categoryId: offer.categoryId,
      listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
      listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
      pricingSummary: { price: { value: SF_SINGLE.price, currency: 'USD' } },
      tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
    });
    const after = await live(tok, SF_SINGLE.item);
    console.log(`   now $${after.price}${after.price === SF_SINGLE.price ? ' verified' : '  DID NOT TAKE'}`);
    if (after.price !== SF_SINGLE.price) process.exit(1);
  }

  // ---- 2. kill the combo, BEFORE raising anything ----
  const comboBefore = await live(tok, COMBO.item);
  console.log(`\ncombo ${COMBO.item} [${comboBefore.status}] $${comboBefore.price} -> ending`);
  if (APPLY && comboBefore.status === 'Active') {
    const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${COMBO.sku}`)).offers[0];
    await api(tok, 'POST', `/sell/inventory/v1/offer/${offer.offerId}/withdraw`);
    const after = await live(tok, COMBO.item);
    console.log(`   now ${after.status}${after.status === 'Active' ? '  STILL ACTIVE, stopping' : ' verified'}`);
    if (after.status === 'Active') process.exit(1);
  }

  // ---- 3. raise the singles into the freed stock ----
  for (const r of RAISES) {
    const held = await heldOf(r.catalogItemId);
    const used = await committed(tok, r.catalogItemId, [r.item, COMBO.item]);
    const free = held - used;
    console.log(`\n${r.label}: held ${held}, committed elsewhere ${used}, free ${free} -> qty ${r.qty}`);
    if (r.qty > free) { console.error(`   REFUSING: qty ${r.qty} would oversell, only ${free} free`); process.exit(1); }
    if (!APPLY) continue;
    const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${r.sku}`);
    inv.availability = { shipToLocationAvailability: { quantity: r.qty } };
    delete inv.sku;
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${r.sku}`, inv);
    const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${r.sku}`)).offers[0];
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
      availableQuantity: r.qty, categoryId: offer.categoryId,
      listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
      listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
      pricingSummary: offer.pricingSummary, tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
    });
    const after = await live(tok, r.item);
    console.log(`   live qty ${after.avail}${after.avail === r.qty ? ' verified' : '  DID NOT TAKE'}`);
    if (after.avail !== r.qty) process.exit(1);
  }
  if (!APPLY) console.log('\ndry run');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
