import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
const unesc=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&');
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  for(const id of ['168626075618','168600204811','168576910402']){
    const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
    const title=t.match(/<Title>([^<]*)</)?.[1]??'-';
    let d=unesc(t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'');
    if(/&lt;|&gt;/.test(d)) d=unesc(d);           // this one is double-escaped
    console.log(`\n=== ${id}  ${title.slice(0,72)}`);
    console.log(d.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
