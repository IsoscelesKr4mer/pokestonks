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
  const b=await held(53877);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 53877, '2026-07-18', 1, 500, 'Vending Machine', 'Edmonds Safeway 1:51 - bought sitting CR as pull trigger; EARLY-PULL worked (pulled in the :58 early: a CR bundle + PO single)')`;
  console.log(`Chaos Rising pack: held ${b} -> ${await held(53877)}`);
  const rows=[
    '2026-07-18,Saturday,13:51,Edmonds Safeway,hit,Chaos Rising Booster Pack,1,5.00,bought sitting CR as pull trigger - EARLY-PULL WORKED, pulled the :58 in early',
    '2026-07-18,Saturday,13:51,Edmonds Safeway,seen,Journey Together Booster Pack,0,,sitting stock - left it',
    '2026-07-18,Saturday,13:51,Edmonds Safeway,seen,Chaos Rising Booster Bundle,0,,BUNDLE - EARLY-PULL: pulled in the :58; left it (does not want CR bundles)',
    '2026-07-18,Saturday,13:51,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,EARLY-PULL: pulled in with the CR bundle; left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +4 (CR trigger hit + 3 seen from the pulled :58)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
