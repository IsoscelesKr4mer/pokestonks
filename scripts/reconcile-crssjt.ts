import { config } from 'dotenv';
import postgres from 'postgres';
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
  const targets=[[53877,'Chaos Rising',9],[19928,'Surging Sparks',5],[14333,'Journey Together',1]] as const;
  for(const [id,name,target] of targets){
    const before=await held(id);
    let delta=target-before;
    if(delta>0){
      await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
        VALUES (${uid}, ${id}, CURRENT_DATE, ${delta}, 500, 'Vending Machine', ${'Inventory reconciliation to actual count '+target+' (+'+delta+' previously unlogged @ $5)'})`;
    } else if(delta<0){
      // remove |delta| units with NO loss: decrement newest open lots (soft-delete when emptied)
      let need=-delta;
      const lots = await sql`SELECT id, quantity,
        (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
                    - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
                    - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int AS avail
        FROM purchases p WHERE catalog_item_id=${id} AND deleted_at IS NULL
        ORDER BY purchase_date DESC, created_at DESC, id DESC`;
      for(const lot of lots){
        if(need<=0) break;
        if((lot as any).avail<=0) continue;
        const take=Math.min(need,(lot as any).avail);
        const newQty=(lot as any).quantity - take;
        if(newQty<=0){
          await sql`UPDATE purchases SET deleted_at=now(), notes='Removed via inventory reconciliation (giveaway/overcount, no loss)' WHERE id=${(lot as any).id}`;
        } else {
          await sql`UPDATE purchases SET quantity=${newQty}, notes='Reduced via inventory reconciliation (giveaway/overcount, no loss)' WHERE id=${(lot as any).id}`;
        }
        need-=take;
      }
    }
    console.log(`${name}: ${before} -> ${await held(id)} (target ${target})`);
  }
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
