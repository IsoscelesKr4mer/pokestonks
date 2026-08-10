import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT id, name, product_type, set_name FROM catalog_items WHERE name ILIKE '%30th%' OR name ILIKE '%celebration%' OR set_name ILIKE '%30th%' ORDER BY id`;
  console.log('catalog matches for 30th/Celebration:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
