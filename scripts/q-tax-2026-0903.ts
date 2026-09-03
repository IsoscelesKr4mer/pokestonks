/**
 * What 2026 actually looks like for tax purposes.
 *
 * Two ledgers have to be added together and neither is complete on its own:
 * `sales` holds sealed product, baseball_cards.sold_* holds cards. Pins, Magic
 * and Naruto are in neither, so the total below is a FLOOR.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const s:any = await sql`SELECT count(*) n, count(DISTINCT sale_group_id) orders,
      sum(sale_price_cents) rev, sum(fees_cents) fees, sum(matched_cost_cents) cogs
    FROM sales WHERE sale_date >= '2026-01-01'`;
  const rev=Number(s[0].rev||0), fees=Number(s[0].fees||0), cogs=Number(s[0].cogs||0);
  console.log('SEALED (pokestonks sales), 2026:');
  console.log(`  ${s[0].n} rows across ${s[0].orders} orders`);
  console.log(`  revenue  $${(rev/100).toFixed(2)}`);
  console.log(`  fees     $${(fees/100).toFixed(2)}`);
  console.log(`  COGS     $${(cogs/100).toFixed(2)}`);
  console.log(`  profit   $${((rev-fees-cogs)/100).toFixed(2)}`);

  const c:any = await sql`SELECT count(*) n, sum(sold_price_cents) rev
    FROM baseball_cards WHERE coalesce(sold_price_cents,0)>0 AND sold_date >= '2026-01-01'`;
  const crev=Number(c[0].rev||0);
  console.log(`\nCARDS (baseball_cards), 2026:`);
  console.log(`  ${c[0].n} cards sold, revenue $${(crev/100).toFixed(2)}`);
  console.log(`  NO cost basis or fee field on this table, so its profit cannot be computed here`);

  const byPlat:any = await sql`SELECT platform, count(*) n, sum(sale_price_cents) rev
    FROM sales WHERE sale_date >= '2026-01-01' GROUP BY 1 ORDER BY 3 DESC`;
  console.log('\nsealed revenue by platform:');
  byPlat.forEach((r:any)=>console.log(`  ${String(r.platform).padEnd(18)} ${String(r.n).padStart(3)} rows  $${(Number(r.rev)/100).toFixed(2)}`));

  const ebayGross:any = await sql`SELECT sum(sale_price_cents) r FROM sales WHERE sale_date>='2026-01-01' AND platform='eBay'`;
  console.log(`\nWHAT eBay WILL REPORT (gross, before any deduction):`);
  console.log(`  sealed via eBay  $${(Number(ebayGross[0].r||0)/100).toFixed(2)}`);
  console.log(`  + cards          $${(crev/100).toFixed(2)}  (nearly all eBay)`);
  console.log(`  + pins/Magic/Naruto: NOT TRACKED, at least $234 identified`);

  const inv:any = await sql`SELECT count(*) lots, sum(quantity*cost_cents) spent
    FROM purchases WHERE deleted_at IS NULL AND purchase_date >= '2026-01-01'`;
  console.log(`\nPURCHASES logged in 2026: ${inv[0].lots} lots, $${(Number(inv[0].spent||0)/100).toFixed(2)} spent`);
  console.log('  (only the portion actually SOLD is deductible this year; the rest is inventory)');
  await sql.end();
})();
