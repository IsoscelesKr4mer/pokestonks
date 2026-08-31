import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>168632581778</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeWatchCount>true</IncludeWatchCount></GetItemRequest>`})).text();
  const g=(k:string)=>t.match(new RegExp(`<${k}[^>]*>([^<]*)</${k}>`))?.[1]??'-';
  console.log('title      ', g('Title'));
  console.log('type       ', g('ListingType'), ' status', g('ListingStatus'));
  console.log('start price $'+g('StartPrice'));
  console.log('FINAL      $'+g('CurrentPrice'), ' bids', g('BidCount'));
  console.log('watchers   ', g('WatchCount'), ' quantity sold', g('QuantitySold'));
  console.log('started    ', g('StartTime').slice(0,16), ' ended', g('EndTime').slice(0,16));
  console.log('shipping   ', g('ShippingService'), g('ShippingType'));
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
