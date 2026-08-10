import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const uid = (await sql`SELECT user_id FROM ebay_listing_mappings LIMIT 1`)[0].user_id;
  const rows: [string, {catalogItemId:number;qty:number}[]][] = [
    ['168450583170', [{ catalogItemId: 53866, qty: 1 }]], // PC ETB
    ['168450583357', [{ catalogItemId: 53858, qty: 1 }]], // Booster Box
    ['168450583388', [{ catalogItemId: 53860, qty: 1 }]], // Booster Bundle
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
