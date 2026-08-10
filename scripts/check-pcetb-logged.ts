import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const s = await sql`SELECT s.id, s.sale_group_id, s.purchase_id, s.sale_date, s.quantity, s.sale_price_cents, s.fees_cents, s.matched_cost_cents, s.platform, s.notes
    FROM sales s JOIN purchases p ON s.purchase_id=p.id WHERE p.catalog_item_id=53866`;
  for (const r of s) console.log('SALE:', JSON.stringify(r));
  const o = await sql`SELECT eso.id, eso.ebay_order_id, eso.sale_group_id, eso.skipped, eso.user_id FROM ebay_synced_orders eso WHERE eso.ebay_order_id='05-14774-59928'`;
  console.log('SYNCED_ORDER:', JSON.stringify(o[0]));
  // remaining open lot for #53866
  const lot = await sql`SELECT p.id, p.cost_cents,
    (p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
    - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
    - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)) AS qty_left
    FROM purchases p WHERE p.catalog_item_id=53866 AND p.deleted_at IS NULL`;
  console.log('LOTS:', JSON.stringify(lot));
  await sql.end();
}
main();
