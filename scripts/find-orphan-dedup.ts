/**
 * Find ebay_synced_orders rows where the referenced sale_group_id no longer
 * has any sales rows — these are the "stuck" dedup rows left behind after
 * the user undoes a bad sync. The sync-preview will skip these orders.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

  const orphans = await sql`
    SELECT eso.id, eso.ebay_order_id, eso.sale_group_id, eso.skipped, eso.synced_at,
           (SELECT COUNT(*) FROM sales s WHERE s.sale_group_id = eso.sale_group_id)::int AS sales_rows
    FROM ebay_synced_orders eso
    WHERE eso.skipped = false
      AND eso.sale_group_id IS NOT NULL
      AND (SELECT COUNT(*) FROM sales s WHERE s.sale_group_id = eso.sale_group_id) = 0
    ORDER BY eso.synced_at DESC;
  `;
  console.log('Orphan dedup rows (synced but no sales — bad sync that was undone):');
  for (const o of orphans as unknown as Array<{
    id: number; ebay_order_id: string; sale_group_id: string; synced_at: string;
  }>) {
    console.log(`  id=${o.id}  order=${o.ebay_order_id}  synced=${o.synced_at}  sg=${o.sale_group_id}`);
  }

  // Also show most recent ebay_synced_orders to see what was just attempted
  console.log('\nMost recent ebay_synced_orders (last 5):');
  const recent = await sql`
    SELECT id, ebay_order_id, sale_group_id, skipped, synced_at
    FROM ebay_synced_orders
    ORDER BY synced_at DESC
    LIMIT 5;
  `;
  for (const r of recent as unknown as Array<{
    id: number; ebay_order_id: string; sale_group_id: string | null; skipped: boolean; synced_at: string;
  }>) {
    console.log(`  id=${r.id}  order=${r.ebay_order_id}  skipped=${r.skipped}  sg=${r.sale_group_id ?? 'null'}  synced=${r.synced_at}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
