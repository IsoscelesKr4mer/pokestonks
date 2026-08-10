import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT id, name, product_type, set_name, tcgplayer_product_id, msrp_cents FROM catalog_items
    WHERE name ILIKE '%pokemon center%' AND (name ILIKE '%elite%' OR name ILIKE '%etb%' OR name ILIKE '%trainer%')
    ORDER BY id DESC LIMIT 20`;
  console.log('Pokemon Center ETB catalog entries:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  const cols = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='catalog_items' ORDER BY ordinal_position`;
  console.log('\ncatalog_items columns:');
  for (const c of cols) console.log(' ', c.column_name, c.data_type, c.is_nullable);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
