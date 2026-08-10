/**
 * Repair the bad sync of eBay order 14-14698-00727:
 *  - Delete the 32 sales rows (sale_group_id 7b43f211-...) — the bad sale
 *  - Delete the ebay_synced_orders dedup row so the order re-appears in sync
 *  - Soft-delete the manual re-add purchases (pid 276 BB, pid 277 WF) — the
 *    user added these to compensate for the inflated qty consumption
 *  - Fix the SS 36-pack listing mapping to map only to SS Pack catalog item
 *    (remove the bogus BB Bundle + WF Bundle entries)
 *  - Roll back ebay_sync_state.last_synced_at so the order shows up in next preview
 *
 * After this runs, the user clicks "Sync from eBay" and the order re-imports
 * cleanly using the fixed `lineItemCost` revenue allocation. End state:
 *   BB held: 3, WF held: 2 (matches user's real-world inventory)
 *
 * Run with: npx tsx scripts/repair-ss-sale.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

  const SALE_GROUP_ID = '7b43f211-39c4-4273-ab63-2e222bbb321f';
  const EBAY_ORDER_ID = '14-14698-00727';
  const SS_LISTING_EBAY_ITEM_ID = '168410660264';
  const BB_READD_PID = 276;
  const WF_READD_PID = 277;

  // Roll watermark back to May 29 00:00 UTC so the order reappears.
  const rollbackTo = new Date('2026-05-29T00:00:00Z');

  console.log('--- Before ---');
  const before = await sql`
    SELECT
      (SELECT COUNT(*) FROM sales WHERE sale_group_id = ${SALE_GROUP_ID})::int AS bad_sale_rows,
      (SELECT COUNT(*) FROM ebay_synced_orders WHERE ebay_order_id = ${EBAY_ORDER_ID})::int AS synced_dedup_rows,
      (SELECT deleted_at FROM purchases WHERE id = ${BB_READD_PID}) AS bb_readd_deleted_at,
      (SELECT deleted_at FROM purchases WHERE id = ${WF_READD_PID}) AS wf_readd_deleted_at,
      (SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id = ${SS_LISTING_EBAY_ITEM_ID}) AS ss_mapping,
      (SELECT last_synced_at FROM ebay_sync_state LIMIT 1) AS last_synced_at
  `;
  console.log(before[0]);

  await sql.begin(async (tx) => {
    // 1) Delete sales rows in the bad sale group.
    const deletedSales = await tx`
      DELETE FROM sales WHERE sale_group_id = ${SALE_GROUP_ID} RETURNING id;
    `;
    console.log(`Deleted ${deletedSales.length} sales rows`);

    // 2) Delete the ebay_synced_orders dedup row.
    const deletedSynced = await tx`
      DELETE FROM ebay_synced_orders WHERE ebay_order_id = ${EBAY_ORDER_ID} RETURNING id;
    `;
    console.log(`Deleted ${deletedSynced.length} ebay_synced_orders rows`);

    // 3) Soft-delete the manual re-add purchases.
    const deletedReadd = await tx`
      UPDATE purchases
      SET deleted_at = NOW()
      WHERE id IN (${BB_READD_PID}, ${WF_READD_PID})
      RETURNING id, (SELECT name FROM catalog_items WHERE id = purchases.catalog_item_id) AS name;
    `;
    console.log(`Soft-deleted ${deletedReadd.length} re-add purchases:`, deletedReadd);

    // 4) Fix the SS listing mapping — keep only the SS pack catalog item.
    const fixedMapping = await tx`
      UPDATE ebay_listing_mappings
      SET mappings = ${sql.json([{ qty: 36, catalogItemId: 19928 }])}::jsonb,
          updated_at = NOW()
      WHERE ebay_item_id = ${SS_LISTING_EBAY_ITEM_ID}
      RETURNING ebay_item_id, mappings;
    `;
    console.log('Fixed mapping:', fixedMapping[0]);

    // 5) Roll back the sync watermark so the order reappears.
    const updated = await tx`
      UPDATE ebay_sync_state
      SET last_synced_at = ${rollbackTo}
      RETURNING last_synced_at;
    `;
    console.log('Watermark rolled back to:', updated[0]?.last_synced_at);
  });

  console.log('\n--- After ---');
  const after = await sql`
    SELECT
      (SELECT COUNT(*) FROM sales WHERE sale_group_id = ${SALE_GROUP_ID})::int AS bad_sale_rows,
      (SELECT COUNT(*) FROM ebay_synced_orders WHERE ebay_order_id = ${EBAY_ORDER_ID})::int AS synced_dedup_rows,
      (SELECT deleted_at FROM purchases WHERE id = ${BB_READD_PID}) AS bb_readd_deleted_at,
      (SELECT deleted_at FROM purchases WHERE id = ${WF_READD_PID}) AS wf_readd_deleted_at,
      (SELECT mappings FROM ebay_listing_mappings WHERE ebay_item_id = ${SS_LISTING_EBAY_ITEM_ID}) AS ss_mapping,
      (SELECT last_synced_at FROM ebay_sync_state LIMIT 1) AS last_synced_at
  `;
  console.log(after[0]);

  // Sanity-check inventory
  const inv = await sql`
    SELECT c.name,
           COALESCE(SUM(
             p.quantity
             - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id = p.id), 0)
             - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id = p.id), 0)
             - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id = p.id), 0)
           ), 0)::int AS qty_held
    FROM purchases p
    JOIN catalog_items c ON c.id = p.catalog_item_id
    WHERE p.deleted_at IS NULL
      AND p.catalog_item_id IN (5241, 31604, 19928)
    GROUP BY c.name
    ORDER BY c.name;
  `;
  console.log('\nInventory (pre-resync):');
  for (const r of inv as unknown as Array<{ name: string; qty_held: number }>) {
    console.log(`  ${r.name}: ${r.qty_held}`);
  }

  await sql.end();
  console.log('\nDONE. Now go to /sales in the app and click "Sync from eBay".');
}

main().catch((err) => {
  console.error('Repair FAILED:', err);
  process.exit(1);
});
