/**
 * Find variations that are the same physical card listed twice.
 *
 * Michael: "you have two of the same sal stewart rookie cards listed separately
 * at wildly different prices on the rookie pyc."
 *
 * Cause: the labels already live used "Base RC" and "X-Fractor RC", and the 114
 * cards I added tonight used "Base" and "X-Fractor" because the ingest never
 * carried rookie status and I would not invent it. Same card, two dropdown
 * rows, two prices, and the older price is weeks stale.
 *
 * The key is card number + player + parallel with any RC suffix stripped.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const GROUPS = ['168622320644','168654621768','168654621848','168617438056','168617438146','168617438107'];
const unesc=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  let total=0;
  for (const item of GROUPS) {
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
      headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${j.access_token}</eBayAuthToken></RequesterCredentials><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
    const vars=[...t.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map(m=>({
      label: unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1]??''),
      price: Number(m[1].match(/<StartPrice[^>]*>([^<]*)</)?.[1]??0),
      total: Number(m[1].match(/<Quantity>([^<]*)</)?.[1]??0),
      sold: Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1]??0),
      sku: m[1].match(/<SKU>([^<]*)</)?.[1]??'',
    }));
    const by=new Map<string,typeof vars>();
    for (const v of vars) {
      // strip a trailing " RC" so "6 - Sal Stewart - Base RC" and "... - Base" collide
      const k=v.label.replace(/\s+RC$/,'');
      if(!by.has(k)) by.set(k,[] as any);
      by.get(k)!.push(v);
    }
    const dupes=[...by.entries()].filter(([,g])=>g.length>1);
    if(!dupes.length) continue;
    console.log(`\n${item}: ${dupes.length} duplicated cards`);
    for (const [k,g] of dupes) {
      total++;
      const spread=Math.max(...g.map(v=>v.price))/Math.min(...g.map(v=>v.price));
      console.log(`  ${k}${spread>=3?'   <-- '+spread.toFixed(1)+'x price gap':''}`);
      for (const v of g) console.log(`      $${v.price.toFixed(2).padStart(7)}  avail ${v.total-v.sold}  sold ${v.sold}  "${v.label}"  ${v.sku}`);
    }
  }
  console.log(`\n${total} cards appear twice in a dropdown`);
})();
