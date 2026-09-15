/**
 * Book the rest of it: 7 Bowman megas at $85, 6 NBA megas at $181.75, and the
 * 3 Bowman boxes Michael ripped.
 *
 *   npx tsx scripts/book-tradepost-0915.ts --apply
 *
 * Michael: "These are all sold and shipped... and I ripped the other 3 bowman
 * chromes for free since I sold 7 at 85."
 *
 * Four TradePost screenshots, two of them already booked:
 *   10x NBA mega     $187.31  $1,873.10  In Transit  -> sale 606, booked 09-14
 *   10x NBA blaster  $ 84.89  $  848.90  In Transit  -> sale 610, booked 09-14
 *    7x Bowman mega  $ 85.00  $  595.00  Awaiting    -> NEW
 *    6x NBA mega     $181.75  $1,091.00  Awaiting    -> NEW
 *
 * He got $85 on the Bowman, not the $80 he was quoted yesterday, and $181.75
 * on the last 6 NBA megas rather than $187.31. Both are the real numbers off
 * the orders.
 *
 * The 3 ripped Bowman boxes go in as rips, not sales: no revenue, no loss
 * booked, matching every previous rip. 7 x $85 = $595 against the $553.40 he
 * paid for all ten, so the rips really are free with $41.60 to spare.
 *
 * The eBay listing for those same 7 Bowman boxes was ended before this ran.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SALES = [
  { lot: 611, qty: 7, each: 8500,  what: '7 Bowman Chrome megas at $85.00, $595.00' },
  { lot: 613, qty: 6, each: 18175, what: '6 NBA Chrome Update megas at $181.75, $1,091.00' },
];
const RIPS = { lot: 611, count: 3 };

(async () => {
  const [{ user_id }]: any = await sql`select user_id from purchases order by id desc limit 1`;
  for (const s of SALES) {
    const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents,
        coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
        + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
        + coalesce((select sum(x.quantity) from sales x where x.purchase_id=p.id),0) used
      from purchases p where p.id = ${s.lot}`;
    const open = lot.quantity - Number(lot.used);
    const gross = s.each * s.qty, cost = lot.cost_cents * s.qty;
    console.log(s.what + '   lot ' + s.lot + ' open ' + open +
      ' -> cost $' + (cost/100).toFixed(2) + ', profit $' + ((gross-cost)/100).toFixed(2));
    if (open < s.qty) throw new Error('lot ' + s.lot + ' only has ' + open + ' open');
    if (!APPLY) continue;
    const [ins]: any = await sql`insert into sales
        (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      values (${user_id}, ${s.lot}, '2026-09-15', ${s.qty}, ${gross}, 0, ${cost}, 'TradePost',
        ${'TradePost instant sell, ' + s.what + '. No fees, free label, so the payout is the net. ' +
          'Confirmed from the TradePost order screens on 2026-09-15.'}, ${randomUUID()})
      returning id`;
    console.log('   booked sale ' + ins.id);
  }

  if (APPLY) {
    const [lot]: any = await sql`select cost_cents from purchases where id = ${RIPS.lot}`;
    for (let i = 0; i < RIPS.count; i++) {
      await sql`insert into rips (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
        values (${user_id}, ${RIPS.lot}, '2026-09-15', ${lot.cost_cents}, 0,
          ${'Ripped 2026-09-15, one of 3 Bowman Chrome megas Michael kept back. The other 7 went to ' +
            'TradePost at $85, which returned $595 against the $553.40 he paid for all ten, so these ' +
            'three cost him nothing. No loss booked, same as every prior rip.'})`;
    }
    console.log('\nlogged ' + RIPS.count + ' rips on lot ' + RIPS.lot);
  }

  const h: any = await sql`
    with consumed as (select p.id,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used from purchases p)
    select ci.name, sum(greatest(p.quantity-c.used,0)) held
    from purchases p join catalog_items ci on ci.id=p.catalog_item_id join consumed c on c.id=p.id
    where p.id in (610,611,612,613) and p.deleted_at is null group by ci.name order by ci.name`;
  console.log('\non hand from the Fred Meyer runs:');
  h.forEach((x: any) => console.log('  ' + x.held + '  ' + x.name));
  if (!APPLY) console.log('\nDRY RUN, pass --apply');
  await sql.end();
})();
