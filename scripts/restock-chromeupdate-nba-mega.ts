/**
 * Restock CHROMEUPD-NBA-MEGA-R2 to qty 1 after the third Target box.
 * STAGES ONLY - the offer stays UNPUBLISHED until Michael says go.
 * Reviving this offer brings back listing 168596735852 with its watchers
 * and 3-sold history, rather than minting a cold SKU.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { quantityForPublish } from './lib/live-qty';
config({ path: '.env.local' });

const PUBLISH = process.argv.includes('--publish');
const SKU = 'CHROMEUPD-NBA-MEGA-R2';
const CI = 135078;
// 129.99 -> 149.99 on 2026-08-08, Michael's call to fish above the market on
// his last box. SportsCardsPro sold rows are FLAT, not rising: median $130.00
// on 08-06 and $128.99 on 08-07 across 19 sales. But real sales exist at
// $139.99, $149.98 and $169.95 in that window, the local shop is at $150, and
// with a single unit and no inventory pressure the only cost of asking high is
// time. Cut to $134.99 if it sits quiet.
const PRICE = '149.99';

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const [h] = await sql`
    SELECT
      (SELECT COALESCE(SUM(quantity),0) FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL)
    - (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
       WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL) AS held`;
  // Units booked against THIS listing, identified by a $129.99 unit price.
  // sale_price_cents is the LINE total, so a qty-2 order is 25998, not 12999 -
  // compare against 12999 x quantity or a multi-unit order looks unbooked.
  const [b] = await sql`
    SELECT COALESCE(SUM(s.quantity),0) AS booked FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
    WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL AND s.sale_price_cents = 12999 * s.quantity`;

  const tok = await userToken();
  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
  const o = offers.offers[0];
  const ebaySold = Number(o.listing?.soldQuantity ?? 0);

  const g = await quantityForPublish({
    sku: SKU, desiredQty: 1, heldQty: Number(h.held), loggedSales: Number(b.booked),
    getOffer: async () => o,
  });
  console.log(`vault held ${h.held} | this listing sold ${ebaySold} on eBay, ${b.booked} booked at $129.99`);
  console.log(`-> qty ${g.qty}${g.blocked ? ' BLOCKED' : ''} ${g.note ?? ''}`);
  if (g.blocked || g.qty < 1) { await sql.end(); process.exit(1); }

  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: g.qty } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inv);
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${o.offerId}`, {
    availableQuantity: g.qty, categoryId: o.categoryId, listingDescription: o.listingDescription,
    listingDuration: o.listingDuration, listingPolicies: o.listingPolicies,
    merchantLocationKey: o.merchantLocationKey,
    pricingSummary: { price: { value: PRICE, currency: 'USD' } }, tax: o.tax,
  });
  const after = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
  const a = after.offers[0];
  console.log(`offer ${a.offerId} qty ${a.availableQuantity} @ $${a.pricingSummary.price.value} status ${a.status} (listing ${a.listing?.listingId} ${a.listing?.listingStatus})`);

  if (!PUBLISH) { console.log('STAGED, not published - run with --publish to go live'); await sql.end(); return; }

  const pub = await api(tok, 'POST', `/sell/inventory/v1/offer/${a.offerId}/publish`);
  const itemId = String(pub.listingId);
  console.log(`published ${itemId}  https://www.ebay.com/itm/${itemId}`);
  console.log(itemId === '168596735852'
    ? 'same item number as before, so watchers and sold history carry over'
    : 'NEW item number - eBay did not revive the old listing, watchers are gone');

  // Mapping is per eBay item id, so a fresh item number needs its own row or
  // the sync will not decrement the vault when this sells.
  const exists = await sql`SELECT 1 FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`;
  if (exists.length === 0) {
    const [u] = await sql<{ user_id: string }[]>`
      SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
    await sql`
      INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
      VALUES (${u.user_id}, ${itemId}, ${sql.json([{ qty: 1, catalogItemId: CI }])})`;
    console.log(`mapped 1x ci${CI} per unit sold`);
  } else {
    console.log('mapping already present');
  }
  await sql.end();
}
main().catch(e => { console.error(String(e).slice(0, 600)); process.exit(1); });
