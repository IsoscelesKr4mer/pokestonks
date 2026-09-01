/**
 * Reconcile every you-pick variation's quantity against the vault.
 *
 * Michael: "for the love of god make sure you didnt relist something I've
 * alrady sold ... says i have (4) cal raleigh x-fractors ... you've burned me
 * relisting sold cards before."
 *
 * eBay's Variation.Quantity is the TOTAL ever listed, not what is left;
 * available = Quantity - QuantitySold. The vault's truth is the count of unsold
 * rows pointing at that listing with that card number and parallel. Those two
 * numbers must agree, and anywhere they do not is either a card that can be
 * oversold or one that is invisible to buyers.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GROUPS = ['168622320644','168654621768','168654621848','168617438056','168617438146','168617438107'];
const unesc=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;
  let over=0, under=0, ok=0;
  for (const item of GROUPS) {
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
      headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
    const vars=[...t.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map(m=>({
      label: unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1]??''),
      qty: Number(m[1].match(/<Quantity>([^<]*)</)?.[1]??0),
      sold: Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1]??0),
    }));
    // vault truth: unsold rows on this listing, keyed by number + player
    const rows:any = await sql`
      SELECT card_number||' - '||player k, count(*) n FROM baseball_cards
      WHERE ebay_item_id=${item} AND coalesce(sold_price_cents,0)=0 GROUP BY 1`;
    const have=new Map<string,number>(rows.map((r:any)=>[r.k,Number(r.n)]));
    const want=new Map<string,number>();
    for (const v of vars) {
      const k=v.label.split(' - ').slice(0,2).join(' - ');
      want.set(k,(want.get(k)??0)+(v.qty-v.sold));
    }
    for (const [k,avail] of want) {
      const vault=have.get(k)??0;
      if (avail===vault) { ok++; continue; }
      if (avail>vault) { over++; console.log(`  OVER  ${item} ${k}: buyable ${avail}, vault holds ${vault}`); }
      else { under++; console.log(`  under ${item} ${k}: buyable ${avail}, vault holds ${vault}`); }
    }
  }
  console.log(`\n${ok} match, ${over} OVERSTATED (can be oversold), ${under} understated (unsellable stock)`);
  await sql.end();
})();
