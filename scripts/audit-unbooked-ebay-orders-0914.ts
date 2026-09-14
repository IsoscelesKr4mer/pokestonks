/**
 * Any eBay order that never reached the vault?
 *
 *   npx tsx scripts/audit-unbooked-ebay-orders-0914.ts
 *
 * Read only. Order 14-15105-96096 sold on 09-02 and was never booked, which
 * is why the vault claimed 40 Destined Rivals sleeved packs while Michael
 * counted 36. One slipping means others might have, so this walks every eBay
 * order and checks it against ebay_synced_orders and the sales notes.
 *
 * Scoped to SEALED vault product only. Most eBay orders are single baseball
 * cards, which live in the baseball_cards table and never touch purchases or
 * sales, so counting those as unbooked is noise. An order counts here only if
 * one of its eBay item ids is mapped in ebay_listing_mappings, which is how a
 * listing is tied to a catalog item, and is not a known baseball_cards item.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=fk(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
 const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
 const j=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json();
 const orders:any[]=[];
 for(let off=0; off<1000; off+=200){
   const r=await fetch('https://api.ebay.com/sell/fulfillment/v1/order?limit=200&offset='+off+
     '&filter='+encodeURIComponent('creationdate:[2026-06-01T00:00:00.000Z..]'),
     {headers:{Authorization:'Bearer '+j.access_token,Accept:'application/json'}});
   const o:any=await r.json();
   const batch=o.orders??[]; orders.push(...batch);
   if(batch.length<200) break;
 }
 console.log('eBay orders since 2026-06-01: '+orders.length);
 const synced:any = await sql`select ebay_order_id, skipped from ebay_synced_orders`;
 const known = new Map<string,boolean>(synced.map((x:any)=>[x.ebay_order_id, x.skipped]));
 const noteHits:any = await sql`select notes from sales where notes is not null`;
 const allNotes = noteHits.map((x:any)=>x.notes).join(' | ');

 const maps:any = await sql`select ebay_item_id from ebay_listing_mappings`;
 const vaultItems = new Set<string>(maps.map((x:any)=>String(x.ebay_item_id)));
 const cards:any = await sql`select distinct ebay_item_id from baseball_cards where ebay_item_id is not null`;
 const cardItems = new Set<string>(cards.map((x:any)=>String(x.ebay_item_id)));

 const missing:any[]=[]; let cardOnly=0, unmapped=0;
 for(const o of orders){
   if(known.has(o.orderId)) continue;
   if(allNotes.includes(o.orderId)) continue;   // booked by hand with the id in the note
   const ids=(o.lineItems??[]).map((li:any)=>String(li.legacyItemId));
   const touchesVault = ids.some((i:string)=>vaultItems.has(i));
   if(!touchesVault){
     if(ids.every((i:string)=>cardItems.has(i))) cardOnly++; else unmapped++;
     continue;
   }
   missing.push(o);
 }
 console.log('skipped, baseball cards tracked elsewhere: '+cardOnly);
 console.log('skipped, item never mapped to a catalog item: '+unmapped);
 console.log('not in ebay_synced_orders and not named in any sale note: '+missing.length+'\n');
 missing.sort((a,b)=>String(a.creationDate).localeCompare(String(b.creationDate)));
 for(const o of missing){
   const items=(o.lineItems??[]).map((li:any)=>'qty '+li.quantity+' x '+(li.title??'').slice(0,54)+' [item '+li.legacyItemId+']').join('; ');
   console.log(String(o.creationDate).slice(0,10)+'  '+o.orderId+'  $'+o.pricingSummary?.total?.value+
     '  '+o.orderFulfillmentStatus+'  fee $'+(o.totalMarketplaceFee?.value??'?'));
   console.log('    '+items);
 }
 await sql.end();
})();
