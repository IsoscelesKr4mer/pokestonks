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
      cost_basis_cents: number;
      market_cents: number | null;
    }[]
  >`
    WITH purchase_totals AS (
      SELECT p.catalog_item_id, SUM(p.quantity) AS qty_purchased,
             SUM(p.cost_cents * p.quantity) AS total_cost
      FROM purchases p
      WHERE p.deleted_at IS NULL
      GROUP BY p.catalog_item_id
    ),
    rip_counts AS (
      SELECT r.source_purchase_id, COUNT(*) AS qty_ripped
      FROM rips r
      GROUP BY r.source_purchase_id
    ),
    decomp_counts AS (
      SELECT d.source_purchase_id, COUNT(*) AS qty_decomposed
      FROM box_decompositions d
      GROUP BY d.source_purchase_id
    ),
    sale_counts AS (
      SELECT s.purchase_id, SUM(s.quantity) AS qty_sold
      FROM sales s
      GROUP BY s.purchase_id
    ),
    purchase_remaining AS (
      SELECT p.catalog_item_id,
             SUM(p.quantity - COALESCE(rc.qty_ripped, 0) - COALESCE(dc.qty_decomposed, 0) - COALESCE(sc.qty_sold, 0)) AS qty_held,
             SUM((p.quantity - COALESCE(rc.qty_ripped, 0) - COALESCE(dc.qty_decomposed, 0) - COALESCE(sc.qty_sold, 0)) * p.cost_cents) AS cost_basis
      FROM purchases p
      LEFT JOIN rip_counts rc ON rc.source_purchase_id = p.id
      LEFT JOIN decomp_counts dc ON dc.source_purchase_id = p.id
      LEFT JOIN sale_counts sc ON sc.purchase_id = p.id
      WHERE p.deleted_at IS NULL
      GROUP BY p.catalog_item_id
    ),
    latest_prices AS (
      SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents, snapshot_date
      FROM market_prices
      ORDER BY catalog_item_id, snapshot_date DESC
    )
    SELECT c.id AS catalog_item_id, c.name,
           pr.qty_held::int AS qty_held,
           pr.cost_basis::int AS cost_basis_cents,
           lp.market_price_cents AS market_cents
    FROM catalog_items c
    JOIN purchase_remaining pr ON pr.catalog_item_id = c.id
    LEFT JOIN latest_prices lp ON lp.catalog_item_id = c.id
    WHERE c.name ILIKE '%ascended heroes%'
       OR c.name ILIKE '%ah %'
       OR c.name ILIKE '%pin collection%'
       OR c.name ILIKE '%poster collection%'
       OR c.name ILIKE '%pikachu pin%'
       OR c.name ILIKE '%mini tin%'
    ORDER BY c.name;
  `;

  console.log('AH-related holdings:');
  console.log('');
  for (const it of items) {
    const cost = (it.cost_basis_cents / 100).toFixed(2);
    const mkt = it.market_cents != null ? `$${(it.market_cents / 100).toFixed(2)}` : '—';
    const perUnit = it.qty_held > 0 ? (it.cost_basis_cents / it.qty_held / 100).toFixed(2) : '—';
    console.log(`[${it.catalog_item_id}] ${it.name}`);
    console.log(`   qty held: ${it.qty_held}   per-unit cost: $${perUnit}   market: ${mkt}`);
    console.log('');
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
