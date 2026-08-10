import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`
    WITH lots AS (SELECT p.id,p.catalog_item_id,p.quantity,p.cost_cents FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
      WHERE ci.name ILIKE '%pitch black%' AND ci.product_type ILIKE '%elite trainer%' AND p.deleted_at IS NULL)
    SELECT ci.id, ci.name, ci.product_type,
      SUM(l.quantity) - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
        - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
        - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) held,
      ROUND(AVG(l.cost_cents)) avgcost,
      COALESCE(ci.manual_market_cents, ci.last_market_cents) market, ci.last_market_at
    FROM lots l JOIN catalog_items ci ON ci.id=l.catalog_item_id GROUP BY ci.id,ci.name,ci.product_type,ci.manual_market_cents,ci.last_market_cents,ci.last_market_at`;
  for(const x of r) console.log(`ci${x.id} held ${x.held} | ${x.name} [${x.product_type}] | cost $${(x.avgcost/100).toFixed(2)} | market $${x.market?(x.market/100).toFixed(2):'?'} (${String(x.last_market_at).slice(0,10)})`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
