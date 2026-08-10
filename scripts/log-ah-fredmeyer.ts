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
  const id=76;
  const before=await held(id);
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, ${id}, '2026-07-09', 1, 3000, 'Vending Machine', 'Shoreline Fred Meyer 4:46 drop; cost assumed $30 (standard AH bundle) - confirm if different')`;
  console.log(`Ascended Heroes Booster Bundle: held ${before} -> ${await held(id)}`);
  appendFileSync('data/drop_log.csv','2026-07-09,Thursday,16:46,Shoreline Fred Meyer,hit,Ascended Heroes Booster Bundle,1,30.00,cost assumed $30 (standard)\n');
  console.log('drop_log +1 hit');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
