import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  for (const id of [31604, 5241]) {
    const h = (await sql`
      SELECT ci.name,
        COALESCE(SUM(p.quantity),0)::int AS bought,
        (SELECT COALESCE(SUM(s.quantity),0) FROM sales s JOIN purchases p2 ON s.purchase_id=p2.id WHERE p2.catalog_item_id=${id})::int AS sold,
        COALESCE(SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${id} GROUP BY ci.name`)[0];
    console.log(`#${id} ${h.name}: bought ${h.bought}, sold ${h.sold}, held ${h.held}`);
  }
  await sql.end();
}
main();
