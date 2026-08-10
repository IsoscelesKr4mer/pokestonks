/**
 * Kill the DR+SS custom 30-pack combo and take the DR 36-pack lot to qty 3.
 *
 *   npx tsx scripts/kill-combo-bump-dr36.ts           # dry run
 *   npx tsx scripts/kill-combo-bump-dr36.ts --apply
 *
 * Michael's call on 2026-08-09. The combo (25 DR + 5 SS at $270) was built for
 * the IGAVO Vending buyer who then reneged, so it has been sitting unsold and
 * holding 25 DR packs hostage that are worth more inside 36-pack lots.
 *
 * ORDER MATTERS: withdraw the combo BEFORE raising the 36-lot, so the packs are
 * free before they are re-committed. Both steps are verified with Trading
 * GetItem, never with the Inventory API's own account of what it just did -
 * see reference_ebay_publish_verify_trading_api for why.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const COMBO_SKU = 'CUSTOM-IGAVOV-30PACK';
const COMBO_ITEM = '168591612747';
const LOT_SKU = 'DR-36LOT-R2';
const LOT_ITEM = '168519091676';
const DR_CI = 17236;
const PACKS_PER_LOT = 36;
const TARGET_UNITS = 3;

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
async function trueState(tok: string, itemId: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${itemId}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  });
  const x = await r.text();
  const p = (t: string) => x.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '?';
  const total = Number(p('Quantity')), sold = Number(p('QuantitySold'));
  return { status: p('ListingStatus'), total, sold, available: total - sold };
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const [h] = await sql`
    SELECT
      (SELECT COALESCE(SUM(quantity),0) FROM purchases WHERE catalog_item_id=${DR_CI} AND deleted_at IS NULL)
    - (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
       WHERE pu.catalog_item_id=${DR_CI} AND pu.deleted_at IS NULL) AS held`;
  const heldPacks = Number(h.held);
  const maxUnits = Math.floor(heldPacks / PACKS_PER_LOT);

  console.log(`DR packs held: ${heldPacks}`);
  console.log(`  ${TARGET_UNITS} lots x ${PACKS_PER_LOT} = ${TARGET_UNITS * PACKS_PER_LOT} packs committed, ${heldPacks - TARGET_UNITS * PACKS_PER_LOT} spare`);
  console.log(`  ceiling from inventory: ${maxUnits} lots`);
  if (TARGET_UNITS > maxUnits) {
    console.error(`REFUSING: ${TARGET_UNITS} lots needs ${TARGET_UNITS * PACKS_PER_LOT} packs, only ${heldPacks} held`);
    await sql.end();
    process.exit(1);
  }

  const tok = await userToken();
  const comboBefore = await trueState(tok, COMBO_ITEM);
  const lotBefore = await trueState(tok, LOT_ITEM);
  console.log(`\ncombo ${COMBO_ITEM}: ${comboBefore.status}, available ${comboBefore.available}, sold ${comboBefore.sold}`);
  console.log(`lot   ${LOT_ITEM}: ${lotBefore.status}, available ${lotBefore.available}, sold ${lotBefore.sold}`);

  if (comboBefore.sold > 0) {
    console.error('REFUSING: the combo has sales against it, ending it needs a look first');
    await sql.end();
    process.exit(1);
  }

  if (!APPLY) { console.log('\ndry run - pass --apply'); await sql.end(); return; }

  // 1. Kill the combo. withdrawOffer ends the listing but keeps the offer, so
  //    the 30-pack can be revived later without rebuilding it from scratch.
  const comboOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${COMBO_SKU}`);
  const comboOfferId = comboOffers.offers[0].offerId;
  try {
    await api(tok, 'POST', `/sell/inventory/v1/offer/${comboOfferId}/withdraw`);
  } catch (e) {
    console.log(`withdraw errored, verifying whether it applied: ${String(e).slice(0, 120)}`);
  }
  const comboAfter = await trueState(tok, COMBO_ITEM);
  console.log(`\ncombo now: ${comboAfter.status}`);
  if (comboAfter.status === 'Active') {
    console.error('combo is STILL ACTIVE - stopping before the packs get double-committed');
    await sql.end();
    process.exit(1);
  }

  // 2. Raise the 36-pack lot.
  const lotOffers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${LOT_SKU}`);
  const o = lotOffers.offers[0];
  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${LOT_SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: TARGET_UNITS } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${LOT_SKU}`, inv);
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${o.offerId}`, {
    availableQuantity: TARGET_UNITS, categoryId: o.categoryId, listingDescription: o.listingDescription,
    listingDuration: o.listingDuration, listingPolicies: o.listingPolicies,
    merchantLocationKey: o.merchantLocationKey, pricingSummary: o.pricingSummary, tax: o.tax,
  });

  const lotAfter = await trueState(tok, LOT_ITEM);
  console.log(`lot now: ${lotAfter.status}, total ${lotAfter.total}, sold ${lotAfter.sold}, AVAILABLE ${lotAfter.available}`);
  if (lotAfter.status !== 'Active' || lotAfter.available !== TARGET_UNITS) {
    console.error('lot did not land at the intended quantity');
    await sql.end();
    process.exit(1);
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
