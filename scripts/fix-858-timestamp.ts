import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const f='data/drop_log.csv';
  let csv=readFileSync(f,'utf8');
  const n=(csv.match(/2026-07-10,Friday,20:28,Edmonds Safeway/g)||[]).length;
  csv=csv.replace(/2026-07-10,Friday,20:28,Edmonds Safeway/g,'2026-07-10,Friday,20:58,Edmonds Safeway');
  writeFileSync(f,csv);
  console.log(`drop_log: ${n} rows 20:28 -> 20:58`);
  const r=await sql`UPDATE purchases SET notes='Edmonds Safeway 8:58 drop'
    WHERE catalog_item_id=17236 AND notes='Edmonds Safeway 8:28 drop' RETURNING id`;
  console.log('purchase note -> 8:58 on lot(s):', r.map((x:any)=>x.id).join(',')||'none');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
