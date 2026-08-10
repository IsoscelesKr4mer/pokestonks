import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const userId = (await sql`SELECT user_id FROM sales ORDER BY created_at DESC LIMIT 1`)[0].user_id;
  const groupId = randomUUID();
  const saleDate = '2026-06-14';
  const notes = 'Card show cash sale: 6x Prismatic Evolutions bundle + 1x White Flare bundle for $550 total';
  const platform = 'Card show (cash)';
  // FIFO: 6 oldest PE lots ($80 each) + WF lot ($70). matched cost $30/lot.
  const rows = [
    { purchaseId: 80,  sale: 8000 },
    { purchaseId: 120, sale: 8000 },
    { purchaseId: 215, sale: 8000 },
    { purchaseId: 237, sale: 8000 },
    { purchaseId: 300, sale: 8000 },
    { purchaseId: 308, sale: 8000 },
    { purchaseId: 327, sale: 7000 }, // WF bundle
  ];
  await sql`INSERT INTO sales ${sql(rows.map(r => ({
    user_id: userId, sale_group_id: groupId, purchase_id: r.purchaseId,
    sale_date: saleDate, quantity: 1, sale_price_cents: r.sale, fees_cents: 0,
    matched_cost_cents: 3000, platform, notes,
  })), 'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
  console.log('inserted 7 sale rows, group', groupId.slice(0,8));

  console.log('\n=== held after ===');
  for (const id of [19776, 31604]) {
    const h = (await sql`SELECT COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0];
    console.log(`  #${id}: held ${h.held}`);
  }
  const tot = (await sql`SELECT SUM(sale_price_cents) sp, SUM(matched_cost_cents) mc, SUM(fees_cents) f FROM sales WHERE sale_group_id=${groupId}`)[0];
  console.log(`\nsale total $${(tot.sp/100).toFixed(2)} | cost $${(tot.mc/100).toFixed(2)} | fees $${(tot.f/100).toFixed(2)} | profit $${((tot.sp-tot.mc-tot.f)/100).toFixed(2)}`);
  await sql.end();
}
main();
