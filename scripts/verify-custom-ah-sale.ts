import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== latest eBay sales (last 5) ===');
  const sales = await sql`
    SELECT s.sale_group_id, s.sale_date, ci.name, s.quantity, s.sale_price_cents, s.fees_cents
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE s.platform='eBay' ORDER BY s.created_at DESC LIMIT 6`;
  for (const r of sales) console.log(`  ${r.sale_date} ${r.name} | qty ${r.quantity} | $${(r.sale_price_cents/100).toFixed(2)} fee $${(r.fees_cents/100).toFixed(2)} | grp ${String(r.sale_group_id).slice(0,8)}`);
  console.log('=== held now ===');
  for (const id of [7778, 76]) {
    const h = (await sql`
      SELECT ci.name, COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${id} GROUP BY ci.name`)[0];
    console.log(`  #${id} ${h.name}: held ${h.held}`);
  }
  await sql.end();
}
main();
