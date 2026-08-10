import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT id, name, product_type, set_name, set_code, last_market_cents FROM catalog_items
    WHERE name ILIKE '%destined rivals%' AND (name ILIKE '%bundle%' OR product_type ILIKE '%bundle%') ORDER BY id`;
  console.log('Destined Rivals bundles:', JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
