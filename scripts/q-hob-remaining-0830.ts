/** What is actually left on the MTG Hobbit you-pick, per variation. */
import { readFileSync } from 'fs'; import { homedir } from 'os';
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>168636653046</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics></GetItemRequest>`;
  const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
  console.log('status', t.match(/<ListingStatus>([^<]*)</)?.[1], ' title:', (t.match(/<Title>([^<]*)</)?.[1]||'').slice(0,64));
  const vars=[...t.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map(m=>m[1]);
  let left=0, sold=0, leftVal=0;
  const rows:any[]=[];
  for(const v of vars){
    const label=v.match(/<Value>([^<]*)<\/Value>/)?.[1]??'?';
    const price=Number(v.match(/<StartPrice[^>]*>([\d.]+)</)?.[1]??0);
    const qty=Number(v.match(/<Quantity>(\d+)</)?.[1]??0);
    const qs=Number(v.match(/<QuantitySold>(\d+)</)?.[1]??0);
    const rem=qty-qs;
    left+=rem; sold+=qs; leftVal+=rem*price;
    rows.push({label,price,rem,qs});
  }
  console.log(`\n${vars.length} variations | ${sold} sold | ${left} remaining | $${leftVal.toFixed(2)} of remaining ask\n`);
  for(const r of rows.sort((a,b)=>b.price-a.price))
    console.log(`  ${r.rem?'LEFT':'SOLD'}  $${r.price.toFixed(2).padStart(6)}  ${r.label}`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
