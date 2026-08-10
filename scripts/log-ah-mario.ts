import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const userId='66200525-2237-4cc3-948f-aaafd3253d4b';
  const saleDate=new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
  const rows=await sql`SELECT p.id, p.cost_cents,
    (p.quantity-COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
    -COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
    -COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS ql
    FROM purchases p WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL ORDER BY p.purchase_date, p.created_at`;
  const open=rows.filter((l:any)=>Number(l.ql)>0);
  if(!open.length) throw new Error('no open AH bundle lot');
  const lot=open[0];
  await sql`INSERT INTO sales ${sql({user_id:userId,sale_group_id:randomUUID(),purchase_id:Number(lot.id),sale_date:saleDate,quantity:1,sale_price_cents:8000,fees_cents:0,matched_cost_cents:Number(lot.cost_cents),platform:'Venmo',notes:'Mario - AH Booster Bundle $80 cash'},'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
  console.log(`logged AH bundle to Mario: $80.00, cost $${(Number(lot.cost_cents)/100).toFixed(2)}, profit $${((8000-Number(lot.cost_cents))/100).toFixed(2)}, date ${saleDate}`);
  const h=(await sql`SELECT COALESCE(SUM(p.quantity
    -COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
    -COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
    -COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int held
    FROM purchases p WHERE p.catalog_item_id=76 AND p.deleted_at IS NULL`)[0];
  console.log('AH Booster Bundle held now:', h.held);
  await sql.end();
}
main();
