import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  for (const id of [19928, 31884, 198]) {
    const r = (await sql`
      SELECT ci.id, ci.name,
        (SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt,
        (SELECT snapshot_date FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS asof
      FROM catalog_items ci WHERE ci.id=${id}`)[0];
    console.log(`#${r.id} ${r.name}: market ${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'n/a'} ${r.asof?'(as of '+(r.asof instanceof Date?r.asof.toISOString().slice(0,10):r.asof)+')':''}`);
  }
  await sql.end();
}
main();
