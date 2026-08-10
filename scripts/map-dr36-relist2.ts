import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const itemId = '168483384016';
  const mappings = [{ catalogItemId: 17236, qty: 36 }];
  const uid = (await sql`SELECT user_id FROM ebay_listing_mappings LIMIT 1`)[0].user_id;
  await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings, updated_at)
    VALUES (${uid}, ${itemId}, ${sql.json(mappings)}, now())
    ON CONFLICT (user_id, ebay_item_id) DO UPDATE SET mappings = EXCLUDED.mappings, updated_at = now()`;
  const row = (await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`)[0];
  console.log('mapping set:', row.ebay_item_id, JSON.stringify(row.mappings));
  await sql.end();
}
main();
