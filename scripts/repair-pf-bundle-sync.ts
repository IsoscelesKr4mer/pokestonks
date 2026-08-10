/**
 * Repair the bad sync of eBay order 15-14698-80037 (PF Booster Bundle x2):
 *  - Fix the mapping for ebay_item_id 168396962298: qty 2 -> 1 (per-listing-
 *    unit qty, not per-order qty)
 *  - Delete the orphan ebay_synced_orders row (id=31) so the order reappears
 *    in sync preview
 *  - Roll the watermark back so the order shows up
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

  const EBAY_ITEM_ID = '168396962298';
  const PF_CATALOG_ID = 1649;
  const ORPHAN_ID = 31;
  const rollbackTo = new Date('2026-05-30T20:00:00Z'); // 13:00 PDT — before any of today's syncs

  console.log('--- Before ---');
  const before = await sql`
    SELECT
      (SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id = ${EBAY_ITEM_ID}) AS mapping,
      (SELECT COUNT(*) FROM ebay_synced_orders WHERE id = ${ORPHAN_ID})::int AS orphan_exists,
      (SELECT last_synced_at FROM ebay_sync_state LIMIT 1) AS watermark
  `;
  console.log(before[0]);

  await sql.begin(async (tx) => {
    // 1) Fix the mapping
    const fixedMapping = await tx`
      UPDATE ebay_listing_mappings
      SET mappings = ${sql.json([{ qty: 1, catalogItemId: PF_CATALOG_ID }])}::jsonb,
          updated_at = NOW()
      WHERE ebay_item_id = ${EBAY_ITEM_ID}
      RETURNING ebay_item_id, mappings;
    `;
    console.log('Fixed mapping:', fixedMapping[0]);

    // 2) Delete the orphan dedup row
    const deleted = await tx`DELETE FROM ebay_synced_orders WHERE id = ${ORPHAN_ID} RETURNING id;`;
    console.log(`Deleted ${deleted.length} orphan dedup row(s)`);

    // 3) Roll back watermark
    const updated = await tx`
      UPDATE ebay_sync_state SET last_synced_at = ${rollbackTo} RETURNING last_synced_at;
    `;
    console.log('Watermark rolled back to:', updated[0]?.last_synced_at);
  });

  console.log('\n--- After ---');
  const after = await sql`
    SELECT
      (SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id = ${EBAY_ITEM_ID}) AS mapping,
      (SELECT COUNT(*) FROM ebay_synced_orders WHERE id = ${ORPHAN_ID})::int AS orphan_exists,
      (SELECT last_synced_at FROM ebay_sync_state LIMIT 1) AS watermark
  `;
  console.log(after[0]);

  await sql.end();
  console.log('\nDONE. Click "Sync from eBay" — the order will reappear with qty=2 PF Bundles.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
