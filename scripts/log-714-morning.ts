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
  const drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-14', 1, 500, 'Vending Machine', 'Shoreline Fred Meyer 9:46 - single DR pack sitting, bought')`;
  console.log(`Destined Rivals pack: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-14,Tuesday,09:28,Edmonds Safeway,miss,,0,,dead drop - nothing',
    '2026-07-14,Tuesday,09:46,Shoreline Fred Meyer,hit,Destined Rivals Booster Pack,1,5.00,single DR pack, bought',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 (Safeway miss, Fred Meyer hit)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
