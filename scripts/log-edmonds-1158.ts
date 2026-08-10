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
    VALUES (${uid}, ${id}, '2026-07-11', 1, 500, 'Vending Machine', 'Edmonds Safeway 11:58 drop')`;
  console.log(`Destined Rivals pack: held ${before} -> ${await held(id)}`);
  const rows=[
    '2026-07-11,Saturday,11:58,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,bought',
    '2026-07-11,Saturday,11:58,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,another shopper bought it',
    '2026-07-11,Saturday,11:58,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,left it',
    '2026-07-11,Saturday,11:58,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,left it',
    '2026-07-11,Saturday,11:58,Edmonds Safeway,seen,Chaos Rising Booster Bundle,0,,BUNDLE - held over from prior cycle; left it (does not want CR bundles)',
    '2026-07-11,Saturday,11:58,Edmonds Safeway,seen,Journey Together Booster Pack,0,,held over from prior cycle; left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +6 rows (1 hit, 5 seen incl a CR BUNDLE)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
