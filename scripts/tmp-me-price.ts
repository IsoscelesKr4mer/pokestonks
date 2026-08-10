import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== Mega Evolution catalog items w/ latest market ===');
  const rows = await sql`
    SELECT c.id, c.name, c.product_type,
      (SELECT market_price_cents FROM market_prices m WHERE m.catalog_item_id=c.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt
    FROM catalog_items c
    WHERE c.set_name ILIKE '%Mega Evolution%' AND c.set_name ILIKE '%ME01%'
    ORDER BY mkt DESC NULLS LAST`;
  for (const r of rows) console.log(`[${r.id}] ${r.product_type||'?'}  ${r.name}  mkt=${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'—'}`);
  console.log('\n=== Realized ME booster pack sale rate (last 60d) ===');
  const s = await sql`
    SELECT s.sale_date, s.quantity, s.sale_price_cents, s.platform, s.notes
    FROM sales s JOIN purchases p ON p.id=s.purchase_id
    WHERE p.catalog_item_id=31884 ORDER BY s.sale_date DESC LIMIT 10`;
  for (const r of s) console.log(`${r.sale_date.toISOString().slice(0,10)} qty=${r.quantity} $${(r.sale_price_cents/100).toFixed(2)} [${r.platform}] ${r.notes??''}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
