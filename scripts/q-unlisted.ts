import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const held = await sql`
    SELECT p.catalog_item_id AS cid, c.name, c.product_type,
      SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS held
    FROM purchases p JOIN catalog_items c ON c.id=p.catalog_item_id
    WHERE p.deleted_at IS NULL
    GROUP BY p.catalog_item_id, c.name, c.product_type
    HAVING SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)) > 0
    ORDER BY held DESC`;
  console.log('HELD INVENTORY:'); console.log(JSON.stringify(held, null, 2));
  const maps = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings ORDER BY id`;
  console.log('\nLISTING MAPPINGS:'); console.log(JSON.stringify(maps, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
