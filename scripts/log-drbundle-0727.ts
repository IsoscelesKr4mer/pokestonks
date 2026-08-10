import { config } from 'dotenv'; import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
(async()=>{
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},17235,'2026-07-27',1,3000,'Vending Machine',${'Edmonds Safeway 5:37pm (:37 mark - confirms new Safeway time) - Destined Rivals booster bundle; bought'}) RETURNING id`;
  console.log('DR bundle purchase lot:',r[0].id);
  appendFileSync('data/drop_log.csv', '2026-07-27,Monday,17:37,Edmonds Safeway,hit,Destined Rivals Booster Bundle,1,30.00,:37 mark - CONFIRMS the new Safeway :37 partner mark; bought (DR = want)\n');
  console.log('appended DR bundle drop row');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
