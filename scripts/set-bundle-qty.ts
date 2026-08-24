/**
 * Set the quantity on a sealed-product listing, refusing to oversell.
 *
 *   npx tsx scripts/set-bundle-qty.ts PE-BUNDLE-SINGLE 3
 *   npx tsx scripts/set-bundle-qty.ts PE-BUNDLE-SINGLE 3 --apply
 *
 * Reusable because this keeps coming up: stock arrives from a vending drop, or
 * is freed by ending another listing, and a live listing needs to absorb it.
 *
 * The guard is the point. Held comes from the vault (purchases minus sales,
 * rips and decompositions) and commitments are counted ONLY against listings
 * that are still Active on eBay, because a mapping on a Completed listing
 * commits nothing. Counting the mappings table alone once suggested 5 Prismatic
 * bundles were committed against 2 held.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const [, , SKU, QTY_ARG] = process.argv;
const APPLY = process.argv.includes('--apply');
const QTY = Number(QTY_ARG);
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

/**
 * sku -> the listing and the catalog item it draws from.
 *
 * perUnit is how many of the catalog item ONE listing unit consumes, matching
 * the mapping row. It is 1 for a plain single but 4 for an art-set listing, and
 * the oversell guard compares packs to packs, so it has to be right.
 */
const KNOWN: Record<string, { item: string; catalogItemId: number; label: string; perUnit?: number }> = {
  'PE-BUNDLE-SINGLE': { item: '168617484171', catalogItemId: 19776, label: 'Prismatic Evolutions Booster Bundle' },
  'DR-BUNDLE-SINGLE': { item: '168617483804', catalogItemId: 17235, label: 'Destined Rivals Booster Bundle' },
  'SF-BUNDLE-SINGLE': { item: '168606265372', catalogItemId: 5283, label: 'Shrouded Fable Booster Bundle' },
  'DR-SLEEVED-ARTSET4': { item: '168623627775', catalogItemId: 17232, label: 'Destined Rivals Sleeved Booster Pack, art set of 4', perUnit: 4 },
  'DR-LOOSE-ARTSET4': { item: '168623729004', catalogItemId: 17236, label: 'Destined Rivals Booster Pack, art set of 4', perUnit: 4 },
  'DR-36LOT-R2': { item: '168519091676', catalogItemId: 17236, label: 'Destined Rivals 36 Sealed Booster Packs Lot', perUnit: 36 },
};

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
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

async function main() {
  const cfg = KNOWN[SKU];
  if (!cfg || !Number.isInteger(QTY) || QTY < 0) {
    console.error(`usage: set-bundle-qty.ts <${Object.keys(KNOWN).join('|')}> <qty> [--apply]`);
    process.exit(1);
  }
  const tok = await userToken();

  const [h]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${cfg.catalogItemId} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  const held = Number(h.held);

  const rows: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  let elsewhere = 0;
  for (const row of rows) {
    const id = String(row.ebay_item_id);
    if (id === cfg.item) continue;
    const hit = ((row.mappings as any[]) ?? []).filter((m) => Number(m.catalogItemId) === cfg.catalogItemId);
    if (!hit.length) continue;
    const l = await live(tok, id);
    if (l.status !== 'Active') continue;
    for (const m of hit) elsewhere += Number(m.qty) * l.avail;
    console.log(`  committed elsewhere: ${id} Active, ${hit.map((m: any) => `${m.qty}x`).join('+')} x ${l.avail}`);
  }
  const free = held - elsewhere;
  const now = await live(tok, cfg.item);

  const perUnit = cfg.perUnit ?? 1;
  const needed = QTY * perUnit;

  console.log(`${cfg.label}`);
  console.log(`  held ${held}, committed to other Active listings ${elsewhere}, free ${free}`);
  console.log(`  listing ${cfg.item} [${now.status}] $${now.price}  qty ${now.avail} -> ${QTY}`);
  if (perUnit !== 1) console.log(`  ${perUnit}x per unit, so ${QTY} units needs ${needed} of ${free} free`);
  if (needed > free) { console.error(`  REFUSING: ${QTY} units needs ${needed}, only ${free} free`); process.exit(1); }
  if (now.status !== 'Active') { console.error('  listing is not Active'); process.exit(1); }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: QTY } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inv);
  const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`)).offers[0];
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
    availableQuantity: QTY, categoryId: offer.categoryId,
    listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
    listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
    pricingSummary: offer.pricingSummary, tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
  });
  const after = await live(tok, cfg.item);
  console.log(`  live qty now ${after.avail}, price still $${after.price}`);
  if (after.avail !== QTY) { console.error('  DID NOT TAKE'); process.exit(1); }
  console.log('  verified');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
