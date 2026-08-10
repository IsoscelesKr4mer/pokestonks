import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const IDS=[17235,19776];
(async()=>{
  for(const id of IDS){
    const ci=(await sql`SELECT id,name,last_market_cents,manual_market_cents FROM catalog_items WHERE id=${id}`)[0];
    const bought=(await sql`SELECT COALESCE(SUM(quantity),0) q FROM purchases WHERE catalog_item_id=${id} AND deleted_at IS NULL`)[0].q;
    const sold=(await sql`SELECT COALESCE(SUM(s.quantity),0) q FROM sales s JOIN purchases p ON s.purchase_id=p.id WHERE p.catalog_item_id=${id}`)[0].q;
    const ripped=(await sql`SELECT COUNT(*) q FROM rips r JOIN purchases p ON r.source_purchase_id=p.id WHERE p.catalog_item_id=${id}`)[0].q;
    const decomp=(await sql`SELECT COALESCE(SUM(1),0) q FROM box_decompositions b JOIN purchases p ON b.source_purchase_id=p.id WHERE p.catalog_item_id=${id}`)[0].q;
    console.log(JSON.stringify({name:ci.name, mkt:ci.last_market_cents, manual:ci.manual_market_cents, bought:Number(bought), sold:Number(sold), ripped:Number(ripped), decomp:Number(decomp), held:Number(bought)-Number(sold)-Number(ripped)-Number(decomp)}));
  }
  console.log('--- active mappings referencing these bundles ---');
  const all=await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings`;
  for(const row of all as any[]){
    const j=typeof row.mappings==='string'?JSON.parse(row.mappings):row.mappings;
    const arr=Array.isArray(j)?j:(j?.mappings||[]);
    for(const m of (Array.isArray(arr)?arr:[])){
      if(IDS.includes(Number(m.catalog_item_id||m.catalogItemId))) console.log(`  item ${row.ebay_item_id}: ${JSON.stringify(m)}`);
    }
  }
  console.log('(done scanning mappings)');
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
