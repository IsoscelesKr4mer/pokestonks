import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const ci=await sql`SELECT id,name FROM catalog_items WHERE name ILIKE '%ascended heroes%' AND name ILIKE '%bundle%'`;
  console.log('AH bundle catalog:'); ci.forEach(r=>console.log(`  ci${r.id} ${r.name}`));
  const rows=await sql`SELECT p.quantity,p.cost_cents,p.source,p.purchase_date,p.notes FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%ascended heroes%' AND ci.name ILIKE '%bundle%' AND p.source ILIKE '%vending%' AND p.deleted_at IS NULL ORDER BY p.purchase_date DESC LIMIT 5`;
  console.log('prior AH bundle VENDING purchases:');
  rows.forEach(r=>console.log(`  ${r.purchase_date} qty${r.quantity} $${(r.cost_cents/100).toFixed(2)} | ${r.notes??''}`));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
