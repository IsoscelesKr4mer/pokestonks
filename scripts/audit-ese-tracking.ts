/**
 * Audit every eBay Standard Envelope shipment and its tracking state.
 *
 *   npx tsx scripts/audit-ese-tracking.ts
 *
 * Michael 2026-08-15: none of his ESE shipments show delivered, including one
 * from July. ESE scans are sparse by design but "never delivered" across the
 * board is a real exposure: without a delivery scan an item-not-received claim
 * defaults to the buyer.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
async function tok(){ const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json();
  return j.access_token as string; }
async function main(){
  const t=await tok();
  const r=await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=' + encodeURIComponent('creationdate:[2026-07-01T00:00:00.000Z..]') + '&limit=200',
    {headers:{Authorization:`Bearer ${t}`}});
  const b=await r.json();
  const orders=(b.orders||[]) as any[];
  const ese=orders.filter(o=>JSON.stringify(o).includes('eBayStandardEnvelope'));
  console.log(`${orders.length} orders since Jul 1 | ${ese.length} shipped eBay Standard Envelope\n`);
  for(const o of ese){
    const created=String(o.creationDate).slice(0,10);
    const age=Math.floor((Date.now()-new Date(o.creationDate).getTime())/86400000);
    let track='(no fulfillment record)', status='';
    for(const href of (o.fulfillmentHrefs||[])){
      const f=await (await fetch(href,{headers:{Authorization:`Bearer ${t}`}})).json();
      track=f.shipmentTrackingNumber || track;
      status=f.shippingCarrierCode ? `${f.shippingCarrierCode}` : '';
    }
    const item=(o.lineItems||[]).map((l:any)=>l.title).join(', ').slice(0,44);
    console.log(`  ${created} ${String(age).padStart(2)}d  $${String(o.pricingSummary?.total?.value).padStart(6)}  ${o.orderFulfillmentStatus.padEnd(10)} ${track.padEnd(18)} ${item}`);
  }
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1)});
