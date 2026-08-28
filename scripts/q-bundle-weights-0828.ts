import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const xml=`<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList></GetMyeBaySellingRequest>`;
  const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetMyeBaySelling','Content-Type':'text/xml'},body:xml})).text();
  const items=[...t.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map(m=>m[1]);
  for(const it of items){
    const title=it.match(/<Title>([^<]*)</)?.[1]??'';
    if(!/bundle/i.test(title)) continue;
    const id=it.match(/<ItemID>(\d+)</)?.[1];
    console.log(`${id}  ${title.slice(0,70)}`);
  }
  console.log(`(${items.length} active listings scanned)`);
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
