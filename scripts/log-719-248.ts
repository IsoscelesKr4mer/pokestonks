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
  const peB=await held(19776), drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19776, '2026-07-19', 1, 3000, 'Vending Machine', 'Edmonds Safeway 2:48 - sitting :28 Prismatic bundle (sat ~20 min); bought it, triggered early-pull of the :58')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-19', 1, 500, 'Vending Machine', 'Edmonds Safeway 2:48 - DR from the pulled-in :58 drop; bought it')`;
  console.log(`Prismatic Evolutions bundle: held ${peB} -> ${await held(19776)}`);
  console.log(`Destined Rivals pack: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-19,Sunday,14:48,Edmonds Safeway,hit,Prismatic Evolutions Booster Bundle,1,30.00,BUNDLE - sitting :28 drop (sat ~20 min); bought it, purchase triggered the early-pull',
    '2026-07-19,Sunday,14:48,Edmonds Safeway,seen,Chaos Rising Booster Pack,0,,sitting with the Prismatic (:28 drop) - left it',
    '2026-07-19,Sunday,14:48,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,EARLY-PULL: from the pulled-in :58 drop; bought it',
    '2026-07-19,Sunday,14:48,Edmonds Safeway,seen,Journey Together Booster Pack,0,,pulled-in :58 drop - left it',
    '2026-07-19,Sunday,14:48,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,pulled-in :58 drop - left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +5 (PE bundle + DR hits, CR/JT/SS seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
