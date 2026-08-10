import { config } from 'dotenv';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
const TITLE='2026 Everett AquaSox Bryan Woo Bobblehead Seattle Mariners SGA Limited 1000';
const DESC='Limited stadium giveaway - only 1,000 of these were produced, handed out to the first 1,000 fans through the gate at the Everett AquaSox game. A much smaller release than a typical MLB Mariners stadium bobblehead. Bryan Woo, Seattle Mariners All-Star pitcher, shown here in his AquaSox uniform (Mariners High-A affiliate). Brand new and factory sealed in the original box. Sound Transit promotional giveaway. Ships securely packed in a box within 1 business day. Smoke-free home.';
async function main(){
  console.log('title len',TITLE.length);
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const item=await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBL-WOO-AQUASOX',{headers:auth})).json();
  item.product.title=TITLE; item.product.description=DESC; item.product.aspects['Features']=['Limited Edition']; if(!item.locale)item.locale='en_US';
  const ir=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBL-WOO-AQUASOX',{method:'PUT',headers:auth,body:JSON.stringify(item)});
  const offer={sku:'BBL-WOO-AQUASOX',marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:2,categoryId:'24410',merchantLocationKey:'edmonds-wa',listingDescription:DESC,listingPolicies:{paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:'269110723012',eBayPlusIfEligible:false},pricingSummary:{price:{value:'49.99',currency:'USD'}},tax:{applyTax:false}};
  const or=await fetch('https://api.ebay.com/sell/inventory/v1/offer/217223394011',{method:'PUT',headers:auth,body:JSON.stringify(offer)});
  console.log('inv',ir.status,'offer',or.status, or.status>=300?await or.text():'');
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
