import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT ci.id, ci.name, ci.set_name, ci.product_type,
      (SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt,
      (SELECT snapshot_date FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS asof
    FROM catalog_items ci
    WHERE lower(ci.name) LIKE '%pitch black%' OR lower(ci.set_name) LIKE '%pitch black%'
    ORDER BY ci.name`;
  if (rows.length === 0) { console.log('No "Pitch Black" catalog items in pokestonks.'); }
  for (const r of rows) console.log(`#${r.id} | ${r.name} | set=${r.set_name??''} type=${r.product_type??''} | mkt ${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'n/a'} ${r.asof?'(as of '+(r.asof instanceof Date?r.asof.toISOString().slice(0,10):r.asof)+')':''}`);
  await sql.end();
}
main();
