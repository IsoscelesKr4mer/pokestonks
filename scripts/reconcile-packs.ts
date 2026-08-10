import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function held(ci:number){
  const r=await sql`WITH lots AS (SELECT id,quantity FROM purchases WHERE catalog_item_id=${ci} AND deleted_at IS NULL)
    SELECT SUM(quantity) - COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sales s WHERE s.purchase_id=lots.id)),0)
    - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=lots.id)),0)
    - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=lots.id)),0) held FROM lots`;
  return Number(r[0].held);
}
async function main(){
  // JT pack -> 0 (soft-delete the live open lot 281)
  await sql`UPDATE purchases SET deleted_at=NOW(), notes=concat(coalesce(notes,''),' [audit 2026-07-25: no JT pack on hand, removed]') WHERE id=281`;
  // DR +2 to reach 88 on-hand audit
  await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes)
    VALUES (${UID},17236,'2026-07-25',2,500,'Vending Machine','Audit reconciliation 2026-07-25: +2 to match 88 DR packs on hand (2 unlogged, assumed $5 vending)')`;
  console.log('DR held now:', await held(17236), '(target 88)');
  console.log('JT pack held now:', await held(14333), '(target 0)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
