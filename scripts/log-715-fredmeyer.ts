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
  const b=await held(19843);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19843, '2026-07-15', 1, 500, 'Vending Machine', 'Shoreline Fred Meyer 11:38 - sitting PO (leftover from :16), bought as trigger; no pull followed')`;
  console.log(`Perfect Order pack: held ${b} -> ${await held(19843)}`);
  const rows=[
    '2026-07-15,Wednesday,11:38,Shoreline Fred Meyer,hit,Perfect Order Booster Pack,1,5.00,sitting stock (leftover from :16); bought as trigger - no pull followed, likely already pulled early by another buyer (not a dead drop)',
    '2026-07-15,Wednesday,11:38,Shoreline Fred Meyer,seen,Journey Together Booster Pack,0,,left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 (PO hit + JT seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
