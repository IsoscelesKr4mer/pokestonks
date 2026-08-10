import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== recent ebay_synced_orders (last 12 by synced_at) ===');
  const so = await sql`SELECT ebay_order_id, sale_group_id, skipped, synced_at FROM ebay_synced_orders ORDER BY synced_at DESC LIMIT 12`;
  for (const o of so) console.log(`  ${o.ebay_order_id} | grp ${o.sale_group_id?String(o.sale_group_id).slice(0,8):'(none)'} | skipped ${o.skipped} | ${o.synced_at.toISOString().slice(0,16)}`);

  console.log('\n=== recent sales (last 18 by created_at) ===');
  const s = await sql`
    SELECT s.id, s.sale_group_id, s.sale_date, ci.id AS cid, ci.name, s.quantity, s.sale_price_cents, s.created_at
    FROM sales s JOIN purchases p ON s.purchase_id=p.id JOIN catalog_items ci ON p.catalog_item_id=ci.id
    ORDER BY s.created_at DESC LIMIT 18`;
  for (const r of s) console.log(`  sale#${r.id} grp ${String(r.sale_group_id).slice(0,8)} | ${(r.sale_date instanceof Date?r.sale_date.toISOString().slice(0,10):r.sale_date)} | #${r.cid} ${r.name} | qty ${r.quantity} | $${(r.sale_price_cents/100).toFixed(2)} | ${r.created_at.toISOString().slice(0,16)}`);

  console.log('\n=== sales count per catalog item (held check) for the 4 corrupted ids ===');
  for (const id of [76, 7778, 7779, 7780]) {
    const h = (await sql`
      SELECT ci.name,
        COALESCE(SUM(p.quantity),0)::int AS bought,
        COALESCE((SELECT SUM(s.quantity) FROM sales s JOIN purchases p2 ON s.purchase_id=p2.id WHERE p2.catalog_item_id=ci.id),0)::int AS sold,
        COALESCE(SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${id} GROUP BY ci.name`)[0];
    console.log(`  #${id} ${h.name}: bought ${h.bought}, sold ${h.sold}, held ${h.held}`);
  }
  await sql.end();
}
main();
