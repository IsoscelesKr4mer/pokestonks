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
  const wfB=await held(31604), drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 31604, '2026-07-12', 1, 3000, 'Vending Machine', 'Edmonds Safeway 5:28 drop; cost assumed $30 (standard WF bundle) - confirm if different')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-12', 1, 500, 'Vending Machine', 'Edmonds Safeway 5:28 drop')`;
  console.log(`White Flare bundle: held ${wfB} -> ${await held(31604)}`);
  console.log(`Destined Rivals: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-12,Sunday,17:28,Edmonds Safeway,hit,White Flare Booster Bundle,1,30.00,BUNDLE - bought (cost assumed $30)',
    '2026-07-12,Sunday,17:28,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,bought',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 hit rows (incl a WF bundle)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
