import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function openLots(id:number){
  return await sql<any[]>`
    SELECT p.id AS "purchaseId", to_char(p.purchase_date,'YYYY-MM-DD') AS pd, p.created_at::text AS ca, p.cost_cents AS cc,
      (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
                  - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int AS avail
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`;
}
function fifo(lots:any[], qty:number, totalSale:number){
  const s=[...lots].filter(l=>l.avail>0).sort((a,b)=> a.pd!==b.pd?(a.pd<b.pd?-1:1): a.ca!==b.ca?(a.ca<b.ca?-1:1): a.purchaseId-b.purchaseId);
  let rem=qty; const pend:any[]=[];
  for(const l of s){ if(!rem)break; const t=Math.min(rem,l.avail); pend.push({purchaseId:l.purchaseId,quantity:t,matchedCostCents:t*l.cc}); rem-=t; }
  if(rem>0) throw new Error(`insufficient qty for catalog (need ${qty})`);
  const rows=pend.map(p=>({...p, salePriceCents:Math.floor(totalSale*p.quantity/qty), feesCents:0}));
  const sp=rows.reduce((a,r)=>a+r.salePriceCents,0); rows[rows.length-1].salePriceCents+=totalSale-sp;
  return rows;
}
async function logDeal(uid:string, notes:string, items:{id:number,qty:number,total:number}[]){
  const sg=randomUUID(); let rev=0,cost=0;
  await sql.begin(async (tx)=>{
    for(const it of items){
      const rows=fifo(await openLots(it.id), it.qty, it.total);
      for(const r of rows){
        await tx`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
          VALUES (${uid}, ${sg}, ${r.purchaseId}, '2026-07-12', ${r.quantity}, ${r.salePriceCents}, 0, ${r.matchedCostCents}, 'Card show (cash)', ${notes})`;
        rev+=r.salePriceCents; cost+=r.matchedCostCents;
      }
    }
  });
  console.log(`  group ${sg.slice(0,8)} | rev $${(rev/100).toFixed(2)} cost $${(cost/100).toFixed(2)} profit $${((rev-cost)/100).toFixed(2)}`);
}
async function main(){
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  console.log('Deal 1: 2 Hops Zacian @ $55');
  await logDeal(uid,'Card show cash deal: 2 Hops Zacian ex Box @ $27.50 ($55 total)',[{id:33474,qty:2,total:5500}]);
  console.log('Deal 2: 6 PE + 2 WF + 1 PO @ $560');
  await logDeal(uid,'Card show cash deal: 6 Prismatic bundles + 2 White Flare bundles + 1 Perfect Order bundle (PO at cost), $560 total',
    [{id:19776,qty:6,total:40371},{id:31604,qty:2,total:12629},{id:19845,qty:1,total:3000}]);
  // held after
  for(const [id,n] of [[33474,'Hops'],[19776,'PE'],[31604,'WF'],[19845,'PO bundle']] as const){
    const h=(await sql<{h:number}[]>`SELECT COALESCE(SUM(p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)),0)::int h
      FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`)[0].h;
    console.log(`  ${n} held now: ${h}`);
  }
  await sql.end();
}
main().catch(e=>{console.error('ERR:',e.message);process.exit(1);});
