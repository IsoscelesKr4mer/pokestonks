import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cols=await sql`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='purchases' ORDER BY ordinal_position`;
  console.log('purchases cols:', cols.map(c=>c.column_name).join(', '));
  const rows=await sql`SELECT p.* FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%destined rivals%' AND ci.name ILIKE '%pack%' ORDER BY p.purchase_date DESC LIMIT 3`;
  for(const r of rows) console.log(JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
