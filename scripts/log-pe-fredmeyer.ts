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
  const id=19776; // Prismatic Evolutions Booster Bundle
  const before=await held(id);
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, '2026-07-11', 1, 3000, 'Vending Machine', 'Shoreline Fred Meyer 9:34 (off-mark, sitting stock); cost assumed $30 - confirm if different')`;
  console.log(`Prismatic Evolutions Bundle: held ${before} -> ${await held(id)}`);
  const rows=[
    '2026-07-11,Saturday,21:34,Shoreline Fred Meyer,hit,Prismatic Evolutions Booster Bundle,1,30.00,BUNDLE - sitting stock (off-mark ~9:34); bought it',
    '2026-07-11,Saturday,21:34,Shoreline Fred Meyer,seen,Chaos Rising Booster Pack,0,,left it',
    '2026-07-11,Saturday,21:34,Shoreline Fred Meyer,seen,Mega Evolution Booster Pack,0,,EARLY-PULL - pulled in when he bought the PE bundle; left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +3 rows (1 hit bundle, 2 seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
