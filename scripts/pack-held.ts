import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows=await sql`
    WITH lots AS (
      SELECT p.id, p.catalog_item_id, p.quantity
      FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
      WHERE ci.product_type='Booster Pack' AND p.deleted_at IS NULL
    )
    SELECT ci.id, ci.name,
      SUM(l.quantity)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l JOIN catalog_items ci ON ci.id=l.catalog_item_id
    GROUP BY ci.id, ci.name
    HAVING SUM(l.quantity)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) <> 0
    ORDER BY held DESC`;
  console.log('current held booster packs (DB):');
  for(const r of rows) console.log(`  ci${r.id}  held ${r.held}  | ${r.name}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
