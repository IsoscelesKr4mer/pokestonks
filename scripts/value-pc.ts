/**
 * Value the personal collection at comp MEDIAN, not at an asking price.
 *
 *   npx tsx scripts/value-pc.ts
 *
 * The listing pricer asks at the 35th percentile because it wants a sale.
 * A valuation wants the middle of the market, so this reads the median out of
 * each card's stored comp_note and pulls fresh comps for anything unpriced.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const pct=(a:number[],p:number)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length*p)]??s[s.length-1];};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function main(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;

  const cards = await sql`
    SELECT id, player, set_name, year, card_number, parallel, asking_price_cents AS ask, comp_note
    FROM baseball_cards WHERE for_sale=false AND status <> 'sold' ORDER BY id`;
  console.log(`PC cards on file: ${cards.length}\n`);

  const rows:any[]=[];
  for (const c of cards as any[]) {
    let med = Number(c.comp_note?.match(/med \$([\d.]+)/)?.[1] ?? 0) * 100;
    let n = Number(c.comp_note?.match(/^(\d+) active/)?.[1] ?? 0);
    if (!med) {
      const set=(c.set_name||'').replace(/\(.*?\)/g,'').trim();
      const par=(c.parallel||'').replace(/\s*\(.*?\)\s*/g,' ').replace(/\+ IP Auto/i,'autograph').trim();
      const q=[c.year||'', set, c.player, par, c.card_number?`#${c.card_number}`:''].filter(Boolean).join(' ');
      try {
        const d=await (await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=261328&limit=40`,{headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
        const last=c.player.split(' ').pop()!.toLowerCase();
        const items=(d.itemSummaries||[]).filter((i:any)=>i.title.toLowerCase().includes(last));
        const p=items.map((i:any)=>Number(i.price?.value)).filter((v:number)=>v>0&&v<20000);
        if (p.length) { med=Math.round(pct(p,0.5)*100); n=p.length; }
      } catch {}
      await sleep(120);
    }
    rows.push({...c, med, n});
  }
  rows.sort((a,b)=>b.med-a.med);
  let total=0, unknown=0;
  console.log('card                                            comps   median');
  for (const r of rows) {
    total+=r.med; if(!r.med) unknown++;
    const label=`${r.player} ${r.card_number??''} ${r.parallel}`.slice(0,46);
    console.log(`  ${label.padEnd(46)} ${String(r.n||'-').padStart(4)}   ${r.med?('$'+(r.med/100).toFixed(2)).padStart(8):'  no comp'}`);
  }
  console.log(`\nPC value at comp median: $${(total/100).toFixed(2)} across ${rows.length} cards`);
  console.log(`no comp found for ${unknown}, so the real number is higher`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
