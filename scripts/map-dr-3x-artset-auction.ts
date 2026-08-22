import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  // 12x per listing unit: one sale decrements sleeved held by 12, not 1.
  const r = await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${UID}, '168632581778', ${sql.json([{qty:12, catalogItemId:17232}])})
    RETURNING id, ebay_item_id, mappings`;
  console.log('MAPPED', JSON.stringify(r[0]));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
