import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== PC ETB #53866 purchases / held / sales ===');
  const pur = await sql`SELECT id, purchase_date, quantity, cost_cents FROM purchases WHERE catalog_item_id=53866 AND deleted_at IS NULL ORDER BY purchase_date`;
  console.log('purchases:', pur.length ? pur.map((p:any)=>`#${p.id} ${p.purchase_date instanceof Date?p.purchase_date.toISOString().slice(0,10):p.purchase_date} qty${p.quantity} $${(p.cost_cents/100).toFixed(2)}`).join(' | ') : 'NONE logged');
  const held = (await sql`SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
    FROM purchases p WHERE p.catalog_item_id=53866 AND p.deleted_at IS NULL`)[0];
  console.log('held:', held.held);
  const sales = await sql`SELECT s.id, s.sale_date, s.quantity, s.sale_price_cents, s.platform, s.notes FROM sales s JOIN purchases p ON s.purchase_id=p.id WHERE p.catalog_item_id=53866 ORDER BY s.created_at DESC`;
  console.log('sales logged:', sales.length ? sales.map((s:any)=>`$${(s.sale_price_cents/100).toFixed(2)} ${s.platform} ${s.notes??''}`).join(' | ') : 'NONE');

  console.log('\n=== ebay_synced_orders: skipped rows ===');
  const sk = await sql`SELECT ebay_order_id, sale_group_id, skipped, synced_at FROM ebay_synced_orders WHERE skipped=true ORDER BY synced_at DESC`;
  for (const o of sk) console.log(`  ${o.ebay_order_id} | skipped | ${o.synced_at.toISOString().slice(0,16)}`);

  console.log('\n=== last_synced watermark ===');
  const ws = await sql`SELECT last_synced_at FROM ebay_sync_state LIMIT 1`;
  console.log('  last_synced_at:', ws[0]?.last_synced_at?.toISOString());
  await sql.end();
}
main();
