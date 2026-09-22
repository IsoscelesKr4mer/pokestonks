/**
 * Book the three TradePost sales from the 30th Celebration haul.
 *
 *   npx tsx scripts/book-tradepost-30th-0921.ts
 *
 * All three shipped 2026-09-21 and are in transit. Numbers are read off the
 * TradePost order screens, not estimated.
 *
 *   TPST-YRSFS8PB  10 x Knock Out    @ $26.34 = $263.40  label -$21.80  = $241.60
 *   TPST-H9G33PPG   5 x Poster       @ $40.49 = $202.45  label -$20.68  = $181.77
 *   TPST-A8THZ10Z   5 x Greninja ex  @ $55.60 = $278.00  label -$26.81  = $251.19
 *
 * Booked gross with the label as `fees_cents`, matching how eBay sales are
 * booked here: revenue is the sale total and the channel's cost is visible as
 * fees, rather than burying it by booking the payout as revenue.
 *
 * THE GRENINJA REPRICED UPWARD BETWEEN QUOTE AND SALE. It was quoted at $49.19
 * a unit in the morning and sold at $55.60 at 12:47, so it netted **$50.24** a
 * unit rather than the $44.87 every comparison today was built on. That makes
 * ending the eBay listing the right call by more than it looked: the best price
 * anyone had actually paid on eBay netted $44.72.
 *
 * No insurance line appears on any of the three, so the $2.63 quoted on the
 * Knock Out screen was either declined or is billed separately; the payouts
 * reconcile exactly as sale total minus label without it.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-21';

// purchase id, qty, gross cents, label cents, matched cost cents, order id, label
const SALES: [number, number, number, number, number, string, string][] = [
  [624, 10, 26340, 2180, 13250, 'TPST-YRSFS8PB', 'Knock Out Collection'],
  [625, 5, 20245, 2068, 11045, 'TPST-H9G33PPG', 'Poster Collection'],
  [626, 5, 27800, 2681, 16570, 'TPST-A8THZ10Z', 'Greninja ex Box'],
];

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  let gross = 0, fees = 0, cost = 0;
  for (const [pid, qty, g, label, mc, order, name] of SALES) {
    const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name from purchases p
      join catalog_items ci on ci.id = p.catalog_item_id
      where p.id = ${pid} and p.deleted_at is null`;
    if (!p) throw new Error('purchase ' + pid + ' missing');
    if (!p.name.includes(name)) throw new Error('pu' + pid + ' is ' + p.name + ', expected ' + name);
    if (p.quantity !== qty) throw new Error('pu' + pid + ' holds ' + p.quantity + ', selling ' + qty);
    if (p.cost_cents * qty !== mc) throw new Error('cost mismatch on pu' + pid);

    const [dupe] = await sql`select count(*)::int n from sales where purchase_id = ${pid}`;
    if (dupe.n) { console.log('  already booked: ' + name); continue; }

    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${USER}, ${pid}, ${DATE}, ${qty}, ${g}, ${label}, ${mc}, 'TradePost',
        ${'TradePost order ' + order + ', shipped and in transit. Gross $' +
          (g / 100).toFixed(2) + ' less the UPS label $' + (label / 100).toFixed(2) +
          ' = $' + ((g - label) / 100).toFixed(2) + ' payout. Label booked as fees so ' +
          'the channel cost stays visible.' +
          (name === 'Greninja ex Box'
            ? ' Repriced up from the $49.19 quoted that morning to $55.60 at sale, which is $50.24 a unit net against the $44.87 that every channel comparison today assumed.'
            : '')})
      returning id`;
    console.log('  sale#' + s.id + '  ' + name + '  x' + qty +
      '  gross $' + (g / 100).toFixed(2) + '  label $' + (label / 100).toFixed(2) +
      '  payout $' + ((g - label) / 100).toFixed(2) +
      '  profit $' + ((g - label - mc) / 100).toFixed(2));
    gross += g; fees += label; cost += mc;
  }

  if (gross) {
    console.log('\n  20 units  gross $' + (gross / 100).toFixed(2) +
      '  labels $' + (fees / 100).toFixed(2) +
      '  payout $' + ((gross - fees) / 100).toFixed(2) +
      '  cost $' + (cost / 100).toFixed(2) +
      '  profit $' + ((gross - fees - cost) / 100).toFixed(2));
  }
  await sql.end();
})();
