import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
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
  const id=76, price=8500, fees=0;
  const before=await held(id);
  if(before<1){ console.error('no AH bundle in stock'); process.exit(1); }
  const rows = await sql`
    SELECT p.id, p.cost_cents,
      (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int AS avail
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.created_at, p.id`;
  const lot = rows.find((r:any)=>r.avail>0);
  if(!lot){ console.error('no open lot'); process.exit(1); }
  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=${id} LIMIT 1`)[0].user_id;
  const sgid=randomUUID();
  await sql`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
    VALUES (${uid}, ${sgid}, ${lot.id}, '2026-07-09', 1, ${price}, ${fees}, ${lot.cost_cents}, 'Venmo', 'Hawaii buddy - AH Booster Bundle $85 (like usual)')`;
  console.log(`Sold AH bundle $85 Venmo | matched cost $${(lot.cost_cents/100).toFixed(2)} | realized $${((price-fees-lot.cost_cents)/100).toFixed(2)}`);
  console.log(`AH bundle held ${before} -> ${await held(id)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
