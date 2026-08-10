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
  const crB=await held(53877);
  await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 53877, '2026-07-14', 1, 500, 'Vending Machine', 'Edmonds Safeway 9:24 - bought sitting CR from the 8:58 drop as pull trigger; did NOT pull an early drop')`;
  console.log(`Chaos Rising pack: held ${crB} -> ${await held(53877)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
