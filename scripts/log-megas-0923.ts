/**
 * Log 14 x 2026 Bowman Chrome Baseball Mega Box, Target Northgate 09-23.
 *
 * Seven separate transactions of 2, one receipt shown: 2 @ $49.99 = $99.98,
 * WA tax 10.55% = $10.55, total $110.53. Seven of those is $773.71.
 * Unit $55.265, logged at $55.27; 14 x $55.27 = $773.78 against $773.71 paid,
 * a 7 cent rounding gap left unallocated.
 *
 * Seattle's 10.55% matches what is on file, unlike the Lynnwood store.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });
  const [ci] = await sql`select id, name from catalog_items
    where name = '2026 Bowman Chrome Baseball Mega Box'`;
  if (!ci) throw new Error('mega catalog row missing');
  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${ci.id} and purchase_date = '2026-09-23' and deleted_at is null`;
  if (dupe.n) { console.log('already logged'); await sql.end(); return; }
  const [p] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
      quantity, cost_cents, source, location, notes)
    values (${USER}, ${ci.id}, '2026-09-23', 14, 5527, 'Target', 'Northgate, Seattle WA',
      ${'Release day. Seven separate transactions of 2 at $49.99, each $110.53 with ' +
        "Seattle's 10.55% tax, $773.71 all in. Final sale, no returns. TradePost was " +
        'quoting $71.00 with FREE shipping at the time, down 10.99% post-release.'})
    returning id`;
  console.log('logged pu' + p.id + '  x14 @ $55.27  = $773.78  (receipts $773.71, 7c rounding)');
  const [h] = await sql`select sum(p.quantity - coalesce((select sum(s.quantity)::int from sales s
      where s.purchase_id=p.id),0))::int held
    from purchases p join catalog_items ci on ci.id=p.catalog_item_id
    where ci.id=${ci.id} and p.deleted_at is null`;
  console.log('mega boxes now on hand: ' + h.held);
  await sql.end();
})();
