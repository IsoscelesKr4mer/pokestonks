import { config } from 'dotenv';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
const base='https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';
const imgs=[1,2,3,4,5].map(n=>`${base}arozarena_bobblehead_${n}.jpg`);
async function main(){
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const SKU='BBL-AROZARENA-2025';
  const desc='Randy Arozarena Seattle Mariners bobblehead, a 2025 stadium giveaway (SGA), brand new and factory sealed in the original box. Ships securely packed in a box within 1 business day. Smoke-free home.';
  const item={sku:SKU,locale:'en_US',condition:'NEW',packageWeightAndSize:{dimensions:{length:9,width:6,height:6,unit:'INCH'},weight:{value:2,unit:'POUND'}},availability:{shipToLocationAvailability:{quantity:1}},product:{title:'2025 Seattle Mariners Randy Arozarena Bobblehead SGA New in Box',description:desc,aspects:{'Product':['Bobblehead'],'Player':['Randy Arozarena'],'Team':['Seattle Mariners'],'League':['Major League Baseball (MLB)'],'Sport':['Baseball'],'Officially Licensed':['Yes']},imageUrls:imgs}};
  const ir=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`,{method:'PUT',headers:auth,body:JSON.stringify(item)}); console.log('inv',ir.status,ir.status>=300?await ir.text():'');
  const offer={sku:SKU,marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'24410',merchantLocationKey:'edmonds-wa',listingDescription:desc,listingPolicies:{paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:'269110723012',eBayPlusIfEligible:false},pricingSummary:{price:{value:'29.99',currency:'USD'}},tax:{applyTax:false}};
  const or=await fetch('https://api.ebay.com/sell/inventory/v1/offer',{method:'POST',headers:auth,body:JSON.stringify(offer)}); const oj=await or.json(); console.log('offer',or.status,JSON.stringify(oj).slice(0,200));
  if(oj.offerId){ const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${oj.offerId}/publish`,{method:'POST',headers:auth}); const pj=await pr.json(); console.log('publish',pr.status,JSON.stringify(pj).slice(0,200)); }
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
