import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='ebay_listing_mappings' ORDER BY ordinal_position`;
  console.log('ebay_listing_mappings columns:');
  for (const c of cols) console.log(' ', c.column_name, c.data_type);
  const rows = await sql`SELECT * FROM ebay_listing_mappings ORDER BY id DESC LIMIT 3`;
  console.log('\nrecent mappings:');
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
