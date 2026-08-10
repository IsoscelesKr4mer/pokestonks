import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  // 1) DB: not an auto, parallel corrected, price $7.50
  await sql`UPDATE baseball_cards SET parallel='Purple Refractor /250 (181/250)', asking_price_cents=750,
    notes='1957 Topps insert design looks like a signature but is NOT an autograph (per Michael)' WHERE id=2`;
  const row=(await sql`SELECT photo_urls FROM baseball_cards WHERE id=2`)[0];
  const imgs=row.photo_urls as string[];
  // 2) token
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const desc='<p>2025 Topps Chrome 1957 Topps Purple Refractor /250 - Garrett Crochet #84.</p><p>Raw / ungraded, near mint or better. Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking. Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';
  // 3) re-PUT inventory item (remove autograph)
  const inv={availability:{shipToLocationAvailability:{quantity:1}},condition:'USED_VERY_GOOD',conditionDescriptors:[{name:'40001',values:['400010']}],
    packageWeightAndSize:{dimensions:{width:4,length:6,height:1,unit:'INCH'},weight:{value:3,unit:'OUNCE'},shippingIrregular:false},
    product:{title:'2025 Topps Chrome 1957 Topps Garrett Crochet Purple Refractor /250 #84',
      aspects:{Sport:['Baseball'],League:['Major League Baseball (MLB)'],Type:['Sports Trading Card'],Set:['2025 Topps Chrome'],Season:['2025'],Manufacturer:['Topps'],'Player/Athlete':['Garrett Crochet'],'Card Name':['Garrett Crochet'],'Card Number':['84'],Grade:['Ungraded'],Graded:['No'],Vintage:['No'],Autographed:['No'],'Parallel/Variety':['Purple Refractor /250'],Features:['Refractor','Serial Numbered']},
      description:desc,brand:'Topps',mpn:'Does Not Apply',imageUrls:imgs}};
  const ir=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-2',{method:'PUT',headers:auth,body:JSON.stringify(inv)});
  console.log('inventory PUT',ir.status,(await ir.text()).slice(0,200));
  // 4) update offer price to 7.50
  const off={sku:'BBC-2',marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'261328',merchantLocationKey:'edmonds-wa',listingDescription:desc,listingPolicies:{paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:'272052757012',eBayPlusIfEligible:false},pricingSummary:{price:{value:'7.50',currency:'USD'}},tax:{applyTax:false}};
  const or=await fetch('https://api.ebay.com/sell/inventory/v1/offer/215878012011',{method:'PUT',headers:auth,body:JSON.stringify(off)});
  console.log('offer PUT',or.status,(await or.text()).slice(0,200));
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,400)));
