/**
 * Repoint the vault rows the split left behind.
 *
 * split-chrome-pyp-0901.ts moved cards between listings and repointed the vault
 * by ebay_sku, which only worked for rows written by the recent PYP builders.
 * Older rows carry a BBC-nn sku or none at all, so 64 base cards were still
 * pointing at the listing they had just been removed from. That is worse than
 * a cosmetic error: a sale on the new listing would not have matched a row.
 *
 * SKU is not a stable key across this vault. The dropdown label is: it is built
 * from card number and player, which is what identifies the card.
 *
 *   npx tsx scripts/fix-split-drift-0901.ts [--apply]
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const TARGETS = { '168654621768': 'Base', '168654621848': 'Logofractor' } as const;
const unesc=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;

  let moved=0, unmatched:string[]=[];
  for (const [item,label] of Object.entries(TARGETS)) {
    const t=await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
      headers:{'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-CALL-NAME':'GetItem','Content-Type':'text/xml'},
      body:`<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`})).text();
    const labels=[...t.matchAll(/<Name>Card<\/Name><Value>([^<]*)</g)].map(m=>unesc(m[1]));
    // "{number} - {player}" identifies the card; the parallel suffix varies
    const keys=new Set(labels.map(l=>l.split(' - ').slice(0,2).join(' - ')));
    console.log(`${item} ${label}: ${labels.length} variations, ${keys.size} distinct number+player keys`);

    // "Baseball Seams Refractor (red)" also starts with "base", so a bare
    // prefix match nearly moved four refractors into the Base listing.
    const where = label === 'Base'
      ? sql`parallel ILIKE 'base%' AND parallel NOT ILIKE '%fractor%'`
      : sql`parallel ILIKE '%logofractor%'`;
    const rows:any = await sql`
      SELECT id, card_number, player, parallel FROM baseball_cards
      WHERE ebay_item_id='168622320644' AND coalesce(sold_price_cents,0)=0 AND (${where})`;
    for (const r of rows) {
      const key=`${r.card_number} - ${r.player}`;
      if (!keys.has(key)) { unmatched.push(`id${r.id} ${key} (${r.parallel})`); continue; }
      if (APPLY) await sql`UPDATE baseball_cards SET ebay_item_id=${item} WHERE id=${r.id}`;
      moved++;
    }
    console.log(`  ${rows.length} vault rows to move, ${rows.length-unmatched.length} matched`);
  }
  console.log(`\n${moved} rows ${APPLY?'repointed':'would move'}`);
  if (unmatched.length) { console.log('UNMATCHED (left alone, check by hand):'); unmatched.forEach(u=>console.log('  '+u)); }
  if (!APPLY) console.log('\ndry run');
  await sql.end();
})();
