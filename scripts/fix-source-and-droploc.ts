import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // 1) generic purchase source; keep specific machine only in notes
  const r = await sql`UPDATE purchases SET source='Vending Machine',
      notes='Drop: Wed 2026-07-08 ~8:58pm PT @ Edmonds Safeway'
    WHERE catalog_item_id=31604 AND source='Safeway (vending)' RETURNING id`;
  console.log('updated purchase lot(s):', r.map(x=>x.id).join(',') || 'none');
  await sql.end();
  // 2) drop log uses the specific machine name
  const csv = 'date,day,time_local,location,result,product,qty,unit_cost,notes\n'
    + '2026-07-08,Wednesday,20:58,Edmonds Safeway,hit,White Flare Booster Bundle,1,30.00,reported drop time\n'
    + '2026-07-08,Wednesday,20:58,Edmonds Safeway,seen,Surging Sparks Booster Pack,0,,available at drop - left it (not buying SS singles)\n';
  writeFileSync('data/drop_log.csv', csv);
  console.log('drop_log.csv location -> Edmonds Safeway');
}
main().catch(e=>{console.error(e);process.exit(1);});
