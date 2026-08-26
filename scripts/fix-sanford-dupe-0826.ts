/**
 * Wyatt Sanford BCP-66 Green Mojo was listed twice for ONE physical card.
 *
 *   npx tsx scripts/fix-sanford-dupe-0826.ts            # inspect
 *   npx tsx scripts/fix-sanford-dupe-0826.ts --apply    # end the listing, fix the row
 *
 * Row #171's own notes already said it: "DUPLICATE ROW of card #4, same physical
 * card: both fronts read 227/399 ... removed from sale so the same serial cannot
 * be listed twice." That was done 2026-08-17. It came back: #171 is for_sale=true
 * / status=listed with a live eBay listing, while #4 SOLD on 2026-08-22 and
 * shipped. So the card is gone and a listing for it is still up.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ITEM = '168622269907';
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
async function tok(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j=await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  return j.access_token as string;
}
async function trading(t:string, call:string, body:string){
  return (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':call,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':t,'Content-Type':'text/xml'},body})).text();
}
(async()=>{
  const t = await tok();
  const g = await trading(t,'GetItem',`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  const pick=(x:string)=>g.match(new RegExp(`<${x}[^>]*>([^<]*)<`))?.[1] ?? '?';
  console.log(`listing ${ITEM}: ${pick('ListingStatus')} $${pick('CurrentPrice')} qty ${pick('Quantity')} sold ${pick('QuantitySold')}`);
  console.log(`  created ${pick('StartTime')}  <-- the duplicate note was written 2026-08-17`);
  if(Number(pick('QuantitySold'))>0){ console.error('  IT HAS SOLD. Do not end; handle the order first.'); process.exit(1); }

  console.log('\nrows with status=sold but still for_sale=true (same failure mode):');
  const anom:any = await sql`SELECT id, player, set_name, parallel, ebay_item_id FROM baseball_cards WHERE status='sold' AND for_sale=true ORDER BY id`;
  anom.forEach((x:any)=>console.log(`  #${x.id} ${x.player} ${x.parallel ?? ''} item=${x.ebay_item_id ?? '—'}`));

  if(!APPLY){ console.log('\ndry run'); await sql.end(); return; }

  const e = await trading(t,'EndFixedPriceItem',`<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><ItemID>${ITEM}</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>`);
  console.log(`\nend ${ITEM}: ${e.match(/<Ack>(\w+)<\/Ack>/)?.[1]}`);
  for(const m of e.matchAll(/<LongMessage>([^<]*)<\/LongMessage>/g)) console.log('   ', m[1].slice(0,140));

  const [row]:any = await sql`SELECT notes FROM baseball_cards WHERE id=171`;
  const note = `${row.notes} RE-LISTED IN ERROR and ended 2026-08-26: the duplicate flag set on 2026-08-17 did not hold, #171 came back as for_sale=true and was listed again as ${ITEM}. Meanwhile the physical card sold under #4 on 2026-08-22 and shipped, so this listing was live for a card he no longer owns. Ended, for_sale=false, ebay ids cleared. Row kept for its photos only.`;
  await sql`UPDATE baseball_cards SET status='photographed', for_sale=false, ebay_item_id=NULL, ebay_offer_id=NULL, ebay_sku=NULL, asking_price_cents=NULL, notes=${note}, updated_at=now() WHERE id=171`;
  const [chk]:any = await sql`SELECT id,status,for_sale,ebay_item_id,asking_price_cents FROM baseball_cards WHERE id=171`;
  console.log(`#171 now: status=${chk.status} for_sale=${chk.for_sale} item=${chk.ebay_item_id ?? 'null'} ask=${chk.asking_price_cents ?? 'null'}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
