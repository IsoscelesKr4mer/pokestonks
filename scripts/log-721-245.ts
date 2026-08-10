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
  const b=await held(19928);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19928, '2026-07-21', 1, 500, 'Vending Machine', 'Shoreline Fred Meyer ~2:45 - 1 SS pack; possible new drop time (unconfirmed)')`;
  console.log(`Surging Sparks pack: held ${b} -> ${await held(19928)}`);
  appendFileSync('data/drop_log.csv',
    '2026-07-21,Tuesday,14:45,Shoreline Fred Meyer,hit,Surging Sparks Booster Pack,1,5.00,bought; drop at ~:45 - possible shift from :16/:46 (marks unconfirmed)\n');
  console.log('drop_log +1');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
