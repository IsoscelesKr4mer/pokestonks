import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const byCode = await sql`SELECT id, name, product_type, set_name, set_code, last_market_cents, manual_market_cents FROM catalog_items WHERE set_code='30C' AND product_type ILIKE '%elite%' ORDER BY id`;
  console.log('30C ETBs:', JSON.stringify(byCode, null, 2));
  const byName = await sql`SELECT id, name, product_type, set_name, set_code, last_market_cents FROM catalog_items WHERE name ILIKE '%30th%' AND name ILIKE '%center%'`;
  console.log('\n30th + center:', JSON.stringify(byName, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
