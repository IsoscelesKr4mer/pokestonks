/**
 * eBay suggested new prices on 4 items and Michael accepted. Find which.
 * The vault stores what WE set; eBay now holds what it actually sells for, so
 * any gap between them is a price eBay moved.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const sql=postgres(process.env.DATABASE_URL_DIRECT!,{prepare:false});
  const rows:any=await sql`SELECT ebay_item_id, MIN(asking_price_cents) lo, MAX(asking_price_cents) hi,
      COUNT(*)::int n, string_agg(DISTINCT player, ', ') players
    FROM baseball_cards WHERE ebay_item_id IS NOT NULL AND status='listed' AND for_sale
    GROUP BY ebay_item_id`;
  await sql.end();
  const db=new Map(rows.map((r:any)=>[r.ebay_item_id,r]));

  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(f(cfg,'EBAY_USER_REFRESH_TOKEN'))+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json()).access_token;
  const trade=async(call:string,body:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-CALL-NAME':call,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body})).text();

  const list=await trade('GetMyeBaySelling',`<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage></Pagination></ActiveList></GetMyeBaySellingRequest>`);
  const ids=[...list.matchAll(/<ItemID>(\d+)<\/ItemID>/g)].map(m=>m[1]);
  console.log(`${ids.length} active listings, ${db.size} carry vault cards\n`);
  const drift:string[]=[];
  for(const id of ids){
    const t=await trade('GetItem',`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const live=Number(t.match(/<CurrentPrice[^>]*>([\d.]+)</)?.[1]??0);
    const title=(t.match(/<Title>([^<]*)</)?.[1]??'').slice(0,50);
    const vars=[...t.matchAll(/<Variation>/g)].length;
    const d:any=db.get(id);
    if(!d) continue;
    if(vars){ console.log(`  (skip ${id}, ${vars} variations, per-card prices)`); continue; }
    const want=d.lo/100;
    if(Math.abs(live-want)>0.005){
      drift.push(id);
      const dir = live<want ? 'CUT' : 'RAISED';
      console.log(`  ${dir}  ${id}  vault $${want.toFixed(2)} -> live $${live.toFixed(2)}  (${(live-want>=0?'+':'')}${(live-want).toFixed(2)})  ${d.players} | ${title}`);
    }
  }
  console.log(`\n${drift.length} listing(s) where eBay's price differs from the vault: ${drift.join(', ')||'none'}`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
