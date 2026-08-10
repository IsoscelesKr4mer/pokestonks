import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // held bundles + market
  const bundles = await sql<{cid:number,name:string,market:number}[]>`
    SELECT id AS cid, name, COALESCE(manual_market_cents, last_market_cents, 0)::int AS market
    FROM catalog_items WHERE product_type='Booster Bundle'`;
  let totCost=0, totMarket=0, totUnits=0;
  const rows:any[]=[];
  for (const b of bundles){
    // open lots FIFO: remaining per lot = qty - sold - rips - decomps
    const lots = await sql<{id:number,cost:number,remaining:number}[]>`
      SELECT p.id, p.cost_cents AS cost,
        (p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS remaining
      FROM purchases p WHERE p.catalog_item_id=${b.cid} AND p.deleted_at IS NULL
      ORDER BY p.purchase_date, p.id`;
    const open = lots.filter(l=>l.remaining>0);
    const held = open.reduce((s,l)=>s+l.remaining,0);
    if (held<=0) continue;
    const cost = open.reduce((s,l)=>s+l.remaining*l.cost,0);
    const market = held*b.market;
    totCost+=cost; totMarket+=market; totUnits+=held;
    rows.push({name:b.name, held, unitCostAvg:(cost/held/100), marketEa:(b.market/100), heldCost:(cost/100), heldMarket:(market/100)});
  }
  console.log(JSON.stringify(rows,null,2));
  const rev80 = totMarket*0.8;
  console.log('\n--- TOTALS ---');
  console.log('units:', totUnits);
  console.log('cost basis: $'+(totCost/100).toFixed(2));
  console.log('market (100%): $'+(totMarket/100).toFixed(2));
  console.log('revenue @80%: $'+(rev80/100).toFixed(2));
  console.log('profit @80%: $'+((rev80-totCost)/100).toFixed(2));
  console.log('ROI @80%: '+(((rev80-totCost)/totCost)*100).toFixed(1)+'%');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
