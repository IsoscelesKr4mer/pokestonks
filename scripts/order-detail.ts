import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const F='C:/Users/Michael/.claude/projects/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/d6249d3c-0281-4963-b522-3afbfde0cbd8/tool-results/toolu_01WT69PA29R3WcKQ5HeMoN4w.json';
async function main(){
  const data=JSON.parse(JSON.parse(readFileSync(F,'utf8'))[0].text);
  const o=data.orders.find((x:any)=>x.orderId==='03-14950-23180');
  console.log('subtotal',o.pricingSummary?.priceSubtotal?.value,'ship',o.pricingSummary?.deliveryCost?.value,'total',o.pricingSummary?.total?.value);
  console.log('totalDueSeller',o.paymentSummary?.totalDueSeller?.value);
  console.log('totalMarketplaceFee',o.totalMarketplaceFee?.value);
  for(const li of o.lineItems||[]){
    console.log('line:',li.title,'| sku',li.sku,'| itemId',li.legacyItemId||li.lineItemId,'| cost',li.lineItemCost?.value,'| fees',JSON.stringify(li.marketplaceFees||li.ebayCollectAndRemitTaxes||[]));
    console.log('  full lineItem keys:',Object.keys(li).join(','));
  }
  const iid=(o.lineItems[0].legacyItemId)||'';
  const m=await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE ebay_item_id=${iid}`;
  console.log('\nmapping for item',iid,':',JSON.stringify(m[0]?.mappings||'NONE'));
  // fallback: all WF mappings
  const all=await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE mappings::text ILIKE '%31604%'`;
  console.log('WF-related mappings:'); all.forEach((r:any)=>console.log(`  item ${r.ebay_item_id}: ${JSON.stringify(r.mappings)}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
