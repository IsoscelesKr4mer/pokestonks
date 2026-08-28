import { readFileSync } from 'fs'; import { homedir } from 'os';
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>168645350776</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
  const d=(t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  console.log('status  ', t.match(/<ListingStatus>([^<]*)</)?.[1]);
  console.log('photos  ', (t.match(/<PictureURL>/g)||[]).length);
  console.log('desc len', d.length);
  console.log('SR lines', (d.match(/<li>SR-/g)||[]).length, ' R lines', (d.match(/<li>R-/g)||[]).length);
  console.log('has not-included note:', /Not included/.test(d));
  console.log('\nfirst 260 chars of live description:');
  console.log(d.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,260));
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
