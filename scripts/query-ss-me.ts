import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const rows = await sql`
    SELECT ci.id, ci.name,
      COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held,
      (SELECT ROUND(AVG(p.cost_cents)) FROM purchases p WHERE p.catalog_item_id=ci.id AND p.deleted_at IS NULL) AS wac
    FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
    WHERE (lower(ci.name) LIKE '%surging sparks%booster pack%' AND lower(ci.name) NOT LIKE '%sleeve%')
       OR (lower(ci.name) = 'mega evolution booster pack')
       OR (lower(ci.name) LIKE '%mega evolution elite trainer box%gardevoir%')
       OR lower(ci.name) LIKE '%mega evolution%booster pack%'
    GROUP BY ci.id, ci.name HAVING COALESCE(SUM(p.quantity),0) > 0
    ORDER BY ci.name`;
  for (const r of rows) console.log(`#${r.id} ${r.name}: held ${r.held} | WAC ${r.wac!=null?'$'+(r.wac/100).toFixed(2):'n/a'}`);
  await sql.end();
}
main();
