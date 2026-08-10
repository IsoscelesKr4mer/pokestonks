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
  const items = await sql<
    {
      catalog_item_id: number;
      name: string;
      set_name: string | null;
      product_type: string | null;
      qty_held: number;
      per_unit_cost_cents: number | null;
      market_cents: number | null;
    }[]
  >`
    WITH purchase_remaining AS (
      SELECT p.catalog_item_id,
             SUM(p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id = p.id), 0)
                            - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id = p.id), 0)
                            - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id = p.id), 0))::int AS qty_held,
             AVG(p.cost_cents)::int AS per_unit_cost_cents
      FROM purchases p
      WHERE p.deleted_at IS NULL
      GROUP BY p.catalog_item_id
    ),
    latest_prices AS (
      SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents
      FROM market_prices
      ORDER BY catalog_item_id, snapshot_date DESC
    )
    SELECT c.id AS catalog_item_id, c.name, c.set_name, c.product_type,
           COALESCE(pr.qty_held, 0) AS qty_held,
           pr.per_unit_cost_cents,
           lp.market_price_cents AS market_cents
    FROM catalog_items c
    JOIN purchase_remaining pr ON pr.catalog_item_id = c.id
    LEFT JOIN latest_prices lp ON lp.catalog_item_id = c.id
    WHERE pr.qty_held > 0
    ORDER BY (COALESCE(lp.market_price_cents, 0) * pr.qty_held) DESC;
  `;

  console.log('Current inventory (qty > 0), sorted by total market value:');
  console.log('');
  let totalValue = 0;
  for (const it of items) {
    const cost = it.per_unit_cost_cents != null ? `$${(it.per_unit_cost_cents / 100).toFixed(2)}` : '—';
    const mkt = it.market_cents != null ? `$${(it.market_cents / 100).toFixed(2)}` : '—';
    const totalMkt = it.market_cents != null ? it.market_cents * it.qty_held : 0;
    totalValue += totalMkt;
    const totalStr = it.market_cents != null ? `$${(totalMkt / 100).toFixed(2)}` : '—';
    console.log(`[${it.catalog_item_id}] qty=${it.qty_held}  ${it.product_type || '?'}  ${it.name}  (${it.set_name || '?'})  cost/u=${cost}  mkt/u=${mkt}  total=${totalStr}`);
  }
  console.log('');
  console.log(`TOTAL UNIQUE ITEMS: ${items.length}`);
  console.log(`TOTAL MARKET VALUE: $${(totalValue / 100).toFixed(2)}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
