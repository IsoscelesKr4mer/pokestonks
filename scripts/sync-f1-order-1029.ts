/**
 * Book an F1 mega order off eBay.
 *
 *   npx tsx scripts/sync-f1-order-1029.ts --order 04-15372-93836 --qty 1
 *   npx tsx scripts/sync-f1-order-1029.ts --order 04-15372-93836 --qty 1 --apply
 *
 * Michael, 2026-10-29: "4 F1 boxes sold", then two hours later "oh i osld
 * another f1 box". The order id and the quantity I expect to find are
 * arguments rather than constants because this listing is now selling often
 * enough that a per-order copy of the script is a worse record than one
 * script with the order named on the command line. `--qty` is not used to
 * BOOK anything, only to assert against what the API returns: if eBay says a
 * different number, the run stops rather than quietly booking the wrong
 * count.
 *
 * Reads the order live from the Fulfillment API rather than taking the figures
 * from a screenshot or from me, then follows the same shape the app's own sync
 * uses (`app/api/ebay/sync-confirm/route.ts`, and the one-off
 * `scripts/sync-order-*.ts`): FIFO against open lots, one sales row per lot,
 * a shared `sale_group_id`, and a row in `ebay_synced_orders` so the app will
 * not book this order a second time.
 *
 * Revenue is the ITEM SUBTOTAL only. Shipping is a wash - the buyer pays it and
 * it goes straight back out as a label - so it never counts as revenue, while
 * the eBay fee is charged on the full order total including shipping and tax
 * ([[feedback_ebay_shipping_wash]], [[reference_ebay_fee_rate]]).
 *
 * WHY THIS ONE IS WORTH NOTING. The buyer is in Damascus OR and paid the full
 * $109.99 a box, four of them, about two hours after Best Offer came off the
 * listing. Two of the three offers declined to make that possible were from
 * Oregon, one of them 7 boxes at $102. So the no-offers call did not cost the
 * $50 it looked like it might; on these four alone it took $35.88 more than
 * the best offer on the table would have.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const ORDER_ID = arg('order');
const EXPECT_QTY = Number(arg('qty'));
if (!ORDER_ID || !Number.isInteger(EXPECT_QTY) || EXPECT_QTY < 1) {
  console.error('usage: --order <ebay order id> --qty <boxes> [--apply]');
  process.exit(1);
}

const ITEM_ID = '168812159614';
const CATALOG = 135619;
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

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

async function token(): Promise<string> {
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
      scope: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    }).toString(),
  });
  const j: any = await r.json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

const cents = (v: string | undefined) => Math.round(Number(v ?? '0') * 100);
const usd = (c: number) => '$' + (c / 100).toFixed(2);

async function main() {
  const tok = await token();
  const r = await fetch(`https://api.ebay.com/sell/fulfillment/v1/order/${ORDER_ID}`, {
    headers: { Authorization: 'Bearer ' + tok },
  });
  const o: any = await r.json();
  if (!r.ok) throw new Error('getOrder failed: ' + JSON.stringify(o).slice(0, 300));

  if (o.cancelStatus?.cancelState !== 'NONE_REQUESTED') {
    console.log(`order cancelState is ${o.cancelStatus?.cancelState}; refusing to book it.`);
    return;
  }
  if (o.orderPaymentStatus !== 'PAID') {
    console.log(`order payment is ${o.orderPaymentStatus}; refusing to book an unpaid order.`);
    return;
  }

  const lines = (o.lineItems || []).filter((li: any) => li.legacyItemId === ITEM_ID);
  if (lines.length !== 1) throw new Error(`expected 1 line for ${ITEM_ID}, found ${lines.length}`);
  const line = lines[0];
  const qty = Number(line.quantity);
  if (qty !== EXPECT_QTY) throw new Error(`line is qty ${qty}, expected ${EXPECT_QTY}`);

  const revenue = cents(line.lineItemCost?.value);       // item subtotal, shipping excluded
  const shipping = cents(line.deliveryCost?.shippingCost?.value);
  const tax = cents(line.tax?.[0]?.amount?.value);
  const total = cents(o.pricingSummary?.total?.value);
  const fees = cents(o.totalMarketplaceFee?.value);

  // PDT is UTC-7, and a DATE column must hold the day he actually sold it.
  const saleDate = new Date(new Date(o.creationDate).getTime() - 7 * 3600_000)
    .toISOString()
    .slice(0, 10);

  const addr = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo?.contactAddress;
  console.log(`order ${ORDER_ID}  ${o.creationDate}  -> sale_date ${saleDate}`);
  console.log(`  ${qty} x ${line.title?.slice(0, 50)}`);
  console.log(`  item ${usd(revenue)}   shipping ${usd(shipping)}   tax ${usd(tax)}   order total ${usd(total)}`);
  console.log(`  eBay fee ${usd(fees)}  (${((fees / total) * 100).toFixed(2)}% of the full total)`);
  console.log(`  ship to ${addr?.city}, ${addr?.stateOrProvince}`);
  console.log(`  revenue booked as the item subtotal only: ${usd(revenue)}`);

  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const dup = await sql`select 1 from ebay_synced_orders where ebay_order_id = ${ORDER_ID}`;
  if (dup.length) {
    console.log('\nalready synced, nothing to do.');
    await sql.end();
    return;
  }

  // FIFO over open lots, same ordering rule the app uses.
  const lots = await sql`select p.id, p.purchase_date::text d, p.created_at::text c, p.cost_cents,
      (p.quantity
        - (select count(*)::int from rips x where x.source_purchase_id = p.id)
        - (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id)
        - coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0))::int avail
    from purchases p where p.catalog_item_id = ${CATALOG} and p.deleted_at is null
    order by p.purchase_date, p.created_at, p.id`;
  const open = lots.filter((l: any) => l.avail > 0);
  const availTotal = open.reduce((n: number, l: any) => n + l.avail, 0);
  console.log(`\nopen lots: ${open.length}, ${availTotal} available`);
  for (const l of open) console.log(`  pu${l.id}  ${l.d}  ${l.avail} @ ${usd(l.cost_cents)}`);
  if (availTotal < qty) throw new Error(`only ${availTotal} available, selling ${qty}`);

  let rem = qty;
  const rows: { pid: number; q: number; rev: number; fee: number; cost: number }[] = [];
  for (const l of open) {
    if (!rem) break;
    const take = Math.min(rem, l.avail);
    rows.push({ pid: l.id, q: take, rev: 0, fee: 0, cost: take * l.cost_cents });
    rem -= take;
  }
  // Split revenue and fees by unit, remainder onto the last row so the rows
  // re-add to the order exactly rather than drifting by a cent.
  let revLeft = revenue;
  let feeLeft = fees;
  rows.forEach((row, i) => {
    const last = i === rows.length - 1;
    row.rev = last ? revLeft : Math.floor((revenue * row.q) / qty);
    row.fee = last ? feeLeft : Math.floor((fees * row.q) / qty);
    revLeft -= row.rev;
    feeLeft -= row.fee;
  });
  if (revLeft !== 0 || feeLeft !== 0) throw new Error('split did not reconcile');

  const cost = rows.reduce((n, r) => n + r.cost, 0);
  console.log('\nwould write:');
  for (const r of rows) {
    console.log(`  pu${r.pid}  x${r.q}  ${usd(r.rev)} rev  ${usd(r.fee)} fee  ${usd(r.cost)} cost`);
  }
  console.log(
    `\n  ${usd(revenue)} revenue - ${usd(fees)} fees - ${usd(cost)} cost = ` +
      `${usd(revenue - fees - cost)} realised on ${qty} boxes ` +
      `(${usd(Math.round((revenue - fees - cost) / qty))} each).`
  );

  if (!APPLY) {
    console.log('\ndry run - pass --apply to write');
    await sql.end();
    return;
  }

  const notes =
    `eBay order ${ORDER_ID}, item ${ITEM_ID}. ${qty} x F1 mega at $109.99 = ${usd(revenue)}, ` +
    `plus ${usd(shipping)} buyer-paid shipping and ${usd(tax)} tax = ${usd(total)} order total; ` +
    `eBay fee ${usd(fees)}. Revenue booked as the item subtotal only, shipping is a wash. ` +
    `Buyer in ${addr?.city}, ${addr?.stateOrProvince}. Bought at full ask about two hours after ` +
    `Best Offer was switched off on this listing.`;

  const sgid = randomUUID();
  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`insert into sales (user_id, sale_group_id, purchase_id, sale_date, quantity,
          sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
        values (${USER}, ${sgid}, ${r.pid}, ${saleDate}, ${r.q},
          ${r.rev}, ${r.fee}, ${r.cost}, 'eBay', ${notes})`;
    }
    await tx`insert into ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped)
      values (${USER}, ${ORDER_ID}, ${sgid}, false)`;
  });
  console.log(`\nwrote ${rows.length} sale row(s), group ${sgid}`);

  const after = await sql`select (p.quantity
        - (select count(*)::int from rips x where x.source_purchase_id = p.id)
        - (select count(*)::int from box_decompositions b where b.source_purchase_id = p.id)
        - coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0))::int avail
    from purchases p where p.catalog_item_id = ${CATALOG} and p.deleted_at is null`;
  const held = after.reduce((n: number, l: any) => n + l.avail, 0);
  console.log(
    held === availTotal - qty
      ? `VERIFIED: ${held} F1 megas held, down from ${availTotal}.`
      : `WARNING: ${held} held, expected ${availTotal - qty}.`
  );

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
