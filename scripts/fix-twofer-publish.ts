import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
const SKU='DRPRIS-TWOFER', OFFER='218664176011';
(async()=>{
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const item=await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`,{headers:auth})).json();
  delete item.product.aspects['Set'];
  const ir=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`,{method:'PUT',headers:auth,body:JSON.stringify(item)});
  console.log('inv',ir.status);
  const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${OFFER}/publish`,{method:'POST',headers:auth});
  const pj=await pr.json(); console.log('publish',pr.status,JSON.stringify(pj).slice(0,250));
  if(pj.listingId){
    const maps=JSON.stringify([{qty:1,catalogItemId:19776},{qty:1,catalogItemId:17235}]);
    await sql`INSERT INTO ebay_listing_mappings (user_id,ebay_item_id,mappings) VALUES (${UID},${pj.listingId},${maps}::jsonb)`;
    console.log('mapping inserted for listing',pj.listingId);
  }
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
