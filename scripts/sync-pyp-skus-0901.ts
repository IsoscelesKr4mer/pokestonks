/**
 * Realign baseball_cards.ebay_sku with what is actually on each listing.
 *
 * Renaming a variation to add RC required deleting it and adding a new one with
 * a fresh SKU, so 46 vault rows were left pointing at SKUs that no longer
 * exist. The quantity audit matches on label and so stayed green, which is
 * exactly why this needed its own pass.
 *
 *   npx tsx scripts/sync-pyp-skus-0901.ts [--apply]
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GROUPS = ['168622320644','168654621768','168654621848','168617438056','168617438146','168617438107'];
const unesc=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  let fixed=0, missing=0;
  for (const item of GROUPS) {
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
      headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${j.access_token}</eBayAuthToken></RequesterCredentials><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
    // key on number + player; the parallel suffix is what RC changes
    const skuFor=new Map<string,string>();
    for (const m of t.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)) {
      const label=unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1]??'');
      const sku=m[1].match(/<SKU>([^<]*)</)?.[1]??'';
      const suffix=label.replace(/\s+RC$/,'').split(' - ').slice(2).join(' - ');
      skuFor.set(`${label.split(' - ').slice(0,2).join(' - ')}|${suffix}`, sku);
    }
    const rows:any = await sql`
      SELECT id, card_number, player, parallel, ebay_sku FROM baseball_cards
      WHERE ebay_item_id=${item} AND coalesce(sold_price_cents,0)=0`;
    for (const r of rows) {
      // find any live variation for this number+player
      const prefix=`${r.card_number} - ${r.player}|`;
      const hit=[...skuFor.entries()].find(([k])=>k.startsWith(prefix));
      if (!hit) { missing++; continue; }
      if (r.ebay_sku===hit[1]) continue;
      if (APPLY) await sql`UPDATE baseball_cards SET ebay_sku=${hit[1]} WHERE id=${r.id}`;
      fixed++;
    }
  }
  console.log(`${fixed} vault rows ${APPLY?'realigned':'need realigning'}, ${missing} with no matching live variation`);
  if(!APPLY) console.log('dry run');
  await sql.end();
})();
