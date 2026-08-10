import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function heldOf(id:number){
  const r = await sql<{held:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`;
  return r[0].held;
}
async function main(){
  const id=17236, target=46, unit=500;
  const before=await heldOf(id);
  const delta=target-before;
  console.log(`DR held before: ${before} | target: ${target} | delta: ${delta}`);
  if(delta===0){console.log('already at target, no change');await sql.end();return;}
  if(delta<0){console.log('WARNING: physical count is LOWER than logged; not auto-decrementing. Needs manual review.');await sql.end();return;}
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, CURRENT_DATE, ${delta}, ${unit}, 'Inventory reconciliation',
            ${'Physical count '+target+' vs logged '+before+'; +'+delta+' previously unlogged packs @ $5.00 (voice memo 2026-07-08)'})`;
  const after=await heldOf(id);
  console.log(`inserted lot: qty=${delta} @ $${(unit/100).toFixed(2)} | DR held after: ${after}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
