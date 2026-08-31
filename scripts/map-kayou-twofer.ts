import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const r = await sql`
    INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
    VALUES (${UID}, '168627240754', ${sql.json([{qty:2, catalogItemId:135082}])})
    RETURNING id, ebay_item_id, mappings`;
  console.log('MAPPED', JSON.stringify(r[0]));
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=135082 AND p.deleted_at IS NULL`)[0].h;
  console.log(`Kayou held ${held} | committed: single 4 + twofer 2 = 6 | spare ${held-6}`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
