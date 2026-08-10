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
  const ssB=await held(19928), peB=await held(19776);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19928, '2026-07-13', 1, 500, 'Vending Machine', 'Edmonds Safeway - SS sat from 8:58, bought 9:24 as pull trigger')`;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 19776, '2026-07-13', 1, 3000, 'Vending Machine', 'Edmonds Safeway 9:24 - PE bundle pulled in early after buying the SS; cost assumed $30')`;
  console.log(`Surging Sparks: held ${ssB} -> ${await held(19928)}`);
  console.log(`Prismatic Evolutions bundle: held ${peB} -> ${await held(19776)}`);
  const rows=[
    '2026-07-13,Monday,20:58,Edmonds Safeway,hit,Surging Sparks Booster Pack,1,5.00,dropped 8:58 (left), bought 9:24 as pull trigger',
    '2026-07-13,Monday,21:24,Edmonds Safeway,hit,Prismatic Evolutions Booster Bundle,1,30.00,BUNDLE - EARLY-PULL: pulled in after buying the sitting SS; bought it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 hits (SS trigger + pulled PE bundle)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
