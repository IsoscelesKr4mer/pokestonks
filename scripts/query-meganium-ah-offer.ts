import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const rows = await sql<{id:number;name:string;held:number;wac:number|null;mkt:number|null}[]>`
    SELECT ci.id, ci.name,
      COALESCE((SELECT SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))
        FROM purchases p WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL),0)::int AS held,
      (SELECT ROUND(AVG(p.cost_cents)) FROM purchases p WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL) AS wac,
      (SELECT market_price_cents FROM market_prices mp WHERE mp.catalog_item_id=ci.id ORDER BY snapshot_date DESC LIMIT 1) AS mkt
    FROM catalog_items ci
    WHERE lower(ci.name) LIKE '%meganium%'
       OR (lower(ci.name) LIKE '%ascended%' AND lower(ci.name) LIKE '%bundle%')
    ORDER BY ci.name`;
  for (const r of rows) console.log(`#${r.id} | ${r.name}\n    held ${r.held} | WAC ${r.wac!=null?'$'+(r.wac/100).toFixed(2):'n/a'} | market ${r.mkt!=null?'$'+(r.mkt/100).toFixed(2):'n/a'}`);
  await sql.end();
}
main();
