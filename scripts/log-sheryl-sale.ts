import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const userId='66200525-2237-4cc3-948f-aaafd3253d4b';
const saleDate=new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
const notes='Cash sale to Sheryl: 3 Chaos Rising ETB + 3 CR bundles + White Flare bundle + Black Bolt bundle + Raikou blister, $470 total';
// market-proportional per-unit allocation of $470 (cents), totals 47000
const items=[
  {cid:186,   prices:[6513,6513,6514]}, // 3 CR ETB
  {cid:183,   prices:[3660,3660,3660]}, // 3 CR bundle
  {cid:31604, prices:[7030]},           // WF bundle
  {cid:5241,  prices:[7857]},           // BB bundle
  {cid:33551, prices:[1593]},           // Raikou blister
];
async function openLots(cid:number){
  const r = await sql`SELECT p.id, p.cost_cents,
    (p.quantity-COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
    -COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
    -COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS ql
    FROM purchases p WHERE p.catalog_item_id=${cid} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.created_at`;
  return r.filter((l)=>Number(l.ql)>0);
}
async function main(){
  const gid=randomUUID(); const rows:any[]=[];
  for(const it of items){
    const lots=await openLots(it.cid); let li=0,used=0;
    for(const price of it.prices){
      while(li<lots.length && used>=Number(lots[li].ql)){li++;used=0;}
      if(li>=lots.length) throw new Error(`not enough held for #${it.cid}`);
      rows.push({user_id:userId,sale_group_id:gid,purchase_id:Number(lots[li].id),sale_date:saleDate,quantity:1,sale_price_cents:price,fees_cents:0,matched_cost_cents:Number(lots[li].cost_cents),platform:'Cash',notes});
      used++;
    }
  }
  await sql`INSERT INTO sales ${(sql as any)(rows,'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
  const sp=rows.reduce((a,r)=>a+r.sale_price_cents,0), mc=rows.reduce((a,r)=>a+r.matched_cost_cents,0);
  console.log(`logged ${rows.length} rows, date ${saleDate} | revenue $${(sp/100).toFixed(2)} | cost $${(mc/100).toFixed(2)} | profit $${((sp-mc)/100).toFixed(2)}`);
  console.log('held after:');
  for(const cid of [186,183,31604,5241,33551]){
    const h=(await sql`SELECT ci.name, COALESCE(SUM(p.quantity
      -COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      -COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      -COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL WHERE ci.id=${cid} GROUP BY ci.name`)[0];
    console.log(`  #${cid} ${h.name}: ${h.held}`);
  }
  await sql.end();
}
main();
