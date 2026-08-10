import { config } from 'dotenv';
import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function held(id:number){
  return (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
}
async function main(){
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  const poB=await held(19843);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19843, '2026-07-14', 2, 500, 'Vending Machine', 'Edmonds Safeway 9:58 - 2 PO available (leftover + fresh :58); bought both to test for a pull')`;
  console.log(`Perfect Order pack: held ${poB} -> ${await held(19843)}`);
  appendFileSync('data/drop_log.csv',
    '2026-07-14,Tuesday,21:58,Edmonds Safeway,hit,Perfect Order Booster Pack,2,5.00,2 PO at :58 (leftover + fresh drop); bought both to test for a pull\n');
  console.log('drop_log +1 hit (2x PO at 21:58)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
