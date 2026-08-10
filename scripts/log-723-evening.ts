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
  const ssB=await held(19928), crB=await held(53877);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19928, '2026-07-23', 1, 500, 'Vending Machine', 'Shoreline Safeway ~5:20 - bought SS as pull trigger; nothing pulled')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 53877, '2026-07-23', 1, 500, 'Vending Machine', 'Shoreline Fred Meyer ~5:35 off-mark - bought CR as trigger; nothing came')`;
  console.log(`Surging Sparks: held ${ssB} -> ${await held(19928)}`);
  console.log(`Chaos Rising: held ${crB} -> ${await held(53877)}`);
  const rows=[
    '2026-07-23,Thursday,17:20,Shoreline Safeway,hit,Surging Sparks Booster Pack,1,5.00,bought as pull trigger (off-mark ~:20) - nothing pulled',
    '2026-07-23,Thursday,17:35,Shoreline Fred Meyer,hit,Chaos Rising Booster Pack,1,5.00,bought off-mark ~:35 as trigger - nothing came',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
