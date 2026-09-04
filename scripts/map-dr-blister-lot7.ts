/**
 * Map the Destined Rivals 7-blister lot listing to the vault, and retire the
 * mapping for the ended twofer listing so a stray sync cannot fire on it.
 *
 *   npx tsx scripts/map-dr-blister-lot7.ts <ebayItemId>
 *
 * Qty is PER LISTING UNIT: one sale of this listing moves 4x ci17246 (Eevee)
 * and 3x ci17247 (Zarude). See [[reference_ebay_sync_mapping_qty]] - getting
 * this wrong is what produced the doubled-qty sync bug before.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const ITEM = process.argv[2];
if (!ITEM || !/^\d{10,}$/.test(ITEM)) {
  console.error('usage: npx tsx scripts/map-dr-blister-lot7.ts <ebayItemId>');
  process.exit(1);
}
const OLD_ITEM = '168609434868'; // ended 2026-09-03, replaced by this lot

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const uid: any = await sql`SELECT user_id FROM ebay_listing_mappings ORDER BY id DESC LIMIT 1`;
  const mappings = [
    { catalogItemId: 17246, qty: 4 },
    { catalogItemId: 17247, qty: 3 },
  ];
  const existing: any = await sql`SELECT id FROM ebay_listing_mappings WHERE ebay_item_id=${ITEM}`;
  if (existing.length) {
    await sql`UPDATE ebay_listing_mappings SET mappings=${sql.json(mappings)}, updated_at=now() WHERE ebay_item_id=${ITEM}`;
    console.log(`updated mapping row ${existing[0].id} for ${ITEM}`);
  } else {
    const ins: any = await sql`
      INSERT INTO ebay_listing_mappings (user_id, ebay_item_id, mappings)
      VALUES (${uid[0].user_id}, ${ITEM}, ${sql.json(mappings)}) RETURNING id`;
    console.log(`inserted mapping row ${ins[0].id} for ${ITEM}: 4x ci17246 + 3x ci17247 per unit`);
  }
  const del: any = await sql`DELETE FROM ebay_listing_mappings WHERE ebay_item_id=${OLD_ITEM} RETURNING id`;
  console.log(del.length ? `removed stale mapping ${del[0].id} for ended listing ${OLD_ITEM}` : `no mapping found for ${OLD_ITEM}`);
  const all: any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE mappings::text LIKE '%1724%'`;
  console.log(JSON.stringify(all, null, 1));
  await sql.end();
})();
