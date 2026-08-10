import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
// [catalog, name, qtyToSell, perUnitCents]
const DEAL:[number,string,number,number][]=[
  [31884,'Mega Evolution',38,700],
  [19928,'Surging Sparks',9,700],
  [53877,'Chaos Rising',14,500],
];
async function openLots(ci:number){
  return await sql<{id:number,cost:number,open:number}[]>`
    SELECT p.id, p.cost_cents cost,
      (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
    FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL ORDER BY p.purchase_date ASC, p.id ASC`;
}
async function main(){
  const sgid=randomUUID();
  let totRev=0,totCost=0,rows=0;
  for(const [ci,name,qty,per] of DEAL){
    const lots=(await openLots(ci)).filter(l=>l.open>0);
    const avail=lots.reduce((s,l)=>s+l.open,0);
    if(avail<qty){ console.log(`SKIP ${name}: only ${avail} open, need ${qty}`); continue; }
    let rem=qty;
    for(const l of lots){
      if(rem<=0) break;
      const take=Math.min(rem,l.open);
      const price=take*per, cost=take*l.cost;
      await sql`INSERT INTO sales (user_id,sale_group_id,purchase_id,sale_date,quantity,sale_price_cents,fees_cents,matched_cost_cents,platform,notes)
        VALUES (${UID},${sgid},${l.id},'2026-07-25',${take},${price},0,${cost},'Card show (cash)',${'Card show bulk to single vendor - '+name+' @ $'+(per/100).toFixed(2)+'/pack'})`;
      totRev+=price; totCost+=cost; rows++; rem-=take;
    }
    console.log(`${name}: ${qty} @ $${(per/100).toFixed(2)}`);
  }
  console.log(`\ngroup ${sgid} | ${rows} rows | revenue $${(totRev/100).toFixed(2)} cost $${(totCost/100).toFixed(2)} profit $${((totRev-totCost)/100).toFixed(2)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
