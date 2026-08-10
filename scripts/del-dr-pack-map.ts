import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const del = await sql`DELETE FROM ebay_listing_mappings WHERE ebay_item_id='168538028314' RETURNING ebay_item_id`;
  console.log('deleted DR-PACK mapping rows:', del.length);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
