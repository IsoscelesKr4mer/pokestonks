/**
 * Book the second Bowman Football blaster. That lot is now clear.
 *
 *   npx tsx scripts/book-fb-blaster2-0929.ts
 *
 * "The other blaster sold"
 *
 * eBay order 14-15224-62638, item 168737029255, 2026-09-29 22:53Z. Identical
 * economics to 04-15242-54947 four hours earlier: $39.99 item, $10.11 shipping,
 * $50.10 total.
 *
 *   item       $39.99
 *   ebay fee    -7.04   13.25% of 50.10 + 0.40
 *   ship credit +1.61   $10.11 collected against an ~$8.50 label
 *   fees       -$5.43
 *   cost      -$32.49   pu634
 *   profit     +$2.07
 *
 * THE SHIPPING CREDIT IS APPLIED UP FRONT THIS TIME. On the first blaster it
 * was booked at the full fee and corrected once he weighed the box. The box is
 * now a known quantity - **13 oz packed in the 8x8x4, label "$8 and change"** -
 * and this order quoted the same $10.11, which means the same zone bucket. The
 * assumption is stated here rather than discovered later; if the label differs,
 * only the credit moves.
 *
 * BOTH BLASTERS SOLD WITHIN 28 HOURS OF THE CUT to $39.99, while the megas at
 * $84.99 have not moved at all. That is the live signal for tomorrow: the
 * blaster price was right and the mega price probably is not, and the in-hand
 * edge dies at the 09-30 street date.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '14-15224-62638';
const DATE = '2026-09-29';
const REVENUE = 3999;
const FEES = 543;       // ebay $7.04 less the $1.61 shipping surplus
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
      ${'eBay order ' + ORDER + '. Item $39.99 plus $10.11 calculated shipping = $50.10. '
        + 'fees_cents is the $7.04 eBay fee less a $1.61 shipping surplus: the box is 13 oz '
        + 'packed in the 8x8x4 and the label runs about $8.50, measured on the identical sale '
        + 'four hours earlier which quoted the same $10.11. The 1 lb declaration is padded on '
        + 'purpose and that padding is where most of this margin comes from.'})
    returning id`;
  console.log('sale#' + s.id + '  x1  rev $' + (REVENUE / 100).toFixed(2)
    + '  fees $' + (FEES / 100).toFixed(2) + '  cost $' + (p.cost_cents / 100).toFixed(2)
    + '  profit $' + ((REVENUE - FEES - p.cost_cents) / 100).toFixed(2));
  await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
    values (${USER}, ${ORDER}, false, now()) on conflict do nothing`;
  console.log('  pu' + LOT + ' now ' + (open - 1) + ' open, that lot is clear');

  console.log('\n  the B&N run so far:');
  const sales = await sql`select s.sale_price_cents r, s.fees_cents f, s.matched_cost_cents c, ci.name
    from sales s join purchases pu on pu.id = s.purchase_id
    join catalog_items ci on ci.id = pu.catalog_item_id
    where pu.purchase_date = '2026-09-28'`;
  let prof = 0;
  for (const x of sales) { prof += x.r - x.f - x.c; console.log('    +$'
    + ((x.r - x.f - x.c) / 100).toFixed(2) + '  ' + x.name); }
  const rest = await sql`select p.id, p.cost_cents, ci.name,
      p.quantity - coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) open
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.purchase_date = '2026-09-28' and p.deleted_at is null`;
  console.log('    realised +$' + (prof / 100).toFixed(2));
  for (const x of rest) if (x.open) console.log('    still held: x' + x.open + ' @ $'
    + (x.cost_cents / 100).toFixed(2) + '  ' + x.name + '  = $'
    + ((x.open * x.cost_cents) / 100).toFixed(2) + ' at risk');
  await sql.end();
})();
