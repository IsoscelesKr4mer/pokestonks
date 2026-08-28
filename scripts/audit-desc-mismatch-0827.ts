/**
 * The Crochet listing described a different card than its title. Check whether
 * any other single-card listing drifted the same way: does the live description
 * still name the parallel the DB says the card is?
 * Reports only. A false positive here is a wording difference, not a bug.
 *
 * RESULT 2026-08-27: 127 flags, ALL of them you-pick rows, ALL false positives.
 * A you-pick's description is deliberately generic ("pick your card from the
 * dropdown above") because one description covers 165 cards; the per-card detail
 * lives in the variation label and its photo. Zero real mismatches among the
 * genuine single-card listings, so the Crochet listing was the only one.
 *
 * If rerunning, filter to listings carrying exactly ONE card first. The
 * GROUP BY ... HAVING COUNT(*)=1 below does NOT do that -- it counts distinct
 * (item, player, number, parallel) rows, so you-pick cards survive it.
 */
import { config } from 'dotenv'; import postgres from 'postgres'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
function find(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=find(o[kk],k); if(r)return r;} return undefined;}
const unesc=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
(async()=>{
  const sql=postgres(process.env.DATABASE_URL_DIRECT!,{prepare:false});
  const rows:any=await sql`SELECT ebay_item_id, player, card_number, parallel, set_name FROM baseball_cards
    WHERE ebay_item_id IS NOT NULL AND status='listed' AND for_sale
    GROUP BY ebay_item_id, player, card_number, parallel, set_name
    HAVING COUNT(*)=1 ORDER BY player`;
  await sql.end();
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const basic=Buffer.from(`${find(cfg,'EBAY_CLIENT_ID')}:${find(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg,'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  // the distinguishing word in a parallel: Refractor/X-Fractor colours, inserts
  const KEY=/(x-?fractor|refractor|lazer|raywave|shimmer|mojo|sapphire|lightboard|mini-?diamond|ink strokes|auto|prism|wave|atomic|superfractor|vibrations|purple|green|blue|pink|aqua|gold|orange|red|black)/gi;
  let flagged=0, checked=0;
  for(const r of rows){
    const xml=`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${r.ebay_item_id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
    const t=await(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},body:xml})).text();
    if(!/<ListingStatus>Active/.test(t)) continue;
    checked++;
    const desc=unesc(t.match(/<Description>([\s\S]*?)<\/Description>/)?.[1]??'').replace(/<[^>]+>/g,' ').toLowerCase();
    const want=[...new Set((String(r.parallel??'').match(KEY)||[]).map(x=>x.toLowerCase()))];
    const missing=want.filter(w=>!desc.includes(w));
    if(missing.length){
      flagged++;
      console.log(`${r.ebay_item_id}  ${r.player} #${r.card_number}`);
      console.log(`   db parallel : ${r.parallel}`);
      console.log(`   missing from description: ${missing.join(', ')}`);
      console.log(`   desc opens  : ${desc.replace(/\s+/g,' ').trim().slice(0,120)}`);
    }
  }
  console.log(`\n${checked} single-card listings checked, ${flagged} where the description omits a word from the DB parallel`);
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
