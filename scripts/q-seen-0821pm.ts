import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows:any = await sql`
    WITH lp AS (
      SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents, snapshot_date
      FROM market_prices ORDER BY catalog_item_id, snapshot_date DESC
    )
    SELECT ci.id, ci.name, ci.product_type, lp.market_price_cents m, lp.snapshot_date::text d
    FROM catalog_items ci LEFT JOIN lp ON lp.catalog_item_id=ci.id
    WHERE (ci.name ILIKE '%Pitch Black%' OR ci.name ILIKE '%Perfect Order%' OR ci.name ILIKE '%Chaos Rising%')
      AND (ci.product_type ILIKE '%Pack%' OR ci.product_type ILIKE '%Bundle%')
    ORDER BY ci.name`;
  rows.forEach((r:any)=>console.log(`ci${r.id} | ${r.name} | ${r.product_type} | ${r.m!=null?'$'+(r.m/100).toFixed(2):'—'} (${r.d??'no px'})`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
