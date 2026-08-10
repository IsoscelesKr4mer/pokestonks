import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
// [catalog, name, qty, perUnitCents]
const DEAL:[number,string,number,number][]=[
  [19776,'Prismatic Evolutions',3,7000],
  [17235,'Destined Rivals',1,6000],
  [31604,'White Flare',1,6000],
  [14342,'Journey Together',1,4000],
  [53860,'Pitch Black',4,3000],
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
  const sgid=randomUUID(); let totRev=0,totCost=0,rows=0;
  for(const [ci,name,qty,per] of DEAL){
    const lots=(await openLots(ci)).filter(l=>l.open>0);
    const avail=lots.reduce((s,l)=>s+l.open,0);
    if(avail<qty){ console.log(`SKIP ${name}: only ${avail} open, need ${qty}`); continue; }
    let rem=qty;
    for(const l of lots){ if(rem<=0)break; const take=Math.min(rem,l.open);
      await sql`INSERT INTO sales (user_id,sale_group_id,purchase_id,sale_date,quantity,sale_price_cents,fees_cents,matched_cost_cents,platform,notes)
        VALUES (${UID},${sgid},${l.id},'2026-07-25',${take},${take*per},0,${take*l.cost},'Card show (cash)',${'Card show bundle lot to single vendor - '+name+' @ $'+(per/100).toFixed(2)})`;
      totRev+=take*per; totCost+=take*l.cost; rows++; rem-=take;
    }
    console.log(`${name}: ${qty} @ $${(per/100).toFixed(2)}`);
  }
  console.log(`\ngroup ${sgid} | ${rows} rows | revenue $${(totRev/100).toFixed(2)} cost $${(totCost/100).toFixed(2)} profit $${((totRev-totCost)/100).toFixed(2)}`);
  // verify bundles held now 0
  const held=await sql`WITH lots AS (SELECT p.id,p.catalog_item_id,p.quantity FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id WHERE ci.product_type='Booster Bundle' AND p.deleted_at IS NULL)
    SELECT ci.name, SUM(l.quantity)-COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0) h
    FROM lots l JOIN catalog_items ci ON ci.id=l.catalog_item_id GROUP BY ci.name HAVING SUM(l.quantity)-COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)<>0`;
  console.log('bundles still held:', held.length? held.map((r:any)=>`${r.h}x ${r.name}`).join(', ') : 'NONE (all cleared)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
