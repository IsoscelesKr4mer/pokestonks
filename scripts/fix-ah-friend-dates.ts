import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  // Set sale_date to the actual day each was logged (created_at), for the AH bundle Venmo sales mis-stamped 6/20
  await sql`UPDATE sales s SET sale_date = (s.created_at AT TIME ZONE 'America/Los_Angeles')::date
    FROM purchases p
    WHERE s.purchase_id=p.id AND p.catalog_item_id=76 AND s.platform='Venmo' AND s.sale_date='2026-06-20'`;
  const s = await sql`SELECT s.id, s.sale_date FROM sales s JOIN purchases p ON s.purchase_id=p.id
    WHERE p.catalog_item_id=76 AND s.platform='Venmo' ORDER BY s.created_at`;
  for (const r of s) console.log(`sale#${r.id} -> ${r.sale_date instanceof Date?r.sale_date.toISOString().slice(0,10):r.sale_date}`);
  await sql.end();
}
main();
