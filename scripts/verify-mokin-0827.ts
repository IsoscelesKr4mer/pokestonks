/** Trading API GetItem is the authority on what buyers actually see. REST lies. */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json();
  const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${j.access_token}</eBayAuthToken></RequesterCredentials><ItemID>168644337111</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  const r=await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml});
  const t=await r.text();
  const g=(k:string)=>{const m=t.match(new RegExp(`<${k}[^>]*>([^<]*)</${k}>`));return m?m[1]:'-';};
  console.log(`status      ${g('ListingStatus')}`);
  console.log(`title       ${g('Title')}`);
  console.log(`price       $${g('CurrentPrice')}   qty ${g('Quantity')}`);
  console.log(`category    ${g('CategoryID')} ${g('CategoryName')}`);
  console.log(`condition   ${g('ConditionDisplayName')}`);
  console.log(`weight      ${g('WeightMajor')} lb ${g('WeightMinor')} oz`);
  console.log(`shipping    ${g('ShippingService')} (${g('ShippingType')})`);
  console.log(`photos      ${(t.match(/<PictureURL>/g)||[]).length}`);
  console.log(`url         https://www.ebay.com/itm/168644337111`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
