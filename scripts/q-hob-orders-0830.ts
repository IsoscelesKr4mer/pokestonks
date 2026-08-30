/** What actually sold off the Hobbit you-pick, and did it ship? */
import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;
  const j:any=await(await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B2026-08-20T00:00:00.000Z..%5D&limit=200',{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json'}})).json();
  const orders=(j.orders||[]).filter((o:any)=>(o.lineItems||[]).some((li:any)=>li.legacyItemId==='168636653046'));
  console.log(`${orders.length} order(s) containing the Hobbit you-pick\n`);
  for(const o of orders){
    console.log(`order ${o.orderId}  ${o.creationDate}  ${o.orderFulfillmentStatus}`);
    for(const li of o.lineItems.filter((l:any)=>l.legacyItemId==='168636653046'))
      console.log(`   qty ${li.quantity}  $${li.lineItemCost?.value}  ${li.title?.slice(0,40)}  variation: ${JSON.stringify(li.variationAspects||li.variation||{}).slice(0,120)}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
