import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cr = await sql`SELECT id, name, product_type, set_name, set_code, last_market_cents FROM catalog_items WHERE name ILIKE '%chaos rising%' AND product_type ILIKE '%elite%' ORDER BY id`;
  console.log('Chaos Rising ETBs:', JSON.stringify(cr, null, 2));
  const cols = await sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='sales' ORDER BY ordinal_position`;
  console.log('\nsales columns:');
  for (const c of cols) console.log(' ', c.column_name, c.data_type, c.is_nullable);
  const recent = await sql`SELECT * FROM sales ORDER BY id DESC LIMIT 2`;
  console.log('\nrecent sales:', JSON.stringify(recent, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
