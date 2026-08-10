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
  const buys=[{id:19928,name:'Surging Sparks'},{id:53877,name:'Chaos Rising'}];
  for(const b of buys){
    const before=await held(b.id);
    await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
      VALUES (${uid}, ${b.id}, '2026-07-09', 1, 500, 'Vending Machine', 'Edmonds Safeway 428 drop; bought hoping to pull a bundle (no bundle came)')`;
    console.log(`${b.name} pack: held ${before} -> ${await held(b.id)}`);
  }
  const rows=[
    '2026-07-09,Thursday,16:28,Edmonds Safeway,hit,Surging Sparks Booster Pack,1,5.00,bought - pull-forward attempt (no bundle followed)',
    '2026-07-09,Thursday,16:28,Edmonds Safeway,hit,Chaos Rising Booster Pack,1,5.00,bought - pull-forward attempt (no bundle followed)',
    '2026-07-09,Thursday,16:28,Edmonds Safeway,seen,Perfect Order Booster Pack,0,,left it',
    '2026-07-09,Thursday,16:28,Edmonds Safeway,seen,Journey Together Booster Pack,0,,left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('drop_log +4 rows (2 hit, 2 seen)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
