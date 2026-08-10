import { config } from 'dotenv'; import postgres from 'postgres';
import { appendFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
(async()=>{
  const r=await sql`INSERT INTO purchases (user_id,catalog_item_id,purchase_date,quantity,cost_cents,source,notes) VALUES (${UID},19776,'2026-07-27',1,3000,'Vending Machine',${'Shoreline Fred Meyer 3:23pm (:23 mark - confirms new FM time) - Prismatic Evolutions bundle; bought. Journey Together single also in machine, left it'}) RETURNING id`;
  console.log('Prismatic bundle purchase lot:',r[0].id);
  const rows=[
    '2026-07-27,Monday,15:23,Shoreline Fred Meyer,hit,Prismatic Evolutions Booster Bundle,1,30.00,:23 mark (confirms new FM time ~:22:30/:23) - bought (Prismatic = want)',
    '2026-07-27,Monday,15:23,Shoreline Fred Meyer,seen,Journey Together Booster Pack,0,,single in the machine alongside the Prismatic bundle - left it',
  ];
  appendFileSync('data/drop_log.csv', rows.join('\n')+'\n');
  console.log('appended',rows.length,'FM drop rows');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
