import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;
  const j:any=await(await fetch('https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B2026-08-29T00:00:00.000Z..%5D&limit=200',{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json'}})).json();
  for(const o of (j.orders||[])){
    const p=o.pricingSummary||{};
    console.log(`${o.creationDate.slice(0,16).replace('T',' ')}Z  ${o.orderId}`);
    console.log(`   subtotal $${p.priceSubtotal?.value}  ship $${p.deliveryCost?.value}  total $${p.total?.value}`);
    for(const li of (o.lineItems||[]))
      console.log(`   item ${li.legacyItemId}  qty ${li.quantity}  $${li.lineItemCost?.value}  ${String(li.title).slice(0,60)}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
