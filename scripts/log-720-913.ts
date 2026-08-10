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
  const wfB=await held(31604), peB=await held(19776);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 31604, '2026-07-20', 1, 3000, 'Vending Machine', 'Edmonds Safeway 9:13 - sitting :58 WF bundle; bought it, triggered early-pull of the :28')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19776, '2026-07-20', 1, 3000, 'Vending Machine', 'Edmonds Safeway 9:13 - Prismatic bundle pulled in from the :28; bought it')`;
  console.log(`White Flare bundle: held ${wfB} -> ${await held(31604)}`);
  console.log(`Prismatic Evolutions bundle: held ${peB} -> ${await held(19776)}`);
  const rows=[
    '2026-07-20,Monday,09:13,Edmonds Safeway,hit,White Flare Booster Bundle,1,30.00,BUNDLE - sitting :58 drop (arrived :15 after); bought it, triggered the early-pull',
    '2026-07-20,Monday,09:13,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,sitting with the WF bundle - left it',
    '2026-07-20,Monday,09:13,Edmonds Safeway,hit,Prismatic Evolutions Booster Bundle,1,30.00,BUNDLE - EARLY-PULL: pulled in the :28 drop; bought it. Double-bundle visit',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +3 (WF + PE bundle hits, ME seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
