import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  console.log('PRIOR ASCENDED HEROES PURCHASES:');
  const p:any = await sql`
    SELECT p.id, ci.name, p.purchase_date::text d, p.quantity q, p.cost_cents c, p.source, p.location, p.notes
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%Ascended Heroes%' AND p.deleted_at IS NULL
    ORDER BY p.purchase_date DESC, p.id DESC LIMIT 30`;
  if(!p.length) console.log('  none');
  p.forEach((r:any)=>console.log(`  #${r.id} ${r.d} | ${r.name} | x${r.q} @ $${(r.c/100).toFixed(2)} | ${r.source} / ${r.location??'-'} | ${r.notes??''}`));

  console.log('\nEVERY BUNDLE BOUGHT FROM VENDING (last 15):');
  const b:any = await sql`
    SELECT p.purchase_date::text d, ci.name, p.quantity q, p.cost_cents c, p.notes
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE p.deleted_at IS NULL AND ci.name ILIKE '%Bundle%' AND p.source ILIKE '%Vending%'
    ORDER BY p.purchase_date DESC LIMIT 15`;
  if(!b.length) console.log('  none');
  b.forEach((r:any)=>console.log(`  ${r.d} | ${r.name} | x${r.q} @ $${(r.c/100).toFixed(2)} | ${r.notes??''}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
