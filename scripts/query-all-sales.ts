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
  const sales = await sql<
    {
      sale_group_id: string;
      sale_date: string;
      catalog_names: string;
      total_quantity: number;
      total_gross_cents: number;
      total_fees_cents: number;
      total_cost_cents: number;
      platform: string | null;
      notes: string | null;
    }[]
  >`
    SELECT
      s.sale_group_id::text,
      MIN(s.sale_date)::text AS sale_date,
      STRING_AGG(DISTINCT c.name, ' + ' ORDER BY c.name) AS catalog_names,
      SUM(s.quantity)::int AS total_quantity,
      SUM(s.sale_price_cents)::int AS total_gross_cents,
      SUM(s.fees_cents)::int AS total_fees_cents,
      SUM(s.matched_cost_cents)::int AS total_cost_cents,
      MAX(s.platform) AS platform,
      MAX(s.notes) AS notes
    FROM sales s
    JOIN purchases p ON p.id = s.purchase_id
    JOIN catalog_items c ON c.id = p.catalog_item_id
    GROUP BY s.sale_group_id
    ORDER BY MIN(s.sale_date) ASC, s.sale_group_id::text;
  `;

  console.log(`Total sale groups: ${sales.length}`);
  console.log('');
  sales.forEach((s, i) => {
    const gross = (s.total_gross_cents / 100).toFixed(2);
    const fees = (s.total_fees_cents / 100).toFixed(2);
    const cost = (s.total_cost_cents / 100).toFixed(2);
    const pnl = ((s.total_gross_cents - s.total_fees_cents - s.total_cost_cents) / 100).toFixed(2);
    console.log(`${i + 1}. ${s.sale_date} · ${s.platform ?? '—'} · ${s.catalog_names}`);
    console.log(`   qty=${s.total_quantity}  gross=$${gross}  fees=$${fees}  cost=$${cost}  P&L=$${pnl}`);
    if (s.notes) console.log(`   notes: ${s.notes.slice(0, 80)}`);
  });

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
