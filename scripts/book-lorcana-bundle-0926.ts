/**
 * Book the first Lorcana Best Buddies Bundle, sold 2026-09-26.
 *
 *   npx tsx scripts/book-lorcana-bundle-0926.ts
 *
 * eBay order 27-15186-49817, item 168716433823, 1 of the 2 on that listing.
 *
 *   item       $64.99
 *   shipping    11.30   collected (calculated, buyer paid)
 *   total      $76.29   -> the fee base
 *   fee        -$10.51   13.25% of 76.29 + 0.40
 *   cost       -$44.19   pu632
 *   profit     +$10.29
 *
 * THE PRICE CUT IS WHAT DID IT. Listed 09-24 at $79.99 and sat two days with
 * zero watchers in a book that grew 46% in the same week. Cut to $64.99 on
 * 09-25 at about 16:00 UTC to become the cheapest of 132, and it sold 26 hours
 * later. Worth remembering the next time rank says the ask is fine and the
 * silence says otherwise.
 *
 * ONE THING TO WATCH: the buyer paid $11.30 of calculated shipping off a
 * package I declared 14x11x4 at 3 lb WITHOUT EVER WEIGHING THE BOX. If the
 * real label prints under that he keeps the difference; if over, he eats it.
 * Either way the second unit should be quoting off a scale reading, not my
 * guess.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const ORDER = '27-15186-49817';
const DATE = '2026-09-26';
const REVENUE = 6499;   // item subtotal, shipping excluded per the wash rule
const FEES = 1051;      // 13.25% of the $76.29 order total + $0.40
const LOT = 632;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT} and p.deleted_at is null`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('Best Buddies')) throw new Error('pu' + LOT + ' is ' + p.name);
  const open = p.quantity - p.sold;
  if (open < 1) throw new Error('pu' + LOT + ' has nothing open');

  const [dupe] = await sql`select count(*)::int n from sales
    where purchase_id = ${LOT} and sale_date = ${DATE} and sale_price_cents = ${REVENUE}`;
  if (dupe.n) { console.log('already booked'); await sql.end(); return; }

  const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
      sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
    values (${USER}, ${LOT}, ${DATE}, 1, ${REVENUE}, ${FEES}, ${p.cost_cents}, 'eBay',
      ${'eBay order ' + ORDER + '. Item $64.99 plus $11.30 calculated shipping = $76.29; '
        + 'revenue is the item subtotal with the label out, fee computed on the full total. '
        + 'Sold 26 hours after the cut from $79.99 to $64.99, which made it the cheapest of '
        + '132 sealed asks; it had sat two days at $79.99 with no watchers.'})
    returning id`;
  console.log('sale#' + s.id + '  x1  rev $' + (REVENUE / 100).toFixed(2)
    + '  fees $' + (FEES / 100).toFixed(2) + '  cost $' + (p.cost_cents / 100).toFixed(2)
    + '  profit $' + ((REVENUE - FEES - p.cost_cents) / 100).toFixed(2));
  console.log('  pu' + LOT + ' now ' + (open - 1) + ' bundle open');

  await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
    values (${USER}, ${ORDER}, false, now()) on conflict do nothing`;
  console.log('  ' + ORDER + ' marked synced');
  await sql.end();
})();
