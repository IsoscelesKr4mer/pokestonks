import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const uid = (await sql`SELECT user_id FROM ebay_listing_mappings LIMIT 1`)[0].user_id;
  const rows: [string, {catalogItemId:number;qty:number}[]][] = [
    ['168465363036', [{ catalogItemId: 19928, qty: 18 }]], // SS 18-pack
    ['168465363052', [{ catalogItemId: 198, qty: 1 }, { catalogItemId: 31884, qty: 18 }]], // ME ETB + 18 packs
  ];
  for (const [itemId, mappings] of rows) {
    await sql`INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings, updated_at)
      VALUES (${uid}, ${itemId}, ${sql.json(mappings)}, now())
      ON CONFLICT (user_id, ebay_item_id) DO UPDATE SET mappings = EXCLUDED.mappings, updated_at = now()`;
    console.log('mapped', itemId, JSON.stringify(mappings));
  }
  await sql.end();
}
main();
