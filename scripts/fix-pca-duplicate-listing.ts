/**
 * Fold the duplicate Pete Crow-Armstrong listing back into the existing one.
 *
 *   npx tsx scripts/fix-pca-duplicate-listing.ts          # dry run
 *   npx tsx scripts/fix-pca-duplicate-listing.ts --write
 *
 * Michael, 2026-08-14: "why did you make a new pca listing when i already have
 * the same card listed as a quantity 2". Fair. He owns THREE copies of 2026
 * Topps Chrome Pete Crow-Armstrong #45 base:
 *
 *   #218 and #316 -> item 168584893860, SKU BBC-218, qty 2, $14.49   (correct)
 *   #337          -> item 168612706502, SKU BBC-337, qty 1, $12.99   (my duplicate)
 *
 * The right shape was already sitting in the data: two vault rows sharing one
 * listing with qty 2. list-single-cards.ts does not look for an existing
 * listing of the same card before creating one, so it minted a second listing
 * for the same card at a different price. This is the SECOND time the same PCA
 * has ended up double-listed at two prices.
 *
 * Fix: end the new listing, take the original to qty 3, repoint #337 at it.
 * Price stays $14.49, the live number, which also sits under the fresh $16.99
 * comp median rather than the $12.99 my run produced.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');
const DUP_ITEM = '168612706502';
const DUP_SKU = 'BBC-337';
const KEEP_ITEM = '168584893860';
const KEEP_SKU = 'BBC-218';
const NEW_QTY = 3;
const PRICE_CENTS = 1449;

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
  return j.access_token as string;
}
async function api(tok: string, m: string, p: string, b?: any) {
  const r = await fetch(`https://api.ebay.com${p}`, {
    method: m,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' },
    body: b === undefined ? undefined : JSON.stringify(b),
  });
  const t = await r.text();
  if (r.status >= 300) throw new Error(`${m} ${p} -> ${r.status} ${t.slice(0, 250)}`);
  return t ? JSON.parse(t) : null;
}
async function getItem(tok: string, id: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID></GetItemRequest>`,
  });
  return g.text();
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const rows: any = await sql`SELECT id, asking_price_cents, ebay_item_id, status FROM baseball_cards WHERE id IN (218,316,337) ORDER BY id`;
  console.log('PCA #45 base rows:');
  for (const r of rows) console.log(`  #${r.id} $${((r.asking_price_cents ?? 0) / 100).toFixed(2)} item=${r.ebay_item_id} ${r.status}`);
  console.log(`\nend ${DUP_ITEM}, take ${KEEP_ITEM} to qty ${NEW_QTY}, repoint #337`);

  if (!WRITE) { console.log('\ndry run'); await sql.end(); return; }
  const tok = await userToken();

  // 1. withdraw the duplicate offer
  const dupOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${DUP_SKU}`);
  const dupOffer = dupOffers.offers?.[0];
  if (dupOffer && String(dupOffer.listing?.listingId ?? '') === DUP_ITEM) {
    await api(tok, 'POST', `/sell/inventory/v1/offer/${dupOffer.offerId}/withdraw`);
    console.log(`withdrew duplicate offer ${dupOffer.offerId}`);
  } else {
    console.log('duplicate offer not found or already gone');
  }

  // 2. original to qty 3
  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${KEEP_SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: NEW_QTY } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${KEEP_SKU}`, inv);
  const keepOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${KEEP_SKU}`);
  const ko = keepOffers.offers[0];
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${ko.offerId}`, {
    sku: KEEP_SKU, marketplaceId: ko.marketplaceId, format: ko.format,
    availableQuantity: NEW_QTY, categoryId: ko.categoryId,
    merchantLocationKey: ko.merchantLocationKey, listingDescription: ko.listingDescription,
    listingDuration: ko.listingDuration, listingPolicies: ko.listingPolicies,
    pricingSummary: ko.pricingSummary, tax: ko.tax,
  });

  // 3. repoint the vault row
  await sql`UPDATE baseball_cards
    SET ebay_item_id=${KEEP_ITEM}, ebay_sku=${KEEP_SKU}, asking_price_cents=${PRICE_CENTS},
        notes = coalesce(notes,'') || ' Folded into the existing PCA listing 168584893860 on 2026-08-14; I had created a duplicate listing for a card Michael already had up at qty 2.'
    WHERE id=337`;

  // verify both ends
  const dx = await getItem(tok, DUP_ITEM);
  const kx = await getItem(tok, KEEP_ITEM);
  console.log(`duplicate ${DUP_ITEM}: ${dx.match(/<ListingStatus>([^<]*)</)?.[1]}`);
  console.log(`kept ${KEEP_ITEM}: ${kx.match(/<ListingStatus>([^<]*)</)?.[1]} @ $${kx.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${kx.match(/<Quantity>([^<]*)</)?.[1]}`);
  const after: any = await sql`SELECT id, asking_price_cents, ebay_item_id FROM baseball_cards WHERE id IN (218,316,337) ORDER BY id`;
  for (const r of after) console.log(`  #${r.id} $${(r.asking_price_cents / 100).toFixed(2)} item=${r.ebay_item_id}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
