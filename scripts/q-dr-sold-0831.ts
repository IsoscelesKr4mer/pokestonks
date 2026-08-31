/** What Destined Rivals thing just sold, and for how much? */
import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const call=async(n:string,x:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':n,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:x})).text();
  const t=await call('GetMyeBaySelling',`<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><SoldList><Include>true</Include><DurationInDays>7</DurationInDays><Pagination><EntriesPerPage>100</EntriesPerPage></Pagination></SoldList></GetMyeBaySellingRequest>`);
  const items=[...t.matchAll(/<OrderTransaction>([\s\S]*?)<\/OrderTransaction>/g)].map(m=>m[1]);
  console.log(`${items.length} sold in the last 7 days\n`);
  for(const it of items){
    const title=(it.match(/<Title>([^<]*)</)?.[1]??'').slice(0,58);
    const id=it.match(/<ItemID>(\d+)</)?.[1];
    const price=it.match(/<TransactionPrice[^>]*>([\d.]+)</)?.[1];
    const when=(it.match(/<(?:CreatedDate|PaidTime)>([^<]*)</)?.[1]??'').slice(0,16).replace('T',' ');
    const type=it.match(/<ListingType>([^<]*)</)?.[1]??'';
    console.log(`  ${when}  $${String(price).padStart(7)}  ${type.padEnd(14)} ${id}  ${title}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
