/**
 * Read-only: what is the state of the F1 mega box listing and the order that
 * the buyer asked to cancel?
 *
 *   npx tsx scripts/check-f1-cancel-1029.ts
 *
 * Michael, 2026-10-29: "Someone bought an f1 box and the requested to cancel
 * 10 minutes later claiming it was the wrong address... I need my quantity to
 * go back to 8."
 *
 * Three questions, and nothing is written until all three are answered:
 *   1. what does the live listing say now (qty, sold)
 *   2. where is the cancellation (requested / approved / closed), because
 *      restoring the quantity before the cancel completes would oversell
 *   3. did the sale get booked into pokestonks, which would have to come back
 *      out so the box does not read as gone
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
config({ path: '.env.local' });

const ITEM_ID = '168812159614';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const [kk, v] of Object.entries(o)) {
      if (kk === k && typeof v === 'string') return v;
      const f = fk(v, k);
      if (f) return f;
    }
  }
  return undefined;
}

async function token(scope: string): Promise<string> {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!,
      scope,
    }).toString(),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token as string;
}

async function trading(tok: string, call: string, xml: string): Promise<string> {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call,
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xml,
  });
  return r.text();
}

function pick(xml: string, tag: string): string | null {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  const i = xml.indexOf(open);
  if (i < 0) return null;
  const gt = xml.indexOf('>', i);
  const j = xml.indexOf(close, gt);
  if (gt < 0 || j < 0) return null;
  return xml.slice(gt + 1, j);
}

async function main() {
  // 1. the live listing
  const inv = await token('https://api.ebay.com/oauth/api_scope/sell.inventory');
  const xml = await trading(
    inv,
    'GetItem',
    '<?xml version="1.0" encoding="utf-8"?>' +
      '<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
      `<ItemID>${ITEM_ID}</ItemID><DetailLevel>ReturnAll</DetailLevel>` +
      '</GetItemRequest>'
  );
  console.log('LISTING');
  console.log('  title   ', pick(xml, 'Title'));
  console.log('  status  ', pick(xml, 'ListingStatus'));
  console.log('  price   ', pick(xml, 'CurrentPrice'));
  console.log('  quantity', pick(xml, 'Quantity'), '(eBay reports TOTAL here)');
  console.log('  sold    ', pick(xml, 'QuantitySold'));
  console.log('  watchers', pick(xml, 'WatchCount'));
  console.log('  accept  ', pick(xml, 'BestOfferAutoAcceptPrice'));
  console.log('  decline ', pick(xml, 'MinimumBestOfferPrice'));

  // 2. the order and its cancellation
  const ful = await token('https://api.ebay.com/oauth/api_scope/sell.fulfillment');
  const since = new Date(Date.now() - 14 * 86400_000).toISOString().replace(/\.\d+Z$/, '.000Z');
  const r = await fetch(
    'https://api.ebay.com/sell/fulfillment/v1/order?limit=100&filter=' +
      encodeURIComponent(`creationdate:[${since}..]`),
    { headers: { Authorization: 'Bearer ' + ful } }
  );
  const body: any = await r.json();
  if (!r.ok) {
    console.log('\ngetOrders failed:', r.status, JSON.stringify(body).slice(0, 400));
  } else {
    const hits = (body.orders || []).filter((o: any) =>
      (o.lineItems || []).some((li: any) => li.legacyItemId === ITEM_ID)
    );
    console.log(`\nORDERS touching ${ITEM_ID} in the last 14 days: ${hits.length}`);
    for (const o of hits) {
      console.log(`\n  order ${o.orderId}   ${o.creationDate}`);
      console.log(`    fulfillment status ${o.orderFulfillmentStatus}   payment ${o.orderPaymentStatus}`);
      console.log(`    cancelState ${o.cancelStatus?.cancelState}  requests ${JSON.stringify(o.cancelStatus?.cancelRequests || [])}`);
      console.log(`    sellerActionsRequired ${JSON.stringify(o.sellerActionsRequired || [])}`);
      console.log(`    total ${o.pricingSummary?.total?.value}  fee ${o.totalMarketplaceFee?.value}`);
      for (const li of o.lineItems || []) {
        console.log(`    line ${li.lineItemId}  qty ${li.quantity}  ${li.lineItemCost?.value}  ${li.title?.slice(0, 60)}`);
      }
      console.log(`    ship to ${o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.city}, ${o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress?.stateOrProvince}`);
    }
  }

  // 3. pokestonks: is a sale booked, and what does the lot look like
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });
  const sales = await sql`select s.id, s.purchase_id, s.sale_date::text d, s.quantity,
      s.sale_price_cents, s.fees_cents, s.platform, s.notes
    from sales s where s.sale_date >= '2026-10-20' order by s.sale_date desc, s.id desc`;
  console.log(`\nSALES booked since 2026-10-20: ${sales.length}`);
  for (const s of sales) {
    console.log(`  sale${s.id}  ${s.d}  pu${s.purchase_id}  x${s.quantity}  $${(s.sale_price_cents / 100).toFixed(2)}  ${s.platform}`);
    if (s.notes) console.log(`      ${String(s.notes).slice(0, 160)}`);
  }

  const maps = await sql`select * from ebay_listing_mappings where ebay_item_id = ${ITEM_ID}`;
  console.log(`\nMAPPINGS for ${ITEM_ID}: ${maps.length}`);
  for (const m of maps) console.log('  ', JSON.stringify(m));

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
