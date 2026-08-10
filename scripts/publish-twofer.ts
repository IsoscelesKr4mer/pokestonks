import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
const base='https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';
const SKU='DRPRIS-TWOFER';
const DESC='<p>Two sealed Pokemon TCG Scarlet &amp; Violet Booster Bundles: one Prismatic Evolutions and one Destined Rivals. Each bundle contains 6 booster packs (12 packs total).</p><p>Both bundles new and factory sealed, smoke-free home. Ships within 1 business day.</p><p>Buy with confidence, check my feedback. Thanks for looking.</p>';
(async()=>{
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const item={sku:SKU,locale:'en_US',condition:'NEW',
    packageWeightAndSize:{dimensions:{width:7,length:9,height:4,unit:'INCH'},weight:{value:2,unit:'POUND'},shippingIrregular:false},
    availability:{shipToLocationAvailability:{quantity:1}},
    product:{title:'Pokemon TCG Prismatic Evolutions + Destined Rivals Booster Bundle Lot Sealed',description:DESC,brand:'Pokémon',mpn:'Does Not Apply',
      aspects:{'Card Size':['Standard'],'Autographed':['No'],'Set':['Scarlet & Violet: Prismatic Evolutions','Scarlet & Violet: Destined Rivals'],'Configuration':['Sealed'],'Number of Packs':['12'],'Year Manufactured':['2025'],'Material':['Card Stock'],'Age Level':['6+'],'Vintage':['No'],'Type':['Booster Bundle'],'Game':['Pokémon TCG'],'Language':['English'],'Manufacturer':['The Pokémon Company'],'Features':['Sealed']},
      imageUrls:[base+'dr_prismatic_twofer_front.jpg',base+'dr_prismatic_twofer_back.jpg']}};
  const ir=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`,{method:'PUT',headers:auth,body:JSON.stringify(item)});
  console.log('inv',ir.status, ir.status>=300?await ir.text():'');
  const offer={sku:SKU,marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'183456',merchantLocationKey:'edmonds-wa',listingDescription:DESC,listingPolicies:{paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:'269110723012',eBayPlusIfEligible:false},pricingSummary:{price:{value:'159.99',currency:'USD'}},tax:{applyTax:false}};
  const or=await fetch('https://api.ebay.com/sell/inventory/v1/offer',{method:'POST',headers:auth,body:JSON.stringify(offer)});
  const oj=await or.json(); console.log('offer',or.status,JSON.stringify(oj).slice(0,200));
  if(!oj.offerId){process.exit(1);}
  const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${oj.offerId}/publish`,{method:'POST',headers:auth});
  const pj=await pr.json(); console.log('publish',pr.status,JSON.stringify(pj).slice(0,200));
  const listingId=pj.listingId;
  if(listingId){
    const maps=JSON.stringify([{qty:1,catalogItemId:19776},{qty:1,catalogItemId:17235}]);
    await sql`INSERT INTO ebay_listing_mappings (user_id,ebay_item_id,mappings) VALUES (${UID},${listingId},${maps}::jsonb)`;
    console.log('mapping inserted for listing',listingId);
  }
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
