import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // Pitch Black booster bundle catalog + any prior vending purchases
  const ci=await sql`SELECT id,name FROM catalog_items WHERE name ILIKE '%pitch black%' AND (name ILIKE '%bundle%' OR name ILIKE '%booster bundle%')`;
  console.log('PB bundle catalog matches:'); ci.forEach(r=>console.log(`  ci${r.id} ${r.name}`));
  const rows=await sql`SELECT p.id,p.catalog_item_id,p.quantity,p.cost_cents,p.source,p.purchase_date,p.notes,ci.name
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%pitch black%' AND ci.name ILIKE '%bundle%' AND p.deleted_at IS NULL
    ORDER BY p.purchase_date DESC LIMIT 6`;
  console.log('prior PB bundle purchases:');
  if(!rows.length) console.log('  (none)');
  for(const r of rows) console.log(`  ${r.purchase_date} qty${r.quantity} $${(r.cost_cents/100).toFixed(2)} | ${r.source} | ci${r.catalog_item_id} | ${r.notes??''}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
