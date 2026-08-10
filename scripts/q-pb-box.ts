import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const purch = await sql`SELECT p.id, p.purchase_date, p.quantity, p.cost_cents, p.source, p.notes,
      COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)::int AS sold
    FROM purchases p WHERE p.catalog_item_id=53858 AND p.deleted_at IS NULL ORDER BY p.purchase_date, p.id`;
  console.log('Pitch Black Booster Box (53858) lots:', JSON.stringify(purch, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
