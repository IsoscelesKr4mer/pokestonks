import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cols=await sql`SELECT column_name FROM information_schema.columns WHERE table_name='ebay_listing_mappings' ORDER BY ordinal_position`;
  console.log('mapping cols:', cols.map(r=>r.column_name).join(', '));
  const m=await sql`SELECT * FROM ebay_listing_mappings WHERE ebay_sku ILIKE '%WF-2PACK%' OR listing_title ILIKE '%white flare%' ORDER BY ebay_sku`;
  for(const r of m) console.log(JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,200));process.exit(1);});
