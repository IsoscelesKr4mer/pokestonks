import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
const unesc=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const ITEMS=['168622320644','168622312679','168622311437','168617438056','168617438091','168617438107','168617438176','168617438146','168617438132','168584893860','168601642974','168586940403','168584893847','168555750100','168622269698','168561671909','168602424354','168622269845','168612609415','168561671918','168561651279','168555697322','168612706439','168584893845','168561671901','168612609704','168602424381','168601642098','168561672841','168601643466'];
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  let ok=0,bad=0;
  for(const id of ITEMS){
    const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
    const d=unesc(t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'');
    if(/Card Saver I/.test(d)) ok++; else { bad++; console.log(`MISSING on ${id}`); }
  }
  console.log(`\nlive with "Card Saver I": ${ok}/${ITEMS.length}   missing: ${bad}`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
