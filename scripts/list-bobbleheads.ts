import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET='ebay-listings', DIR='eBay_assets/card drop';
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function upload(img:string,name:string){ const buf=readFileSync(`${DIR}/${img}`); const {error}=await supa.storage.from(BUCKET).upload(name,buf,{contentType:'image/jpeg',upsert:true}); if(error)throw new Error(`${name}: ${error.message}`); return supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl; }
async function main(){
  const wooImgs=['0840','0844','0842','0841','0843','0845','0846','0847'];
  const arozImgs=['0848','0851','0849','0850','0852'];
  const wooUrls:string[]=[]; for(let i=0;i<wooImgs.length;i++) wooUrls.push(await upload(`IMG_${wooImgs[i]}.JPEG`,`woo_bobblehead_${i+1}.jpg`));
  const arozUrls:string[]=[]; for(let i=0;i<arozImgs.length;i++) arozUrls.push(await upload(`IMG_${arozImgs[i]}.JPEG`,`arozarena_bobblehead_${i+1}.jpg`));
  console.log('WOO_URLS='+JSON.stringify(wooUrls));
  console.log('AROZ_URLS='+JSON.stringify(arozUrls));

  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const SKU='BBL-WOO-AQUASOX';
  const desc='Bryan Woo Everett AquaSox bobblehead, a 2026 stadium giveaway (SGA), brand new and factory sealed in the original box. Seattle Mariners All-Star pitcher shown in his AquaSox uniform (Mariners High-A affiliate). Sound Transit promotional giveaway. Ships securely packed in a box within 1 business day. Smoke-free home.';
  const item={ sku:SKU, locale:'en_US', condition:'NEW', packageWeightAndSize:{dimensions:{length:9,width:6,height:6,unit:'INCH'},weight:{value:2,unit:'POUND'}}, availability:{shipToLocationAvailability:{quantity:2}}, product:{ title:'2026 Everett AquaSox Bryan Woo Bobblehead Seattle Mariners SGA New in Box', description:desc, aspects:{'Product':['Bobblehead'],'Player':['Bryan Woo'],'Team':['Seattle Mariners'],'League':['Major League Baseball (MLB)'],'Sport':['Baseball'],'Officially Licensed':['Yes']}, imageUrls:wooUrls } };
  const ir=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`,{method:'PUT',headers:auth,body:JSON.stringify(item)}); console.log('inventory PUT',ir.status, ir.status>=300?await ir.text():'');
  const offer={ sku:SKU, marketplaceId:'EBAY_US', format:'FIXED_PRICE', availableQuantity:2, categoryId:'24410', merchantLocationKey:'edmonds-wa', listingDescription:desc, listingPolicies:{paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:'269110723012',eBayPlusIfEligible:false,bestOfferTerms:{bestOfferEnabled:true,autoDeclinePrice:{value:'39.99',currency:'USD'}}}, pricingSummary:{price:{value:'49.99',currency:'USD'}}, tax:{applyTax:false} };
  const or=await fetch('https://api.ebay.com/sell/inventory/v1/offer',{method:'POST',headers:auth,body:JSON.stringify(offer)});
  const oj=await or.json(); console.log('offer POST',or.status,JSON.stringify(oj).slice(0,300));
  const offerId=oj.offerId;
  if(offerId){ const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`,{method:'POST',headers:auth}); const pj=await pr.json(); console.log('publish',pr.status,JSON.stringify(pj).slice(0,300)); }
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
