import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const purch = await sql`SELECT id, purchase_date, quantity, cost_cents, source, notes FROM purchases WHERE catalog_item_id=76 AND deleted_at IS NULL ORDER BY id`;
  console.log('AH bundle (76) purchases:'); console.log(JSON.stringify(purch, null, 2));
  const sales = await sql`SELECT s.id, s.purchase_id, s.sale_date, s.quantity, s.sale_price_cents, s.matched_cost_cents, s.platform, s.notes
    FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=76 ORDER BY s.id`;
  console.log('\nAH bundle sales:'); console.log(JSON.stringify(sales, null, 2));
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL`)[0].h;
  console.log('\ncurrent held (76):', held);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
