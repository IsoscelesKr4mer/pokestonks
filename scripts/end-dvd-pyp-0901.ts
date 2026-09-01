/**
 * End the pick-your-DVD listing, item 168654454117. He asked, one line, no
 * qualification: "End the listing."
 *
 * EndFixedPriceItem, reason NotAvailable. Multi-variation listings end whole;
 * there is no per-variation end. Verified with GetItem afterwards, because the
 * REST side has lied about listing state before.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const ITEM = '168654454117';
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;
  const call=async(name:string,body:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':name,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body})).text();

  const t=await call('EndFixedPriceItem',
    `<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>`+
    `<ItemID>${ITEM}</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>`);
  console.log('EndFixedPriceItem:', t.match(/<Ack>([^<]*)</)?.[1]);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log('  -', m[1].slice(0,200));

  const g=await call('GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
    `<RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials>`+
    `<ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  console.log('live status now:', g.match(/<ListingStatus>([^<]*)</)?.[1]);
  console.log('quantity sold  :', g.match(/<QuantitySold>([^<]*)</)?.[1] ?? '0');
})();
