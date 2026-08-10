import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // prior Mario / AH bundle sales
  const s=await sql`SELECT s.id,s.purchase_id,s.sale_date,s.quantity,s.sale_price_cents,s.fees_cents,s.matched_cost_cents,s.platform,s.notes
    FROM sales s JOIN purchases p ON p.id=s.purchase_id JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%ascended heroes%bundle%' ORDER BY s.sale_date DESC LIMIT 4`;
  console.log('prior AH bundle sales:');
  s.forEach(r=>console.log(`  sale${r.id} lot${r.purchase_id} ${r.sale_date} qty${r.quantity} $${(r.sale_price_cents/100).toFixed(2)} fee$${(r.fees_cents/100).toFixed(2)} cost$${(r.matched_cost_cents/100).toFixed(2)} [${r.platform}] ${r.notes??''}`));
  // open AH bundle lots (FIFO): purchased qty minus sold qty
  const lots=await sql`SELECT p.id,p.purchase_date,p.quantity,p.cost_cents,
      COALESCE((SELECT SUM(x.quantity) FROM sales x WHERE x.purchase_id=p.id),0) sold
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%ascended heroes%bundle%' AND ci.name NOT ILIKE '%case%' AND ci.name NOT ILIKE '%display%' AND p.deleted_at IS NULL
    ORDER BY p.purchase_date ASC, p.id ASC`;
  console.log('\nAH bundle lots (open = qty>sold):');
  lots.forEach(r=>console.log(`  lot${r.id} ${String(r.purchase_date).slice(0,10)} qty${r.quantity} sold${r.sold} cost$${(r.cost_cents/100).toFixed(2)} ${Number(r.quantity)>Number(r.sold)?'<-- OPEN':''}`));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
