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
  const id=31604;
  const before=await held(id);
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, '2026-07-13', 1, 3000, 'Vending Machine', 'Edmonds Safeway 5:58 drop; cost assumed $30 (standard WF bundle) - confirm if different')`;
  console.log(`White Flare bundle: held ${before} -> ${await held(id)}`);
  const rows=[
    '2026-07-13,Monday,17:58,Edmonds Safeway,hit,White Flare Booster Bundle,1,30.00,BUNDLE - bought (cost assumed $30)',
    '2026-07-13,Monday,17:58,Edmonds Safeway,seen,Journey Together Booster Pack,0,,left it',
    '2026-07-13,Monday,17:58,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +3 rows (1 hit bundle, 2 seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
