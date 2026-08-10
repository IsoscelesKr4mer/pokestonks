import { config } from 'dotenv';
import postgres from 'postgres';
import { mkdirSync, existsSync, appendFileSync, writeFileSync } from 'fs';
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
  const id=31604; // White Flare Booster Bundle
  const before=await held(id);
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, '2026-07-08', 1, 3000, 'Safeway (vending)', 'Drop: Wed 2026-07-08 ~8:58pm PT @ Safeway')`;
  const after=await held(id);
  console.log(`Logged 1x White Flare bundle $30 @ Safeway | WF held ${before} -> ${after}`);

  // drop log (append-only CSV for drop-timing analysis)
  mkdirSync('data',{recursive:true});
  const f='data/drop_log.csv';
  if(!existsSync(f)) writeFileSync(f,'date,day,time_local,location,result,product,qty,unit_cost,notes\n');
  appendFileSync(f,'2026-07-08,Wednesday,20:58,Safeway,hit,White Flare Booster Bundle,1,30.00,reported drop time\n');
  console.log('drop_log.csv updated');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
