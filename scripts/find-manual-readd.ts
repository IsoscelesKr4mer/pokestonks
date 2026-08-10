import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  // BB Bundle = 5241, WF Bundle = 31604. Show recent purchases (last 7 days).
  const recent = await sql`
    SELECT p.id, p.catalog_item_id, c.name, p.purchase_date, p.quantity,
           p.cost_cents, p.source, p.notes, p.created_at
    FROM purchases p
    JOIN catalog_items c ON c.id = p.catalog_item_id
    WHERE p.catalog_item_id IN (5241, 31604)
      AND p.deleted_at IS NULL
      AND p.created_at >= NOW() - INTERVAL '7 days'
    ORDER BY p.created_at DESC;
  `;
  console.log('Recent BB/WF Bundle purchases (last 7 days):');
  for (const r of recent as unknown as Array<{
    id: number; name: string; purchase_date: string; quantity: number;
    cost_cents: number; source: string | null; notes: string | null; created_at: string;
  }>) {
    console.log(
      `  [purchase_id=${r.id}] ${r.name} ` +
      `date=${r.purchase_date} qty=${r.quantity} cost=$${(r.cost_cents/100).toFixed(2)} ` +
      `source=${r.source ?? '—'} notes=${r.notes ?? '—'} created=${r.created_at}`
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
