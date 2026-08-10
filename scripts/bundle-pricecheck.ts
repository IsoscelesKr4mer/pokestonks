import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`
    WITH lots AS (
      SELECT p.id, p.catalog_item_id, p.quantity, p.cost_cents
      FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
      WHERE ci.product_type='Booster Bundle' AND p.deleted_at IS NULL
    ),
    agg AS (
      SELECT l.catalog_item_id,
        SUM(l.quantity) purchased,
        COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0) sold,
        COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) decomp,
        COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0) rip,
        ROUND(SUM(l.cost_cents*l.quantity) FILTER (WHERE l.cost_cents>0) / NULLIF(SUM(l.quantity) FILTER (WHERE l.cost_cents>0),0)) avg_cost
      FROM lots l GROUP BY l.catalog_item_id
    )
    SELECT ci.name, a.purchased - a.sold - a.decomp - a.rip AS held, a.avg_cost,
      COALESCE(ci.manual_market_cents, ci.last_market_cents) AS market
    FROM agg a JOIN catalog_items ci ON ci.id=a.catalog_item_id
    WHERE a.purchased - a.sold - a.decomp - a.rip > 0
    ORDER BY (a.purchased - a.sold - a.decomp - a.rip) * COALESCE(ci.manual_market_cents, ci.last_market_cents, 0) DESC`;
  let tHeld=0,tCost=0; const tot:Record<string,number>={'80':0,'85':0,'90':0};
  console.log('HELD BOOSTER BUNDLES — negotiating ladder\n');
  console.log('qty bundle'.padEnd(28)+'cost  mkt   80%    85%    90%   ROI@80');
  for(const r of rows){
    const held=Number(r.held), cost=Number(r.avg_cost||0), mkt=Number(r.market||0);
    const p=(pct:number)=>Math.round(mkt*pct/100);
    const roi = cost>0&&mkt>0 ? ((p(80)-cost)/cost*100).toFixed(0)+'%' : 'n/a';
    tHeld+=held; tCost+=cost*held; tot['80']+=p(80)*held; tot['85']+=p(85)*held; tot['90']+=p(90)*held;
    const nm=(r.name||'').replace(' Booster Bundle','').slice(0,20);
    console.log(`${String(held)+'x '+nm}`.padEnd(28)+`$${(cost/100).toFixed(0)}  $${(mkt/100).toFixed(0)}  $${(p(80)/100).toFixed(0)}    $${(p(85)/100).toFixed(0)}    $${(p(90)/100).toFixed(0)}   ${roi}`);
  }
  console.log(`\n${tHeld} bundles | cost $${(tCost/100).toFixed(0)}`);
  for(const k of ['80','85','90']) console.log(`  @${k}%: take $${(tot[k]/100).toFixed(0)}  profit $${((tot[k]-tCost)/100).toFixed(0)}  ROI ${(((tot[k]-tCost)/tCost)*100).toFixed(0)}%`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
