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
  const id=17236;
  const before=await held(id);
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, '2026-07-11', 1, 500, 'Vending Machine', 'Edmonds Safeway 8:58am drop')`;
  console.log(`Destined Rivals pack: held ${before} -> ${await held(id)}`);
  const rows=[
    '2026-07-11,Saturday,08:58,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,bought',
    '2026-07-11,Saturday,08:58,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,left it - guy behind him bought it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 rows (1 hit, 1 seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
