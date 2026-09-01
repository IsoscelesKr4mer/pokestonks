/**
 * Zero the seven variations that a revise loop inflated back into stock.
 *
 *   npx tsx scripts/fix-pyp-qty-inflation-0901.ts [--apply]
 *
 * Michael caught it: "says i have (4) cal raleigh x-fractors? that seems wrong
 * and you've burned me relisting sold cards before." He was right, and it was
 * mine.
 *
 * THE BUG. GetItem returns Variation.Quantity as the TOTAL ever listed, but
 * ReviseFixedPriceItem reads the Quantity you send as the AVAILABLE quantity
 * and sets total = sent + QuantitySold. Reading a variation and writing it
 * straight back therefore adds the sold count on EVERY revise. Four revises ran
 * against the Chrome group tonight (two merges, the split shrink, the sort), so
 * a card with one sale went 1 -> 5, and McGonigle with two sales went 2 -> 10.
 * Only variations with sales could drift; the other 225 reconciled exactly.
 *
 * All seven belong to cards that are gone, so available goes to 0. The vault is
 * the authority for that number, not the listing.
 *
 * THE RULE FOR EVERY FUTURE REVISE: send Quantity = total - QuantitySold.
 * Never echo GetItem's Quantity back.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GROUPS = ['168622320644','168654621768','168654621848','168617438056','168617438146','168617438107'];
const esc=(s:string)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const unesc=(s:string)=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const tok=j.access_token;
  const call=async(n:string,b:string)=>(await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':n,'X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},body:b})).text();

  for (const item of GROUPS) {
    const t=await call('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const vars=[...t.matchAll(/<Variation>([\s\S]*?)<\/Variation>/g)].map(m=>({
      sku: m[1].match(/<SKU>([^<]*)</)?.[1]??'',
      label: unesc(m[1].match(/<Name>Card<\/Name><Value>([^<]*)</)?.[1]??''),
      total: Number(m[1].match(/<Quantity>([^<]*)</)?.[1]??0),
      sold: Number(m[1].match(/<QuantitySold>([^<]*)</)?.[1]??0),
    }));
    const rows:any = await sql`
      SELECT card_number||' - '||player k, count(*) n FROM baseball_cards
      WHERE ebay_item_id=${item} AND coalesce(sold_price_cents,0)=0 GROUP BY 1`;
    const vault=new Map<string,number>(rows.map((r:any)=>[r.k,Number(r.n)]));

    const bad=vars.filter(v=>{
      const avail=v.total-v.sold;
      const k=v.label.split(' - ').slice(0,2).join(' - ');
      return v.sold>0 && avail!==(vault.get(k)??0);
    });
    if (!bad.length) continue;
    console.log(`\n${item}: ${bad.length} inflated`);
    for (const v of bad) {
      const k=v.label.split(' - ').slice(0,2).join(' - ');
      console.log(`  ${v.label}: total ${v.total}, sold ${v.sold}, buyable ${v.total-v.sold} -> ${vault.get(k)??0}`);
    }
    if (!APPLY) continue;
    // Quantity here is AVAILABLE. Sending 0 leaves total == sold, which is what
    // a fully sold-out variation should look like.
    const body=`<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">`+
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${item}</ItemID><Variations>`+
      bad.map(v=>{
        const k=v.label.split(' - ').slice(0,2).join(' - ');
        return `<Variation><SKU>${esc(v.sku)}</SKU><Quantity>${vault.get(k)??0}</Quantity>`+
        `<VariationSpecifics><NameValueList><Name>Card</Name><Value>${esc(v.label)}</Value></NameValueList></VariationSpecifics></Variation>`;
      }).join('')+
      `</Variations></Item></ReviseFixedPriceItemRequest>`;
    const r=await call('ReviseFixedPriceItem',body);
    console.log(`  Revise: ${r.match(/<Ack>([^<]*)</)?.[1]}`);
    for (const m of r.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    - ${m[1].slice(0,200)}`);
  }
  if (!APPLY) console.log('\ndry run');
  await sql.end();
})();
