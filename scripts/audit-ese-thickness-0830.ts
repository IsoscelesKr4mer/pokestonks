/**
 * Which live listings sit on the eBay Standard Envelope policy but could ship
 * a package thicker than eSE's 0.25in cap?
 *
 * The Hobbit bulk lot was one. The question is whether it was the only one --
 * a you-pick with free combined shipping can quietly build the same package
 * out of a big multi-card order.
 *
 * ~0.012in per loose card. A penny sleeve adds little; a toploader is ~0.06in.
 */
import { readFileSync } from 'fs'; import { homedir } from 'os';
const ESE='272052757012', CAP=0.25, PER_CARD=0.012;
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const trading=async(call:string,body:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':call,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body})).text();
  const list=await trading('GetMyeBaySelling',`<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList></GetMyeBaySellingRequest>`);
  const ids=[...list.matchAll(/<ItemID>(\d+)<\/ItemID>/g)].map(m=>m[1]);
  console.log(`${ids.length} active listings\n`);
  const risky:string[]=[];
  for(const id of ids){
    const t=await trading('GetItem',`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const prof=t.match(/<ShippingProfileID>(\d+)</)?.[1];
    if(prof!==ESE) continue;
    const title=(t.match(/<Title>([^<]*)</)?.[1]??'').slice(0,58);
    const vars=[...t.matchAll(/<Variation>[\s\S]*?<Quantity>(\d+)<\/Quantity>[\s\S]*?<\/Variation>/g)];
    const qty=Number(t.match(/<Quantity>(\d+)</)?.[1]??1);
    // worst case a single buyer could combine into one envelope
    const maxCards = vars.length ? vars.reduce((a,m)=>a+Number(m[1]),0) : qty;
    const thick = maxCards*PER_CARD;
    const flag = thick>CAP;
    if(flag) risky.push(id);
    console.log(`${flag?'  OVER':'    ok'}  ${id}  max ${String(maxCards).padStart(3)} cards = ${thick.toFixed(2)}in  ${title}`);
  }
  console.log(`\n${risky.length} listing(s) can build a package over the ${CAP}in eSE cap: ${risky.join(', ')||'none'}`);
  console.log('A you-pick with free combined shipping only hits this on a large order, so it is a risk, not a certainty.');
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
