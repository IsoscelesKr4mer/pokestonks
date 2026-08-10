import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT p.id,p.purchase_date,p.quantity,p.cost_cents,p.source,p.location,p.notes,p.deleted_at,ci.name
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%pitch black%' AND ci.name ILIKE '%bundle%' AND ci.name NOT ILIKE '%case%'
    ORDER BY p.purchase_date, p.id`;
  console.log('Pitch Black booster bundle purchase lots:');
  let held=0;
  for(const x of r){
    const sold=(await sql`SELECT COALESCE(SUM(quantity),0)::int s FROM sales WHERE purchase_id=${x.id}`)[0].s;
    if(!x.deleted_at) held+=Number(x.quantity)-sold;
    console.log(`  lot${x.id} ${String(x.purchase_date).slice(0,10)} qty${x.quantity} $${(x.cost_cents/100).toFixed(2)} | ${x.source}${x.location?'/'+x.location:''} | sold:${sold} ${x.deleted_at?'[DELETED]':''} | ${x.notes??''}`);
  }
  console.log(`\nnet held (non-deleted): ${held}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
