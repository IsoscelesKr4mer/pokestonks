import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const r = await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${UID}, '168625923960', ${sql.json([{qty:1, catalogItemId:135083}])})
    RETURNING id, ebay_item_id, mappings`;
  console.log('MAPPED', JSON.stringify(r[0]));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
