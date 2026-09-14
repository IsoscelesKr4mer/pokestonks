/**
 * Does every Bowman Chrome listing show its own card?
 *
 *   npx tsx scripts/audit-bowman-photo-mismatch-0914.ts
 *
 * Read only. The $50 Murakami Red was showing the $7 base #76 because its SKU
 * (BOWCH-76-43) was built off the wrong build index. Any card that came out of
 * that box twice could have the same off-by-index miss, so this checks all of
 * them rather than assuming it was a one-off.
 *
 * For each listed BOWCH- SKU it matches the vault row to its build entry on
 * card number + parallel, then compares the live eBay pictures against the EPS
 * URLs for that entry's own front and back.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const cache: Record<string,string> = JSON.parse(readFileSync('scripts/_bow_eps.json','utf8'));
const build: any[] = JSON.parse(readFileSync('scripts/_bow_final_prices.json','utf8'));
const norm = (u:string) => (u||'').split('?')[0];
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=fk(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
 const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
 const j=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
 const tok=j.access_token;
 const rows:any = await sql`select id, card_number, player, parallel, asking_price_cents ask, ebay_item_id, ebay_sku
   from baseball_cards where ebay_sku like 'BOWCH-%' and ebay_sku not like 'BOWCH-YP-%'
   and ebay_item_id is not null and status='listed' order by id`;
 const seen = new Map<string,string>();
 let bad=0, ok=0, skip=0;
 for (const r of rows) {
   const e = build.find((b:any)=> String(b.card_number)===String(r.card_number)
     && String(b.player).toLowerCase()===String(r.player).toLowerCase()
     && String(b.parallel).toLowerCase().slice(0,14)===String(r.parallel).toLowerCase().slice(0,14));
   if (!e) { skip++; console.log('?  no build match  ' + r.card_number + ' ' + r.player + ' [' + r.parallel + ']'); continue; }
   const want=[norm(cache[String(e.front)]), norm(cache[String(e.back)])];
   let live = seen.get(r.ebay_item_id);
   if (!live) {
     const res=await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:'<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>'+r.ebay_item_id+'</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>'});
     const x=await res.text();
     live=[...x.matchAll(/<PictureURL>([^<]+)</g)].map(m=>norm(m[1])).join('|');
     seen.set(r.ebay_item_id, live);
   }
   const got=live.split('|');
   if (got[0]===want[0] && got[1]===want[1]) { ok++; continue; }
   bad++;
   const whose = build.find((b:any)=> norm(cache[String(b.front)])===got[0]);
   console.log('MISMATCH  ' + r.card_number + ' ' + r.player + ' [' + r.parallel + ']  $' + (r.ask/100).toFixed(2) + '  sku ' + r.ebay_sku);
   console.log('   showing: ' + (whose ? 'IMG_'+whose.front+' = #'+whose.card_number+' '+whose.player+' ['+whose.parallel+']' : got[0]));
   console.log('   should : IMG_' + e.front + ' / IMG_' + e.back);
 }
 console.log('\n' + ok + ' correct, ' + bad + ' mismatched, ' + skip + ' unmatched to the build list');
 await sql.end();
})();
