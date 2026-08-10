import { config } from 'dotenv';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json();
  console.log('token status',tr.status,'has_token',!!tj.access_token, tj.error||'');
  if(!tj.access_token){ console.log(JSON.stringify(tj)); return; }
  const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept':'application/json','Accept-Language':'en-US'};
  const all=JSON.parse(readFileSync('scripts/listings_payload.json','utf8'));
  const o=all[0];
  const body={requests:[{sku:o.sku,locale:"en_US",condition:'USED_VERY_GOOD',conditionDescriptors:[{name:'40001',values:['400010']}],packageWeightAndSize:{dimensions:{width:4,length:6,height:1,unit:'INCH'},weight:{value:3,unit:'OUNCE'},shippingIrregular:false},availability:{shipToLocationAvailability:{quantity:1}},product:o.product}]};
  const r=await fetch('https://api.ebay.com/sell/inventory/v1/bulk_create_or_replace_inventory_item',{method:'POST',headers:auth,body:JSON.stringify(body)});
  console.log('bulk inv status',r.status);
  console.log((await r.text()).slice(0,700));
}
main().catch(e=>console.error(String(e).slice(0,400)));
