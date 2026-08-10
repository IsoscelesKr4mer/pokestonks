import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT p.id,p.purchase_date,p.quantity,p.cost_cents,p.source,p.notes,
    COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)::int sold
    FROM purchases p WHERE p.catalog_item_id=53864 AND p.deleted_at IS NULL ORDER BY p.purchase_date`;
  r.forEach((x:any)=>console.log(`lot${x.id} ${String(x.purchase_date).slice(0,10)} qty${x.quantity} $${(x.cost_cents/100).toFixed(2)} sold${x.sold} | ${x.source} | ${x.notes??''}`));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
