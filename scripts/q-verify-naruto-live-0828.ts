/** Trading API GetItem is the only thing that reports what buyers actually see. */
import { readFileSync } from 'fs'; import { homedir } from 'os';
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  for(const id of ['168645368919','168645350740','168645350639','168645350776']){
    const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
    const g=(k:string)=>t.match(new RegExp(`<${k}[^>]*>([^<]*)</${k}>`))?.[1]??'-';
    const vars=(t.match(/<Variation>/g)||[]).length;
    const qty=[...t.matchAll(/<Variation>[\s\S]*?<Quantity>(\d+)<\/Quantity>/g)].reduce((a,m)=>a+Number(m[1]),0);
    console.log(`${id}  ${g('ListingStatus').padEnd(7)} $${g('CurrentPrice').padEnd(7)} ${vars?`${vars} variations, ${qty} cards`:`qty ${g('Quantity')}`}  cat ${g('CategoryID')}`);
    console.log(`   ${g('Title')}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
