import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== WF (#31604) and BB (#5241) bought/sold/held ===');
  for (const id of [31604, 5241]) {
    const h = (await sql`
      SELECT ci.name,
        COALESCE(SUM(p.quantity),0)::int AS bought,
        (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases p2 ON s.purchase_id=p2.id WHERE p2.catalog_item_id=${id})::int AS sold,
        COALESCE(SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${id} GROUP BY ci.name`)[0];
    console.log(`  #${id} ${h.name}: bought ${h.bought}, sold ${h.sold}, held ${h.held}`);
  }
  console.log('\n=== recent WF/BB sales (last 6) ===');
  const s = await sql`
    SELECT s.sale_date, ci.name, s.quantity, s.sale_price_cents, s.platform
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    WHERE ci.id IN (31604,5241) ORDER BY s.created_at DESC LIMIT 6`;
  for (const r of s) console.log(`  ${r.sale_date instanceof Date?r.sale_date.toISOString().slice(0,10):r.sale_date} | ${r.name} | qty ${r.quantity} | $${(r.sale_price_cents/100).toFixed(2)} | ${r.platform}`);
  await sql.end();
}
main();
