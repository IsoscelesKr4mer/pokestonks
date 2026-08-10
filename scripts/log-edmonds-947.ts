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
  const crB=await held(53877), drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 53877, '2026-07-11', 1, 500, 'Vending Machine', 'Edmonds Safeway 9:47 - bought sitting CR to trigger the :58 pull')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-11', 1, 500, 'Vending Machine', 'Edmonds Safeway 9:58 - DR from the pulled-in drop')`;
  console.log(`Chaos Rising: held ${crB} -> ${await held(53877)}`);
  console.log(`Destined Rivals: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-11,Saturday,21:47,Edmonds Safeway,hit,Chaos Rising Booster Pack,1,5.00,bought sitting CR to trigger the :58 pull',
    '2026-07-11,Saturday,21:47,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,sitting stock - left it',
    '2026-07-11,Saturday,21:58,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,pulled-in :58 drop (DR+ME); bought the DR',
    '2026-07-11,Saturday,21:58,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,pulled-in with the DR; left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +4 rows (2 hit, 2 seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
