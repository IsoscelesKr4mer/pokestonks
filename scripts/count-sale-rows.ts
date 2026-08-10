import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const h=(await sql`SELECT COALESCE(SUM(p.quantity
    - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
    - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
    - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held,
    (SELECT ROUND(AVG(cost_cents)) FROM purchases WHERE catalog_item_id=19928 AND deleted_at IS NULL) AS wac
    FROM purchases p WHERE p.catalog_item_id=19928 AND p.deleted_at IS NULL`)[0];
  console.log('Surging Sparks pack #19928: held',h.held,'WAC $'+(h.wac/100).toFixed(2));
  await sql.end();
}
main();
