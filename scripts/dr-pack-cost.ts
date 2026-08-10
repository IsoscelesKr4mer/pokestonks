import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // find recent Destined Rivals pack purchases
  const rows=await sql`SELECT p.id,p.catalog_item_id,p.quantity,p.unit_cost_cents,p.source,p.location,p.purchase_date,ci.name
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%destined rivals%' AND ci.name ILIKE '%pack%' AND p.deleted_at IS NULL
    ORDER BY p.purchase_date DESC LIMIT 5`;
  for(const r of rows) console.log(`${r.purchase_date} qty${r.quantity} $${(r.unit_cost_cents/100).toFixed(2)} | ${r.source} | ${r.location} | ci${r.catalog_item_id} ${r.name}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
