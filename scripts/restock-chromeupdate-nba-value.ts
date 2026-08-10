/**
 * Bump the Chrome Update NBA Value/Blaster box listing to match what Michael
 * actually holds after the 2026-08-08 Target buy.
 *
 *   npx tsx scripts/restock-chromeupdate-nba-value.ts           # dry run
 *   npx tsx scripts/restock-chromeupdate-nba-value.ts --apply   # write
 *
 * The listing (168594314671) is ACTIVE, so unlike the mega box this one can be
 * revised in place - no new SKU needed. Confirmed via Trading GetItem, which
 * is the only source worth believing about listing state.
 *
 * QUANTITY SEMANTICS, the thing that caused the 2026-08-07 oversell:
 *   Trading  Quantity      = LIFETIME total ever offered (2), includes sold
 *   Trading  QuantitySold  = 1
 *   available to buyers    = 2 - 1 = 1
 *   Inventory availableQuantity = 1, i.e. AVAILABLE, not lifetime
 * So to give Michael 2 available, set Inventory availableQuantity = 2 and
 * eBay moves the Trading total to 3. Do NOT set the Trading total directly.
 *
 * COST: $44.99 + 10.55% WA tax = $49.74. Michael confirmed the $44.99 shelf
 * price on 2026-08-08. No reward certificate on this one, unlike the Dick's
 * release-day lots at $45.00 list that carried a share of the $20 certificate.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { quantityForPublish } from './lib/live-qty';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const SKU = 'CHROMEUPD-NBA-VALUE';
const ITEM_ID = '168594314671';
const CI = 135079;
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const COST_CENTS = 4974; // $44.99 confirmed by Michael + 10.55% WA tax
const DESIRED_AVAILABLE = 2;

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

/** Trading GetItem. The Inventory API cannot be trusted to describe itself. */
async function trueListingState(tok: string, itemId: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`,
  });
  const xml = await r.text();
  const pick = (t: string) => xml.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? '?';
  const total = Number(pick('Quantity'));
  const sold = Number(pick('QuantitySold'));
  return { status: pick('ListingStatus'), hidden: pick('HideFromSearch'), total, sold, available: total - sold };
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const already = await sql`
    SELECT id FROM purchases
    WHERE catalog_item_id=${CI} AND purchase_date='2026-08-08' AND deleted_at IS NULL`;

  if (already.length) console.log(`purchase already logged: #${already.map((r: any) => r.id).join(', #')}`);
  else if (!APPLY) console.log(`would log 1x ci${CI} @ $${(COST_CENTS / 100).toFixed(2)}`);
  else {
    const [p] = await sql`
      INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
      VALUES (${USER}, ${CI}, '2026-08-08', 1, ${COST_CENTS}, 'Target',
        'Third Target run, same trip as mega lot #542. $44.99 shelf price confirmed by Michael, + 10.55% tax = $49.74. No reward certificate on this one.')
      RETURNING id`;
    console.log(`logged purchase #${p.id}: 1x ci${CI} @ $${(COST_CENTS / 100).toFixed(2)}`);
  }

  const [h] = await sql`
    SELECT
      (SELECT COALESCE(SUM(quantity),0) FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL)
    - (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
       WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL) AS held`;
  const [b] = await sql`
    SELECT COALESCE(SUM(s.quantity),0) AS booked FROM sales s JOIN purchases pu ON pu.id=s.purchase_id
    WHERE pu.catalog_item_id=${CI} AND pu.deleted_at IS NULL`;

  const tok = await userToken();
  const before = await trueListingState(tok, ITEM_ID);
  console.log(`listing ${ITEM_ID}: ${before.status}, total ${before.total}, sold ${before.sold}, available ${before.available}`);
  console.log(`vault held ${h.held}, sales booked ${b.booked}`);

  const g = await quantityForPublish({
    sku: SKU, desiredQty: DESIRED_AVAILABLE, heldQty: Number(h.held), loggedSales: Number(b.booked),
    getOffer: async () => ({ listing: { soldQuantity: before.sold } }),
  });
  console.log(`-> available ${g.qty} ${g.note}`);
  if (g.blocked) { await sql.end(); process.exit(1); }

  if (!APPLY) { console.log('\ndry run - pass --apply to write'); await sql.end(); return; }

  const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${SKU}`);
  const o = offers.offers[0];
  const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${SKU}`);
  inv.availability = { shipToLocationAvailability: { quantity: g.qty } };
  delete inv.sku;
  await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${SKU}`, inv);
  await api(tok, 'PUT', `/sell/inventory/v1/offer/${o.offerId}`, {
    availableQuantity: g.qty, categoryId: o.categoryId, listingDescription: o.listingDescription,
    listingDuration: o.listingDuration, listingPolicies: o.listingPolicies,
    merchantLocationKey: o.merchantLocationKey, pricingSummary: o.pricingSummary, tax: o.tax,
  });

  const after = await trueListingState(tok, ITEM_ID);
  console.log(`after: ${after.status}, total ${after.total}, sold ${after.sold}, AVAILABLE ${after.available}, hidden ${after.hidden}`);
  if (after.status !== 'Active' || after.available !== g.qty) {
    console.error('did not land as intended - do not report this as done');
    await sql.end();
    process.exit(1);
  }
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
