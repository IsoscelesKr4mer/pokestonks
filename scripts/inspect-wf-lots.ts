import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== ALL White Flare Bundle (#31604) purchase lots ===');
  const lots = await sql`SELECT id, purchase_date, quantity, cost_cents, source, notes FROM purchases WHERE catalog_item_id=31604 AND deleted_at IS NULL ORDER BY purchase_date, created_at`;
  for (const l of lots) console.log(`  lot#${l.id} | ${l.purchase_date instanceof Date?l.purchase_date.toISOString().slice(0,10):l.purchase_date} | qty${l.quantity} @ $${(l.cost_cents/100).toFixed(2)} | ${l.source??''} | ${l.notes??''}`);
  console.log('\n=== which WF lots the 2 just-logged sales consumed ===');
  const s = await sql`SELECT s.purchase_id, s.sale_price_cents, s.matched_cost_cents, s.sale_date, s.notes FROM sales s JOIN purchases p ON s.purchase_id=p.id WHERE p.catalog_item_id=31604 ORDER BY s.created_at DESC LIMIT 4`;
  for (const r of s) console.log(`  matched purchase#${r.purchase_id} | salePrice $${(r.sale_price_cents/100).toFixed(2)} | matchedCost $${(r.matched_cost_cents/100).toFixed(2)} | ${r.sale_date instanceof Date?r.sale_date.toISOString().slice(0,10):r.sale_date}`);
  await sql.end();
}
main();
