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
    SELECT c.id AS catalog_item_id, c.name,
           COALESCE(pr.qty_held, 0) AS qty_held,
           pr.per_unit_cost_cents,
           lp.market_price_cents AS market_cents
    FROM catalog_items c
    LEFT JOIN purchase_remaining pr ON pr.catalog_item_id = c.id
    LEFT JOIN latest_prices lp ON lp.catalog_item_id = c.id
    WHERE (c.name ILIKE '%mega evolution%elite trainer box%'
           OR c.name ILIKE '%phantasmal flames%booster bundle%')
      AND c.name NOT ILIKE '%case%'
      AND c.name NOT ILIKE '%sleeved%'
    ORDER BY c.name;
  `;

  console.log('ME ETB / PF Bundle inventory:');
  for (const it of items) {
    const cost = it.per_unit_cost_cents != null ? `$${(it.per_unit_cost_cents / 100).toFixed(2)}` : '—';
    const mkt = it.market_cents != null ? `$${(it.market_cents / 100).toFixed(2)}` : '—';
    console.log(`[${it.catalog_item_id}] ${it.name}  qty=${it.qty_held}  cost/u=${cost}  market=${mkt}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
