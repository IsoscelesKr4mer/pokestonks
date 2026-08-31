import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows:any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings ORDER BY ebay_item_id`;
  for (const r of rows) {
    const t = JSON.stringify(r.mappings);
    if (t.includes('17235') || t.includes('19776')) console.log(r.ebay_item_id, t);
  }
  console.log('total mapping rows:', rows.length);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
