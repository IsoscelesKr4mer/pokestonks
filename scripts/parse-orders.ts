import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const F='C:/Users/Michael/.claude/projects/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/d6249d3c-0281-4963-b522-3afbfde0cbd8/tool-results/toolu_01WT69PA29R3WcKQ5HeMoN4w.json';
async function main(){
  const wrap=JSON.parse(readFileSync(F,'utf8'));
  const data=JSON.parse(wrap[0].text);
  const synced=await sql`SELECT ebay_order_id FROM ebay_synced_orders`;
  const syncedSet=new Set(synced.map((r:any)=>r.ebay_order_id));
  console.log(`total orders: ${data.total}, showing ${data.orders.length}\n`);
  for(const o of data.orders){
    const items=(o.lineItems||[]).map((li:any)=>`${li.quantity}x "${li.title?.slice(0,45)}" sku=${li.sku||'-'} $${li.lineItemCost?.value}`);
    const isSynced=syncedSet.has(o.orderId)||syncedSet.has(o.legacyOrderId);
    console.log(`${o.orderId} ${o.creationDate?.slice(0,16)} sub$${o.pricingSummary?.priceSubtotal?.value} ship$${o.pricingSummary?.deliveryCost?.value} ${isSynced?'[SYNCED]':'[NOT SYNCED]'}`);
    items.forEach((i:string)=>console.log('    '+i));
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
