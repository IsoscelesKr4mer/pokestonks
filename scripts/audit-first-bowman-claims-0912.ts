/**
 * Any live listing that claims 1st Bowman for a card that is not one.
 *
 *   npx tsx scripts/audit-first-bowman-claims-0912.ts
 *
 * Read only. The Arquette description still said "1st Bowman card." weeks
 * after the title was corrected, on a $145 card. Same miss could be on the
 * other six prospects that lack the logo.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=fk(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
 const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
 const j=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
 const tok=j.access_token;
 const rows:any = await sql`select id, card_number, player, ebay_item_id, notes, asking_price_cents ask
   from baseball_cards where notes ilike '%NOT a 1st Bowman%' and ebay_item_id is not null order by id`;
 console.log('cards recorded as NOT 1st Bowman but still listed: ' + rows.length + '\n');
 for (const r of rows) {
   const res=await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:'<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>'+r.ebay_item_id+'</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>'});
   const x=await res.text();
   const title=x.match(/<Title>([^<]*)</)?.[1]??'';
   const desc=x.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'';
   const status=x.match(/<ListingStatus>(\w+)</)?.[1];
   const inTitle=/1st\s*bowman/i.test(title), inDesc=/1st\s*bowman/i.test(desc);
   const flag=(inTitle||inDesc)?'  <<< FALSE CLAIM':'  ok';
   console.log(r.card_number+' '+r.player+'  $'+(r.ask/100).toFixed(2)+'  '+status+flag);
   if(inTitle) console.log('    title: '+title);
   if(inDesc) console.log('    description says 1st Bowman');
 }
 await sql.end();
})();
