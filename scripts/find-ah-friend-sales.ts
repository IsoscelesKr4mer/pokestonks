import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const s = await sql`SELECT s.id, s.sale_date, s.created_at, s.sale_price_cents, s.notes
    FROM sales s JOIN purchases p ON s.purchase_id=p.id
    WHERE p.catalog_item_id=76 AND s.platform='Venmo'
    ORDER BY s.created_at`;
  for (const r of s) console.log(`sale#${r.id} | sale_date ${r.sale_date instanceof Date?r.sale_date.toISOString().slice(0,10):r.sale_date} | created_at ${r.created_at.toISOString()} | $${(r.sale_price_cents/100).toFixed(2)}`);
  await sql.end();
}
main();
