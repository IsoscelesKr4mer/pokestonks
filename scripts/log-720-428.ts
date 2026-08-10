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
  const drB=await held(17236);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 17236, '2026-07-20', 1, 500, 'Vending Machine', 'Edmonds Safeway 4:28 - fresh restock, bought 1 DR; PO pack + all bundles sold out')`;
  console.log(`Destined Rivals pack: held ${drB} -> ${await held(17236)}`);
  const rows=[
    '2026-07-20,Monday,16:28,Edmonds Safeway,hit,Destined Rivals Booster Pack,1,5.00,fresh restock (nearly all single types in stock); bought 1',
    '2026-07-20,Monday,16:28,Edmonds Safeway,seen,Chaos Rising Booster Pack,0,,in stock at restock - left it',
    '2026-07-20,Monday,16:28,Edmonds Safeway,seen,Mega Evolution Booster Pack,0,,in stock at restock - left it',
    '2026-07-20,Monday,16:28,Edmonds Safeway,seen,Journey Together Booster Pack,0,,in stock at restock - left it',
    '2026-07-20,Monday,16:28,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,in stock at restock - left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +5 (DR hit + 4 seen singles at restock; PO pack + bundles sold out)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
