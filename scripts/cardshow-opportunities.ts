import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const rows = await sql`
    WITH held AS (
      SELECT p.catalog_item_id AS cid,
        SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS qty,
        ROUND(AVG(p.cost_cents))::int AS wac
      FROM purchases p WHERE p.deleted_at IS NULL GROUP BY p.catalog_item_id
    )
    SELECT ci.id, ci.name, ci.product_type, h.qty, h.wac,
      (SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt
    FROM held h JOIN catalog_items ci ON ci.id=h.cid
    WHERE h.qty > 0
    ORDER BY h.qty * COALESCE((SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1),0) DESC`;
  for (const r of rows) {
    const mkt = r.mkt!=null?r.mkt/100:null;
    const wac = r.wac/100;
    const cardshow = mkt!=null? (0.80*mkt*r.qty):null;
    console.log(`#${r.id} | ${r.name} | held ${r.qty} | WAC $${wac.toFixed(2)} | mkt ${mkt!=null?'$'+mkt.toFixed(2):'n/a'} | 80%cash/ea ${mkt!=null?'$'+(0.80*mkt).toFixed(2):'n/a'} | total80% ${cardshow!=null?'$'+cardshow.toFixed(2):'n/a'}`);
  }
  await sql.end();
}
main();
