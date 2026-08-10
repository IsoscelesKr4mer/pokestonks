import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // 1) drop_log.csv: the 3 rows from that drop were mis-stamped 21:58; correct to 20:28
  const f='data/drop_log.csv';
  let csv=readFileSync(f,'utf8');
  const before=(csv.match(/2026-07-10,Friday,21:58,Edmonds Safeway/g)||[]).length;
  csv=csv.replace(/2026-07-10,Friday,21:58,Edmonds Safeway/g,'2026-07-10,Friday,20:28,Edmonds Safeway');
  writeFileSync(f,csv);
  console.log(`drop_log: fixed ${before} rows 21:58 -> 20:28`);
  // 2) purchase note on the DR lot
  const r=await sql`UPDATE purchases SET notes='Edmonds Safeway 8:28 drop'
    WHERE catalog_item_id=17236 AND notes='Edmonds Safeway 9:58 drop' RETURNING id`;
  console.log('purchase note fixed on lot(s):', r.map((x:any)=>x.id).join(',')||'none');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
