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
  // The eBay order ID from the screenshot
  const ebayOrderId = '14-14698-00727';

  const synced = await sql`
    SELECT * FROM ebay_synced_orders WHERE ebay_order_id = ${ebayOrderId};
  `;
  console.log('ebay_synced_orders:', JSON.stringify(synced, null, 2));

  if (synced.length === 0) return;
  const saleGroupId = (synced[0] as { sale_group_id: string }).sale_group_id;

  const sales = await sql`
    SELECT s.id, s.sale_group_id, s.purchase_id, s.sale_date, s.quantity,
           s.sale_price_cents, s.fees_cents, s.matched_cost_cents, s.platform, s.notes,
           p.catalog_item_id, p.cost_cents AS purchase_cost_cents,
           c.name AS catalog_name
    FROM sales s
    JOIN purchases p ON p.id = s.purchase_id
    JOIN catalog_items c ON c.id = p.catalog_item_id
    WHERE s.sale_group_id = ${saleGroupId}
    ORDER BY c.name, s.id;
  `;
  console.log(`\nsales rows for sale_group_id ${saleGroupId}: ${sales.length} rows`);
  for (const row of sales) {
    const r = row as {
      id: number; catalog_name: string; quantity: number;
      sale_price_cents: number; fees_cents: number; matched_cost_cents: number;
      purchase_cost_cents: number;
    };
    console.log(
      `  [${r.id}] ${r.catalog_name}  qty=${r.quantity}  ` +
      `sale=$${(r.sale_price_cents/100).toFixed(2)}  ` +
      `fees=$${(r.fees_cents/100).toFixed(2)}  ` +
      `matched_cost=$${(r.matched_cost_cents/100).toFixed(2)}  ` +
      `purchase_cost=$${(r.purchase_cost_cents/100).toFixed(2)}`
    );
  }

  // Sum aggregates by catalog
  type Row = { catalog_name: string; quantity: number; sale_price_cents: number; fees_cents: number; matched_cost_cents: number };
  const byCat = new Map<string, { qty: number; rev: number; fee: number; cost: number }>();
  for (const r of sales as unknown as Row[]) {
    const agg = byCat.get(r.catalog_name) ?? { qty: 0, rev: 0, fee: 0, cost: 0 };
    agg.qty += r.quantity;
    agg.rev += r.sale_price_cents;
    agg.fee += r.fees_cents;
    agg.cost += r.matched_cost_cents;
    byCat.set(r.catalog_name, agg);
  }
  console.log('\nPer-catalog aggregates:');
  for (const [name, a] of byCat) {
    console.log(`  ${name}  qty=${a.qty}  rev=$${(a.rev/100).toFixed(2)}  fee=$${(a.fee/100).toFixed(2)}  cost=$${(a.cost/100).toFixed(2)}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
