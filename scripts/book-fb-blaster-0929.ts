/**
 * Book the first Bowman Football blaster.
 *
 *   npx tsx scripts/book-fb-blaster-0929.ts
 *
 * "sold one of my bowman football blasters"
 *
 * eBay order 04-15242-54947, item 168737029255, 2026-09-29 18:49Z.
 *
 *   item       $39.99
 *   shipping    10.11   calculated, buyer paid
 *   total      $50.10   -> the fee base
 *   fee        -$7.04   13.25% of 50.10 + 0.40
 *   cost      -$32.49   pu634
 *   profit     +$0.46
 *
 * THE CUT IS WHAT SOLD IT. Listed 09-28 at $49.99 and sat with no views; cut to
 * $39.99 to become the cheapest of 27 and it went in about eighteen hours. Same
 * shape as the Lorcana bundle four days earlier.
 *
 * **$0.46 IS HOSTAGE TO THE LABEL.** The buyer paid $10.11 of calculated
 * shipping off a package I declared 9x7x3 at 1 lb WITHOUT WEIGHING IT - the
 * identical setup that turned the Lorcana bundle into a $15 loss. If the real
 * label prints over $10.57 this sale is negative. He needs to weigh it before
 * buying postage, and the remaining blaster should quote off a scale reading.
 *
 * Booked at the quoted shipping for now, i.e. assuming the label matches. That
 * assumption is stated here so the correction is cheap if it does not.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '04-15242-54947';
const DATE = '2026-09-29';
const REVENUE = 3999;   // item subtotal, shipping excluded per the wash rule
const FEES = 704;       // 13.25% of the $50.10 order total + $0.40
const LOT = 634;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('Blaster')) throw new Error('pu' + LOT + ' is ' + p.name);
  const open = p.quantity - p.sold;
  if (open < 1) throw new Error('pu' + LOT + ' has nothing open');

  const [dupe] = await sql`select count(*)::int n from ebay_synced_orders where ebay_order_id = ${ORDER}`;
  if (dupe.n) { console.log('already booked'); await sql.end(); return; }

  const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
      sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
    values (${USER}, ${LOT}, ${DATE}, 1, ${REVENUE}, ${FEES}, ${p.cost_cents}, 'eBay',
      ${'eBay order ' + ORDER + '. Item $39.99 plus $10.11 calculated shipping = $50.10; '
        + 'revenue is the item subtotal with the label out, fee computed on the full total. '
        + 'Sold about 18 hours after the cut from $49.99 to $39.99 made it the cheapest of 27, '
        + 'while every competitor was still a presale against a 09-30 street date. '
        + 'WARNING: the $0.46 margin assumes the label matches the $10.11 quoted off a 9x7x3 '
        + 'at 1 lb declaration that was never weighed. Anything over $10.57 and this is a loss.'})
    returning id`;
  console.log('sale#' + s.id + '  x1  rev $' + (REVENUE / 100).toFixed(2)
    + '  fees $' + (FEES / 100).toFixed(2) + '  cost $' + (p.cost_cents / 100).toFixed(2)
    + '  profit $' + ((REVENUE - FEES - p.cost_cents) / 100).toFixed(2));
  console.log('  pu' + LOT + ' now ' + (open - 1) + ' blaster open');

  await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
    values (${USER}, ${ORDER}, false, now()) on conflict do nothing`;
  console.log('  ' + ORDER + ' marked synced');

  const rest = await sql`select p.id, p.quantity - coalesce((select sum(s.quantity)::int from sales s
      where s.purchase_id = p.id), 0) open, p.cost_cents, ci.name
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.purchase_date = '2026-09-28' and p.deleted_at is null order by p.id`;
  console.log('\n  still on hand from the B&N buy:');
  let held = 0;
  for (const x of rest) {
    if (!x.open) continue;
    held += x.open * x.cost_cents;
    console.log('    pu' + x.id + '  x' + x.open + ' @ $' + (x.cost_cents / 100).toFixed(2)
      + '  ' + x.name);
  }
  console.log('    $' + (held / 100).toFixed(2) + ' of cost basis left');
  await sql.end();
})();
