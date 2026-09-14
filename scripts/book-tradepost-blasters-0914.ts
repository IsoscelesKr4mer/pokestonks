/**
 * Book the 10 NBA value blasters sold to TradePost.
 *
 *   npx tsx scripts/book-tradepost-blasters-0914.ts --apply
 *
 * TradePost "Awaiting Shipment" screenshot: 10x Topps Blaster, 2025/26 Topps
 * Chrome Update, Mint, At Home, $84.89 each, $848.90 total. No fees and no
 * label cost on TradePost instant sell, so the payout is the net.
 *
 * Bought this morning at Fred Meyer Lynnwood for $49.80 a box (lot 612).
 *
 * BOTH TradePost orders, these blasters and this morning's 10 megas, must
 * ship by Thursday 2026-09-17 at 7:00pm or the quotes lapse.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const LOT = 612, QTY = 10;
const GROSS = 84890;   // 10 x $84.89
const FEES = 0;

(async () => {
  const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents, p.user_id,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used
    from purchases p where p.id = ${LOT}`;
  const open = lot.quantity - Number(lot.used);
  const COST = lot.cost_cents * QTY;
  console.log('lot ' + LOT + ': ' + lot.quantity + ' @ $' + (lot.cost_cents/100).toFixed(2) + ', open ' + open);
  console.log('selling ' + QTY + ' at $84.89 = $' + (GROSS/100).toFixed(2) +
    ', cost $' + (COST/100).toFixed(2) + ' -> profit $' + ((GROSS-FEES-COST)/100).toFixed(2));
  if (open < QTY) throw new Error('only ' + open + ' open');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const [ins]: any = await sql`insert into sales
      (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    values (${lot.user_id}, ${LOT}, '2026-09-14', ${QTY}, ${GROSS}, ${FEES}, ${COST}, 'TradePost',
      ${'TradePost instant sell, 10 blasters at $84.89 = $848.90. No fees, no label cost, so the payout is ' +
        'the net. Bought the same morning at Fred Meyer Lynnwood for $49.80 each. MUST SHIP BY 2026-09-17 ' +
        '7:00pm along with the 10 megas from the same day, or the quotes lapse. In August he was selling ' +
        'these at $64.99 on eBay; TradePost paid $84.89.'},
      ${randomUUID()})
    returning id`;
  console.log('\nbooked sale ' + ins.id);

  const h: any = await sql`
    with consumed as (select p.id,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used from purchases p)
    select ci.name, sum(greatest(p.quantity - c.used,0)) held
    from purchases p join catalog_items ci on ci.id=p.catalog_item_id join consumed c on c.id=p.id
    where p.catalog_item_id in (135078,135079,135081) and p.deleted_at is null
    group by ci.name order by ci.name`;
  console.log('\nbasketball on hand:');
  h.forEach((x: any) => console.log('  ' + String(x.held).padStart(3) + '  ' + x.name));
  await sql.end();
})();
