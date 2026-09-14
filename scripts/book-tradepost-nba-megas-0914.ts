/**
 * Book the TradePost sale of all 10 NBA Chrome Update megas.
 *
 *   npx tsx scripts/book-tradepost-nba-megas-0914.ts --apply
 *
 * Michael: "i just sold all 10."
 *
 * TradePost instant sell at $187.31/box, $1,873.10 payout, no fees and free
 * shipping from WA, so the payout is the net. Bought this morning at Fred
 * Meyer Shoreline for $939.14.
 *
 * Lot 610 is the only open lot for this catalog item (the seven August boxes
 * are all sold through), so FIFO has nothing to split.
 *
 * Off-eBay exits leave listings live, so this also checks for any live eBay
 * mapping on the same catalog item that would now be overcommitted.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LOT = 610, QTY = 10;
const GROSS = 187310;   // 10 x $187.31
const FEES = 0;         // TradePost instant sell, payout is net

(async () => {
  const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents, p.user_id,
      coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) sold
    from purchases p where p.id = ${LOT}`;
  const open = lot.quantity - Number(lot.sold);
  const COST = lot.cost_cents * QTY;
  console.log('lot ' + LOT + ': qty ' + lot.quantity + ' @ $' + (lot.cost_cents/100).toFixed(2) + ', open ' + open);
  console.log('selling ' + QTY + ' for $' + (GROSS/100).toFixed(2) + ' gross, fees $' + (FEES/100).toFixed(2));
  console.log('matched cost $' + (COST/100).toFixed(2) + '  ->  profit $' + ((GROSS-FEES-COST)/100).toFixed(2));
  if (open < QTY) throw new Error('only ' + open + ' open on this lot, refusing to oversell');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const [ins]: any = await sql`insert into sales
      (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    values (${lot.user_id}, ${LOT}, '2026-09-14', ${QTY}, ${GROSS}, ${FEES}, ${COST}, 'TradePost',
      ${'TradePost instant sell, all 10 in one go at $187.31/box. No fees, free shipping from WA, so the ' +
        '$1,873.10 payout is the net. Bought the same morning at Fred Meyer Shoreline for $939.14 total. ' +
        'TradePost beat eBay decisively: eBay needed a $221.15 ask just to match this after fees, against a ' +
        'live board whose cheapest ask was $180 and median $229.99. App showed the box up 69.82% over 90 days.'},
      ${randomUUID()})
    returning id`;
  console.log('\nbooked sale ' + ins.id);

  const [chk]: any = await sql`select
      (select sum(quantity) from purchases where catalog_item_id=135078 and deleted_at is null) bought,
      (select sum(s.quantity) from sales s join purchases p on p.id=s.purchase_id where p.catalog_item_id=135078) sold`;
  console.log('mega boxes: bought ' + chk.bought + ', sold ' + chk.sold + ', on hand ' + (chk.bought - chk.sold));

  const m: any = await sql`select * from ebay_listing_mappings where catalog_item_id = 135078`;
  console.log('\nlive eBay mappings on this catalog item: ' + m.length + (m.length ? '  <<< CHECK FOR OVERCOMMIT' : '  (nothing to end)'));
  m.forEach((x: any) => console.log('   ' + JSON.stringify(x)));

  const [pl]: any = await sql`select
      sum(s.sale_price_cents - coalesce(s.fees_cents,0) - coalesce(s.matched_cost_cents,0)) profit,
      sum(s.quantity) n
    from sales s join purchases p on p.id=s.purchase_id where p.catalog_item_id=135078`;
  console.log('\nlifetime on this box: ' + pl.n + ' sold, realized profit $' + (pl.profit/100).toFixed(2));
  await sql.end();
})();
