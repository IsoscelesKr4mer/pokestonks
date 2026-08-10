import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  console.log('=== booster-pack sales: by catalog item (matched_cost now $5) ===');
  const g = await sql`
    SELECT ci.id, ci.name, COUNT(*)::int rows, SUM(s.quantity)::int qty,
      ROUND(AVG(s.sale_price_cents))::int avg_sale, SUM(s.sale_price_cents)::int tot_sale
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
    GROUP BY ci.id, ci.name ORDER BY tot_sale DESC`;
  for(const r of g) console.log(`  #${r.id} ${r.name}: ${r.rows} rows / ${r.qty} qty | avg sale $${(r.avg_sale/100).toFixed(2)} | total sale $${(r.tot_sale/100).toFixed(2)}`);

  console.log('\n=== distinct sale groups/notes for these pack sales ===');
  const n = await sql`
    SELECT DISTINCT s.platform, s.notes, COUNT(*)::int rows
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE (ci.product_type ILIKE '%booster pack%' OR ci.name ILIKE '%booster pack%')
    GROUP BY s.platform, s.notes ORDER BY rows DESC LIMIT 25`;
  for(const r of n) console.log(`  ${r.rows}x | ${r.platform} | ${r.notes??''}`);
  await sql.end();
}
main();
