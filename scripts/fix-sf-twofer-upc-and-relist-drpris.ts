/**
 * Two jobs Michael greenlit with "list it all" on 2026-08-11:
 *
 *   1. Backfill the missing UPC on the live Shrouded Fable TWOFER. That
 *      listing has run since 2026-08-05 with NO UPC on either the offer or the
 *      inventory item, which is the same defect that made the NBA boxes
 *      invisible on release day. UPC 820650413513, read off his box.
 *   2. Relist the Prismatic Evolutions + Destined Rivals twofer at $159.99.
 *      Same combo sold at that exact price on 2026-07-28 (item 168570958691,
 *      buyer argpea0), and current sum-of-parts is $153-$169, so the proven
 *      number sits right in the band. No reason to move it.
 *
 *   npx tsx scripts/fix-sf-twofer-upc-and-relist-drpris.ts          # dry run
 *   npx tsx scripts/fix-sf-twofer-upc-and-relist-drpris.ts --write
 *
 * The DR+PE combo carries NO UPC on purpose: it is two different products in
 * one listing, so no single manufacturer barcode describes it. preflight is
 * told expectUpc:false rather than being bypassed.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight } from './lib/preflight';
config({ path: '.env.local' });

const WRITE = process.argv.includes('--write');

const SF_TWOFER_SKU = 'SF-BUNDLE-TWOFER';
const SF_UPC = '820650413513';

const DRPRIS_SKU = 'DRPRIS-TWOFER';
const DRPRIS_PRICE = '159.99';
const DRPRIS_COST = 30.0 + 30.0; // PE bundle $30.00 + DR bundle $30.00, both vending

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
async function getItem(tok: string, itemId: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  return g.text();
}

async function main() {
  const netDrpris = Number(DRPRIS_PRICE) - ((Number(DRPRIS_PRICE) + 11) * 0.1325 + 0.4);
  console.log(`1) SF twofer ${SF_TWOFER_SKU}: backfill UPC ${SF_UPC}`);
  console.log(`2) ${DRPRIS_SKU}: relist at $${DRPRIS_PRICE}`);
  console.log(`   cost $${DRPRIS_COST.toFixed(2)} (PE $30 + DR $30) | net ~$${netDrpris.toFixed(2)} | profit ~$${(netDrpris - DRPRIS_COST).toFixed(2)}`);
  console.log(`   sold at this exact price 2026-07-28; sum-of-parts today $153-$169`);

  const pf = await preflight({
    sku: DRPRIS_SKU, title: 'Pokemon TCG Prismatic Evolutions + Destined Rivals Booster Bundle Lot Sealed',
    priceCents: Math.round(Number(DRPRIS_PRICE) * 100),
    costCentsPerUnit: Math.round(DRPRIS_COST * 100), unitsPerListing: 1,
    upc: null, expectUpc: false,
    imageUrls: ['https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/dr_prismatic_twofer_front.jpg'],
  });
  for (const w of pf.warnings ?? []) console.log(`   warning: ${w}`);
  for (const e of pf.errors ?? []) console.log(`   ERROR: ${e}`);
  if ((pf.errors ?? []).length) { console.error('preflight failed'); process.exit(1); }
  console.log('   preflight ok');

  if (!WRITE) { console.log('\ndry run'); return; }
  const tok = await userToken();

  // ---- 1. SF twofer UPC backfill -------------------------------------------
  const sfInv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SF_TWOFER_SKU}`);
  sfInv.product = { ...(sfInv.product ?? {}), upc: [SF_UPC] };
  delete sfInv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SF_TWOFER_SKU}`, sfInv);
  const sfOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SF_TWOFER_SKU}`);
  const sfOffer = sfOffers.offers[0];
  try {
    await api(tok, 'POST', `/sell/inventory/v1/offer/${sfOffer.offerId}/publish`);
  } catch (e) {
    console.log(`   SF republish reported an error, verifying anyway: ${String(e).slice(0, 100)}`);
  }
  const sfXml = await getItem(tok, String(sfOffer.listing.listingId));
  console.log(`SF twofer ${sfOffer.listing.listingId}: UPC now ${sfXml.match(/<UPC>([^<]*)</)?.[1] ?? 'STILL MISSING'}, qty ${sfXml.match(/<Quantity>([^<]*)</)?.[1]}, $${sfXml.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}`);

  // ---- 2. DR + PE relist ----------------------------------------------------
  const dpInv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${DRPRIS_SKU}`);
  dpInv.availability = { shipToLocationAvailability: { quantity: 1 } };
  delete dpInv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${DRPRIS_SKU}`, dpInv);

  const dpOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${DRPRIS_SKU}`);
  const dpOffer = dpOffers.offers?.[0];
  if (!dpOffer) throw new Error(`no offer for ${DRPRIS_SKU}`);
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${dpOffer.offerId}`, {
    availableQuantity: 1,
    categoryId: dpOffer.categoryId,
    listingDescription: dpOffer.listingDescription,
    listingDuration: dpOffer.listingDuration,
    listingPolicies: dpOffer.listingPolicies,
    merchantLocationKey: dpOffer.merchantLocationKey,
    pricingSummary: { price: { value: DRPRIS_PRICE, currency: 'USD' } },
    tax: dpOffer.tax,
  });
  let dpItemId = String(dpOffer.listing?.listingId ?? '');
  try {
    dpItemId = String((await api(tok, 'POST', `/sell/inventory/v1/offer/${dpOffer.offerId}/publish`)).listingId);
  } catch (e) {
    console.log(`   DR+PE publish reported an error, checking whether it applied: ${String(e).slice(0, 120)}`);
    dpItemId = String((await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${DRPRIS_SKU}`)).offers[0]?.listing?.listingId ?? dpItemId);
  }
  const dpXml = await getItem(tok, dpItemId);
  const status = dpXml.match(/<ListingStatus>([^<]*)</)?.[1];
  console.log(`DR+PE ${dpItemId}: ${status} @ $${dpXml.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${dpXml.match(/<Quantity>([^<]*)</)?.[1]}, hidden ${dpXml.match(/<HideFromSearch>([^<]*)</)?.[1]}`);
  console.log(`  https://www.ebay.com/itm/${dpItemId}`);
  if (status !== 'Active') { console.error('DR+PE is NOT Active, needs a look'); process.exit(1); }
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
