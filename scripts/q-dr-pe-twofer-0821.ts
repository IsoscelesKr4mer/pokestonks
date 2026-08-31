import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const IDS=[17235,19776];
async function main(){
  for (const ci of IDS){
    const n:any = await sql`SELECT name FROM catalog_items WHERE id=${ci}`;
    const lots:any = await sql`
      SELECT p.id, p.purchase_date::text d, p.quantity, p.cost_cents, p.source,
        (p.quantity
         - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)
         - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
         - COALESCE((SELECT COUNT(*) FROM box_decompositions bd WHERE bd.source_purchase_id=p.id),0))::int open
      FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL
      ORDER BY p.purchase_date, p.id`;
    const open = lots.filter((l:any)=>l.open>0);
    const held = open.reduce((a:number,l:any)=>a+l.open,0);
    const basis = open.reduce((a:number,l:any)=>a+l.open*l.cost_cents,0);
    console.log(`\n=== ci${ci} ${n[0].name} ===`);
    console.log('  held', held, '| open-lot basis $'+(basis/100).toFixed(2));
    open.forEach((l:any)=>console.log(`   lot#${l.id} ${l.d} open ${l.open} @ $${(l.cost_cents/100).toFixed(2)} (${l.source})`));
    const px:any = await sql`SELECT snapshot_date::text d, market_price_cents m FROM market_prices WHERE catalog_item_id=${ci} ORDER BY snapshot_date DESC LIMIT 3`;
    px.forEach((r:any)=>console.log(`   px ${r.d} $${(r.m/100).toFixed(2)}`));
    const maps:any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE mappings::text LIKE ${'%"catalogItemId":'+ci+'%'}`;
    maps.forEach((m:any)=>console.log('   MAP', m.ebay_item_id, JSON.stringify(m.mappings)));
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
