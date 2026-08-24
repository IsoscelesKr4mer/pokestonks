import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows:any = await sql`
    WITH held AS (
      SELECT p.catalog_item_id,
        SUM(p.quantity)
        - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=p.id)),0)
        - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id)),0)
        - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id)),0) AS qty
      FROM purchases p WHERE p.deleted_at IS NULL GROUP BY p.catalog_item_id),
    lp AS (SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents m, low_price_cents lo, high_price_cents hi, snapshot_date
           FROM market_prices ORDER BY catalog_item_id, snapshot_date DESC)
    SELECT ci.id, ci.name, ci.product_type, h.qty, lp.m, lp.lo, lp.hi, lp.snapshot_date::text d,
           ci.manual_market_cents mm
    FROM held h JOIN catalog_items ci ON ci.id=h.catalog_item_id LEFT JOIN lp ON lp.catalog_item_id=ci.id
    WHERE h.qty > 0 AND (ci.name ILIKE '%30th%' OR ci.set_name ILIKE '%30th%')
    ORDER BY ci.name`;
  console.log(`${rows.length} held 30th items\n`);
  const ids = rows.map((r:any)=>r.id);
  // FIFO open-lot cost per item
  const costs:Record<number,{q:number,c:number,lots:string[]}> = {};
  for(const id of ids){
    const lots:any = await sql`
      SELECT p.id, p.purchase_date::text pd, p.quantity, p.cost_cents, p.source,
        COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0) sold,
        (SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id) ripped,
        (SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id) dec
      FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL ORDER BY p.purchase_date, p.id`;
    costs[id]={q:0,c:0,lots:[]};
    for(const l of lots){
      const rem=l.quantity-Number(l.sold)-Number(l.ripped)-Number(l.dec);
      if(rem>0){ costs[id].q+=rem; costs[id].c+=rem*l.cost_cents; costs[id].lots.push(`pu${l.id} ${l.pd} ${rem}@$${(l.cost_cents/100).toFixed(2)} ${l.source??''}`); }
    }
  }
  // active listing commitments
  const maps:any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  const listed:Record<number,string[]> = {};
  for(const m of maps){
    for(const x of (m.mappings as any[])??[]) if(ids.includes(Number(x.catalogItemId))){
      (listed[Number(x.catalogItemId)] ??= []).push(`${m.ebay_item_id} (${x.qty}x)`);
    }
  }
  const SHIP: Record<string,number> = { 'Pokemon Center Elite Trainer Box':1400, 'Elite Trainer Box':1400, 'Booster Bundle':900, 'Collection':700, 'Blister':600 };
  let totCost=0, totGross=0, totNet=0;
  for(const r of rows){
    const cost = costs[r.id];
    const mk = r.m ?? r.mm;
    const ship = SHIP[r.product_type] ?? 700;
    const unitCost = cost.q ? cost.c/cost.q : 0;
    const tax = Math.round((mk+ship)*0.09);
    const fee = Math.round(0.1325*(mk+ship+tax)) + 40;
    const net = mk - fee;
    const roi = unitCost ? (net-unitCost)/unitCost*100 : 0;
    totCost += cost.c; totGross += mk*r.qty; totNet += net*r.qty;
    console.log(`ci${r.id} ${r.name}`);
    console.log(`  type ${r.product_type} | held ${r.qty} | snapshot ${r.d ?? 'NONE'}${r.mm?' (manual '+(r.mm/100).toFixed(2)+')':''}`);
    console.log(`  comp $${(mk/100).toFixed(2)} (low $${r.lo!=null?(r.lo/100).toFixed(2):'—'}, high $${r.hi!=null?(r.hi/100).toFixed(2):'—'})`);
    console.log(`  cost $${(unitCost/100).toFixed(2)}/ea  [${cost.lots.join(' | ')}]`);
    console.log(`  net at comp $${(net/100).toFixed(2)} (fee $${(fee/100).toFixed(2)} est, ship $${(ship/100).toFixed(2)}) -> profit $${((net-unitCost)/100).toFixed(2)}/ea, ROI ${roi.toFixed(1)}%`);
    console.log(`  all ${r.qty}: cost $${(cost.c/100).toFixed(2)} -> net $${(net*r.qty/100).toFixed(2)}, profit $${((net*r.qty-cost.c)/100).toFixed(2)}`);
    console.log(`  listed: ${listed[r.id]?.join(', ') ?? 'NOT LISTED'}\n`);
  }
  console.log('=== PORTFOLIO ===');
  console.log(`cost basis      $${(totCost/100).toFixed(2)}`);
  console.log(`gross at comp   $${(totGross/100).toFixed(2)}`);
  console.log(`net at comp     $${(totNet/100).toFixed(2)}`);
  console.log(`profit          $${((totNet-totCost)/100).toFixed(2)}  ROI ${((totNet-totCost)/totCost*100).toFixed(1)}%`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,800));process.exit(1);});
