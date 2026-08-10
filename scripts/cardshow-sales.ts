import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r=await sql`
    SELECT s.id, s.sale_date, s.quantity, s.sale_price_cents, s.fees_cents, s.matched_cost_cents, s.platform, s.sale_group_id,
           c.name AS product
    FROM sales s
    JOIN purchases p ON s.purchase_id=p.id
    JOIN catalog_items c ON p.catalog_item_id=c.id
    WHERE s.platform ILIKE '%card show%'
    ORDER BY s.sale_date, s.id`;
  let rev=0, cost=0, fees=0, qty=0;
  const byDate:Record<string,number>={};
  for(const x of r as any[]){
    rev+=x.sale_price_cents; cost+=x.matched_cost_cents||0; fees+=x.fees_cents||0; qty+=x.quantity;
    const d=String(x.sale_date).slice(0,10); byDate[d]=(byDate[d]||0)+x.sale_price_cents;
    console.log(`${d} | ${x.product} x${x.quantity} | sold $${(x.sale_price_cents/100).toFixed(2)} | cost $${((x.matched_cost_cents||0)/100).toFixed(2)} | grp ${x.sale_group_id}`);
  }
  console.log('\n--- by date ---');
  for(const d of Object.keys(byDate)) console.log(`${d}: $${(byDate[d]/100).toFixed(2)}`);
  console.log(`\nTOTAL: ${r.length} sale rows, ${qty} units, revenue $${(rev/100).toFixed(2)}, cost $${(cost/100).toFixed(2)}, fees $${(fees/100).toFixed(2)}, profit $${((rev-cost-fees)/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
