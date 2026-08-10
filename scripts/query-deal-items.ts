import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const ids = [19841, 198, 31900, 76];
  const r = await sql`
    WITH purchase_remaining AS (
      SELECT p.catalog_item_id,
             SUM(p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id = p.id), 0)
                            - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id = p.id), 0)
                            - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id = p.id), 0))::int AS qty_held,
             AVG(p.cost_cents)::int AS cost
      FROM purchases p WHERE p.deleted_at IS NULL
      GROUP BY p.catalog_item_id
    ),
    lp AS (
      SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents
      FROM market_prices ORDER BY catalog_item_id, snapshot_date DESC
    )
    SELECT c.id, c.name, c.product_type, COALESCE(pr.qty_held,0) AS qty, pr.cost, lp.market_price_cents AS mkt
    FROM catalog_items c
    LEFT JOIN purchase_remaining pr ON pr.catalog_item_id = c.id
    LEFT JOIN lp ON lp.catalog_item_id = c.id
    WHERE c.id = ANY(${ids}) ORDER BY c.id`;
  for (const it of r) {
    const c = it.cost != null ? `$${(it.cost/100).toFixed(2)}` : '—';
    const m = it.mkt != null ? `$${(it.mkt/100).toFixed(2)}` : '—';
    console.log(`[${it.id}] ${it.name} (${it.product_type}) qty=${it.qty} cost=${c} mkt=${m}`);
  }
  await sql.end();
})();
