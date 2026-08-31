import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{
  if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}
  return undefined;
}
async function userToken(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  if(!j.access_token)throw new Error('token refresh failed');
  return j.access_token as string;
}
async function api(tok:string,path:string){
  const r=await fetch(`https://api.ebay.com${path}`,{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json','Accept-Language':'en-US'}});
  const t=await r.text(); if(r.status>=300) throw new Error(`${path} -> ${r.status} ${t.slice(0,300)}`);
  return t?JSON.parse(t):null;
}
async function main(){
  const tok=await userToken();
  const inv:any=await api(tok,'/sell/inventory/v1/inventory_item/DRPRIS-TWOFER');
  console.log('INVENTORY ITEM:');
  console.log('  title:', inv.product?.title);
  console.log('  imageUrls:', JSON.stringify(inv.product?.imageUrls));
  console.log('  upc:', JSON.stringify(inv.product?.upc));
  console.log('  aspects:', JSON.stringify(inv.product?.aspects));
  console.log('  availability:', JSON.stringify(inv.availability));
  console.log('  pkg:', JSON.stringify(inv.packageWeightAndSize));
  const off:any=await api(tok,'/sell/inventory/v1/offer?sku=DRPRIS-TWOFER');
  for(const o of off.offers??[]){
    console.log('OFFER', o.offerId, o.status, 'listing', JSON.stringify(o.listing), 'price', JSON.stringify(o.pricingSummary?.price), 'qty', o.availableQuantity, 'cat', o.categoryId);
    console.log('  policies:', JSON.stringify(o.listingPolicies));
    console.log('  DESC:', String(o.listingDescription??'').slice(0,1200));
  }
  await new Promise(r=>setTimeout(r,50));
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
