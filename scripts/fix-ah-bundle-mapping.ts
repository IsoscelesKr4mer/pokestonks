import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const itemId = '168431993899'; // AH-BUNDLE listing
  const correct = [{ catalogItemId: 76, qty: 1 }]; // one AH Booster Bundle
  console.log('before:', JSON.stringify((await sql`SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`)[0]?.mappings));
  await sql`UPDATE ebay_listing_mappings SET mappings=${sql.json(correct)}, updated_at=now() WHERE ebay_item_id=${itemId}`;
  console.log('after: ', JSON.stringify((await sql`SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id=${itemId}`)[0]?.mappings));
  await sql.end();
}
main();
