import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const lots=await sql`SELECT p.id,p.cost_cents,
    (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
    FROM purchases p WHERE p.catalog_item_id=53864 AND p.deleted_at IS NULL ORDER BY p.purchase_date ASC, p.id ASC`;
  const lot=lots.find((x:any)=>x.open>0);
  if(!lot){ console.log('no open PB ETB lot'); await sql.end(); return; }
  await sql`INSERT INTO sales (user_id,sale_group_id,purchase_id,sale_date,quantity,sale_price_cents,fees_cents,matched_cost_cents,platform,notes)
    VALUES (${UID},${randomUUID()},${lot.id},'2026-07-25',1,6500,0,${lot.cost_cents},'Card show (cash)','Pitch Black ETB sold to vendor at card show')`;
  console.log(`booked PB ETB $65 (lot${lot.id} cost $${(lot.cost_cents/100).toFixed(2)}) -> profit $${((6500-lot.cost_cents)/100).toFixed(2)}`);
  const held=(await sql`SELECT SUM(p.quantity)-COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sales s WHERE s.purchase_id=p.id)),0) h FROM purchases p WHERE p.catalog_item_id=53864 AND p.deleted_at IS NULL`)[0].h;
  console.log('PB ETB held now:', held);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
