import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const userId = '66200525-2237-4cc3-948f-aaafd3253d4b';
  const groupId = randomUUID();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO sales ${tx({
      user_id: userId, sale_group_id: groupId, purchase_id: 353,
      sale_date: '2026-06-13', quantity: 1, sale_price_cents: 19999,
      fees_cents: 3037, matched_cost_cents: 6000, platform: 'eBay',
      notes: 'eBay order #05-14774-59928',
    }, 'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
    await tx`UPDATE ebay_synced_orders SET skipped=false, sale_group_id=${groupId} WHERE ebay_order_id='05-14774-59928'`;
  });
  console.log('logged sale, group', groupId.slice(0,8), '+ flipped dedup row to synced');

  const held = (await sql`SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
    FROM purchases p WHERE p.catalog_item_id=53866 AND p.deleted_at IS NULL`)[0];
  const tot = (await sql`SELECT COUNT(*)::int c, SUM(sale_price_cents) sp, SUM(fees_cents) f, SUM(matched_cost_cents) mc
    FROM sales s JOIN purchases p ON s.purchase_id=p.id WHERE p.catalog_item_id=53866`)[0];
  console.log(`PC ETB held now: ${held.held}`);
  console.log(`PC ETB sales: ${tot.c} | revenue $${(tot.sp/100).toFixed(2)} | fees $${(tot.f/100).toFixed(2)} | cost $${(tot.mc/100).toFixed(2)} | realized profit $${((tot.sp-tot.f-tot.mc)/100).toFixed(2)}`);
  await sql.end();
}
main();
