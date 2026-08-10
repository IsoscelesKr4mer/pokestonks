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
  const ahB=await held(76), drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 76, '2026-07-14', 1, 3000, 'Vending Machine', 'Shoreline Safeway ~5:25 - AH bundle from a 4-item drop; cost assumed $30')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-14', 1, 500, 'Vending Machine', 'Shoreline Safeway ~5:25 - DR single from same drop')`;
  console.log(`Ascended Heroes bundle: held ${ahB} -> ${await held(76)}`);
  console.log(`Destined Rivals pack: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-14,Tuesday,17:25,Shoreline Safeway,hit,Ascended Heroes Booster Bundle,1,30.00,BUNDLE - from a 4-item drop that popped ~:25 (empty at :20)',
    '2026-07-14,Tuesday,17:25,Shoreline Safeway,hit,Destined Rivals Booster Pack,1,5.00,bought from same 4-item drop',
    '2026-07-14,Tuesday,17:25,Shoreline Safeway,seen,Surging Sparks Booster Pack,0,,left it (same drop)',
    '2026-07-14,Tuesday,17:25,Shoreline Safeway,seen,Mega Evolution Booster Pack,0,,left it (same drop)',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +4 (Shoreline Safeway multi-item drop)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
