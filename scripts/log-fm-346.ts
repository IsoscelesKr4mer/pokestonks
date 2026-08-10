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
    VALUES (${uid}, ${id}, '2026-07-12', 2, 500, 'Vending Machine', 'Shoreline Fred Meyer 3:46 drop (2 DR singles)')`;
  console.log(`Destined Rivals pack: held ${before} -> ${await held(id)}`);
  appendFileSync('data/drop_log.csv','2026-07-12,Sunday,15:46,Shoreline Fred Meyer,hit,Destined Rivals Booster Pack,2,5.00,bought 2 DR singles\n');
  console.log('drop_log +1 hit (qty 2)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
