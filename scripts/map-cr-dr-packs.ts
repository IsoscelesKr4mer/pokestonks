import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const uid = '66200525-2237-4cc3-948f-aaafd3253d4b';
  await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${uid}, '168538028269', ${sql.json([{qty:1, catalogItemId:53877}])})`;
  await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${uid}, '168538028314', ${sql.json([{qty:1, catalogItemId:17236}])})`;
  const rows = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE ebay_item_id IN ('168538028269','168538028314')`;
  console.log(JSON.stringify(rows, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
