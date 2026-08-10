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
  const ahB=await held(76);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 76, '2026-07-23', 1, 3000, 'Vending Machine', 'Edmonds Safeway 1:28 - AH bundle; likely selling to Mario (Hawaii) $80, sale pending Venmo confirmation')`;
  console.log(`Ascended Heroes bundle: held ${ahB} -> ${await held(76)}`);
  const rows=[
    '2026-07-23,Thursday,13:28,Edmonds Safeway,hit,Ascended Heroes Booster Bundle,1,30.00,BUNDLE - bought; likely Mario $80 (sale pending confirmation)',
    '2026-07-23,Thursday,13:28,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,dropped alongside the AH - left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
