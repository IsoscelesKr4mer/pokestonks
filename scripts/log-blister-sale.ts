import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function openLots(id:number){
  return await sql<any[]>`
    SELECT p.id AS "purchaseId", to_char(p.purchase_date,'YYYY-MM-DD') pd, p.created_at::text ca, p.cost_cents cc,
      (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int avail
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`;
}
function fifo(lots:any[], qty:number, total:number){
  const s=[...lots].filter(l=>l.avail>0).sort((a,b)=> a.pd!==b.pd?(a.pd<b.pd?-1:1): a.ca!==b.ca?(a.ca<b.ca?-1:1): a.purchaseId-b.purchaseId);
  let rem=qty; const p:any[]=[];
  for(const l of s){ if(!rem)break; const t=Math.min(rem,l.avail); p.push({purchaseId:l.purchaseId,quantity:t,matchedCostCents:t*l.cc}); rem-=t; }
  if(rem>0) throw new Error('insufficient qty '+qty);
  const rows=p.map(x=>({...x, salePriceCents:Math.floor(total*x.quantity/qty), feesCents:0}));
  const sp=rows.reduce((a,r)=>a+r.salePriceCents,0); rows[rows.length-1].salePriceCents+=total-sp;
  return rows;
}
async function main(){
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  const sg=randomUUID(); let rev=0,cost=0;
  const items=[{id:19840,qty:1,total:1468},{id:33558,qty:2,total:2532}];
  const notes='Card show cash: 3 blisters (PO Chikorita 3pk + 2x Oddish/Gloom/Vileplume 2pk) for $40 total (~70%)';
  await sql.begin(async(tx)=>{
    for(const it of items){
      for(const r of fifo(await openLots(it.id), it.qty, it.total)){
        await tx`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
          VALUES (${uid}, ${sg}, ${r.purchaseId}, '2026-07-12', ${r.quantity}, ${r.salePriceCents}, 0, ${r.matchedCostCents}, 'Card show (cash)', ${notes})`;
        rev+=r.salePriceCents; cost+=r.matchedCostCents;
      }
    }
  });
  console.log(`Blister deal: rev $${(rev/100).toFixed(2)} cost $${(cost/100).toFixed(2)} profit $${((rev-cost)/100).toFixed(2)}`);
  for(const [id,n] of [[19840,'Chikorita blister'],[33558,'Oddish 2pk']] as const){
    const h=(await sql<{h:number}[]>`SELECT COALESCE(SUM(p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)),0)::int h
      FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
    console.log(`  ${n} held now: ${h}`);
  }
  await sql.end();
}
main().catch(e=>{console.error('ERR:',e.message);process.exit(1);});
