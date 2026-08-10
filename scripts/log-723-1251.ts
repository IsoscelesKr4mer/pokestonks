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
  const ssB=await held(19928), drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19928, '2026-07-23', 1, 500, 'Vending Machine', 'Edmonds Safeway 12:51 early - bought sitting SS as trigger')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-23', 1, 500, 'Vending Machine', 'Edmonds Safeway 12:51 - DR single came out on the refresh (replaced the sitting PO); bought')`;
  console.log(`Surging Sparks: held ${ssB} -> ${await held(19928)}`);
  console.log(`Destined Rivals: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-23,Thursday,12:51,Edmonds Safeway,hit,Surging Sparks Booster Pack,1,5.00,early (~:51 before :58); sitting leftover, bought as trigger',
    '2026-07-23,Thursday,12:51,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,was sitting; VANISHED on the refresh (replaced by the pulled DR) - anomaly',
    '2026-07-23,Thursday,12:51,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,came out on the refresh/pull; bought',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +3');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
