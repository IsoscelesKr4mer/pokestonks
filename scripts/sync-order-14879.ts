import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ORDER_ID = '07-14879-41616';
const SALE_DATE = '2026-07-09'; // matches app preview (UTC date slice)
const FEES = 4488;
const NOTES = `eBay order #${ORDER_ID}`;
// lines: [lineRevenueCents, mapping[{catalogItemId, qty}]]
const LINES: [number, {c:number,q:number}[]][] = [
  [14999, [{c:31604,q:1},{c:5241,q:1}]], // WFBB-2PACK-R5
  [14499, [{c:31604,q:2}]],              // WF-2PACK
];

async function mkt(id:number){
  const r = await sql`SELECT market_price_cents m FROM market_prices WHERE catalog_item_id=${id} ORDER BY snapshot_date DESC LIMIT 1`;
  return r[0]?.m ?? 0;
}
async function openLots(id:number){
  return await sql<{purchaseId:number,purchaseDate:string,createdAt:string,costCents:number,qtyAvailable:number}[]>`
    SELECT p.id AS "purchaseId", to_char(p.purchase_date,'YYYY-MM-DD') AS "purchaseDate",
           p.created_at::text AS "createdAt", p.cost_cents AS "costCents",
           (p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
                       - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
                       - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS "qtyAvailable"
    FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL`;
}
function matchFifo(lots:any[], totalQty:number, totalSale:number, totalFees:number){
  const sorted=[...lots].filter(l=>l.qtyAvailable>0).sort((a,b)=>
    a.purchaseDate!==b.purchaseDate ? (a.purchaseDate<b.purchaseDate?-1:1) :
    a.createdAt!==b.createdAt ? (a.createdAt<b.createdAt?-1:1) : a.purchaseId-b.purchaseId);
  const avail=sorted.reduce((s,l)=>s+l.qtyAvailable,0);
  if(avail<totalQty) throw new Error(`insufficient_qty avail=${avail} need=${totalQty}`);
  let rem=totalQty; const pend:any[]=[];
  for(const l of sorted){ if(!rem)break; const take=Math.min(rem,l.qtyAvailable);
    pend.push({purchaseId:l.purchaseId,quantity:take,matchedCostCents:take*l.costCents}); rem-=take; }
  const rows=pend.map(p=>({purchaseId:p.purchaseId,quantity:p.quantity,
    salePriceCents:Math.floor(totalSale*p.quantity/totalQty),
    feesCents:Math.floor(totalFees*p.quantity/totalQty),matchedCostCents:p.matchedCostCents}));
  const sumP=rows.reduce((s,r)=>s+r.salePriceCents,0), sumF=rows.reduce((s,r)=>s+r.feesCents,0);
  const li=rows.length-1; rows[li].salePriceCents+=totalSale-sumP; rows[li].feesCents+=totalFees-sumF;
  return rows;
}

async function main(){
  const dup=await sql`SELECT 1 FROM ebay_synced_orders WHERE ebay_order_id=${ORDER_ID}`;
  if(dup.length){ console.log('already synced, aborting'); await sql.end(); return; }

  // revenue split (preview logic)
  const px:Record<number,number>={31604:await mkt(31604),5241:await mkt(5241)};
  console.log('market px:',JSON.stringify(px));
  const perCat=new Map<number,{qty:number,rev:number}>();
  for(const [rev,map] of LINES){
    const lw=map.reduce((a,m)=>a+px[m.c]*m.q,0);
    for(const m of map){
      const share = lw>0 ? (px[m.c]*m.q)/lw : m.q/map.reduce((a,e)=>a+e.q,0);
      const r=Math.round(rev*share);
      const e=perCat.get(m.c); if(e){e.qty+=m.q; e.rev+=r;} else perCat.set(m.c,{qty:m.q,rev:r});
    }
  }
  // fee allocation
  const ids=[...perCat.keys()]; const totalRev=[...perCat.values()].reduce((a,v)=>a+v.rev,0);
  let alloc=0; const items=ids.map((cid,i)=>{const v=perCat.get(cid)!;
    const fee = i===ids.length-1 ? FEES-alloc : (totalRev>0?Math.round(v.rev/totalRev*FEES):Math.round(FEES/ids.length));
    alloc+=fee; return {catalogItemId:cid,quantity:v.qty,salePriceCents:v.rev,feesCents:Math.max(0,fee)};});
  console.log('proposed items:',JSON.stringify(items));

  const uid=(await sql`SELECT user_id FROM purchases WHERE catalog_item_id=31604 AND deleted_at IS NULL LIMIT 1`)[0].user_id;
  const sgid=randomUUID();
  const allRows:any[]=[];
  for(const it of items){
    const rows=matchFifo(await openLots(it.catalogItemId), it.quantity, it.salePriceCents, it.feesCents);
    for(const r of rows) allRows.push({...r, catalogItemId:it.catalogItemId});
  }
  await sql.begin(async (tx)=>{
    for(const r of allRows){
      await tx`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
        VALUES (${uid}, ${sgid}, ${r.purchaseId}, ${SALE_DATE}, ${r.quantity}, ${r.salePriceCents}, ${r.feesCents}, ${r.matchedCostCents}, 'eBay', ${NOTES})`;
    }
    await tx`INSERT INTO ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped) VALUES (${uid}, ${ORDER_ID}, ${sgid}, false)`;
  });
  const rev=allRows.reduce((s,r)=>s+r.salePriceCents,0), fee=allRows.reduce((s,r)=>s+r.feesCents,0), cost=allRows.reduce((s,r)=>s+r.matchedCostCents,0);
  console.log(`\ninserted ${allRows.length} sale rows, group ${sgid}`);
  console.log(`revenue $${(rev/100).toFixed(2)} fees $${(fee/100).toFixed(2)} cost $${(cost/100).toFixed(2)} realized $${((rev-fee-cost)/100).toFixed(2)}`);
  await sql.end();
}
main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});
