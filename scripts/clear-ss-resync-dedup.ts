/**
 * Clear the dedup + watermark for eBay order 14-14698-00727 so it reappears
 * in sync-preview after the user undoes the bad re-sync. Run this AFTER pushing
 * the lineItemCost code fix (so the next sync uses the corrected math).
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

  const EBAY_ORDER_ID = '14-14698-00727';
  const rollbackTo = new Date('2026-05-29T00:00:00Z');

  await sql.begin(async (tx) => {
    const deleted = await tx`
      DELETE FROM ebay_synced_orders WHERE ebay_order_id = ${EBAY_ORDER_ID} RETURNING id, synced_at;
    `;
    console.log(`Deleted ${deleted.length} ebay_synced_orders row(s) for ${EBAY_ORDER_ID}:`, deleted);

    const updated = await tx`
      UPDATE ebay_sync_state SET last_synced_at = ${rollbackTo} RETURNING last_synced_at;
    `;
    console.log('Watermark rolled back to:', updated[0]?.last_synced_at);
  });

  await sql.end();
  console.log('\nDONE. After Vercel deploys, undo the current sale in the modal, then click "Sync from eBay".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
