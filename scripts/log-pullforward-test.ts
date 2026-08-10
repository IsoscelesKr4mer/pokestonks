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
  const crBefore=await held(53877), meBefore=await held(31884);
  // 2x Chaos Rising (trigger buys)
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 53877, '2026-07-11', 2, 500, 'Vending Machine', 'Edmonds Safeway 5:43 - bought 2 sitting CR singles to test pull-forward')`;
  // 1x Mega Evolution (the pulled-in drop)
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 31884, '2026-07-11', 1, 500, 'Vending Machine', 'Edmonds Safeway 5:43 - pulled in early after buying the 2 CR (early-pull confirmed)')`;
  console.log(`Chaos Rising pack: held ${crBefore} -> ${await held(53877)}`);
  console.log(`Mega Evolution pack: held ${meBefore} -> ${await held(31884)}`);
  const rows=[
    '2026-07-11,Saturday,17:43,Edmonds Safeway,hit,Chaos Rising Booster Pack,2,5.00,bought 2 sitting CR singles as pull-forward trigger',
    '2026-07-11,Saturday,17:43,Edmonds Safeway,hit,Mega Evolution Booster Pack,1,5.00,EARLY-PULL CONFIRMED - popped out immediately after buying the 2 CR; bought it; nothing further came (pulls one item, no cascade)',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +2 hit rows');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
