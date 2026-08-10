import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');

function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
async function token(){
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const id=findKey(cfg,'EBAY_CLIENT_ID'), sec=findKey(cfg,'EBAY_CLIENT_SECRET');
  const r=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{'Authorization':`Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')});
  const j=await r.json(); if(!j.access_token) throw new Error('token fail '+JSON.stringify(j)); return j.access_token;
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function serial(p:string){ const m=(p||'').match(/\/(\d{1,4})/); return m?`/${m[1]}`:null; }
function category(parallel:string){
  const p=(parallel||'').toLowerCase();
  if(/mini[\s-]?diamond/.test(p) && !serial(parallel)) return 'minidiamond';
  if(/red\s*white|rwb|red\/white/.test(p)) return 'rwb';
  if(serial(parallel)) return 'numbered';
  if(p.includes('refractor')||p.includes('raywave')) return 'refractor';
  if(p.includes('insert')) return 'insert';
  return 'base';
}
const REF_KW=['superfractor','atomic','laser','mojo','shimmer','padparadscha','sepia','aqua prism','prism','x-fractor','xfractor','seams'];
function refKeyword(parallel:string){ const p=(parallel||'').toLowerCase(); return REF_KW.find(k=>p.includes(k))||null; }
function buildQuery(c:any){
  const parts=[c.year||'', (c.set_name||'').replace(/\(.*?\)/g,'').trim(), c.player];
  if(c.card_number) parts.push('#'+c.card_number);
  const cat=category(c.parallel);
  if(cat==='rwb') parts.push('red white blue refractor');
  else if(cat==='minidiamond') parts.push('mini diamond refractor');
  else if(cat==='refractor') parts.push(refKeyword(c.parallel) ? `${refKeyword(c.parallel)} refractor` : 'refractor');
  const ser=serial(c.parallel); if(ser) parts.push(ser);
  return parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
// Which product a set belongs to, and which product words a comp title MUST /
// MUST NOT contain. Separates the three chrome-family products so a Topps Chrome
// comp is never counted for a Bowman Chrome card, etc.
function productGate(setName:string){
  const s=(setName||'').toLowerCase();
  if(s.includes('finest')) return {require:['finest'], exclude:['bowman']};
  if(s.includes('bowman')) return {require:['bowman'], exclude:['finest']};
  if(s.includes('sterling')) return {require:['sterling'], exclude:[]};
  if(s.includes('chrome')) return {require:['chrome'], exclude:['bowman','finest']}; // Topps Chrome
  if(s.includes('topps')) return {require:['topps'], exclude:['bowman','finest']};
  return {require:[] as string[], exclude:[] as string[]};
}
// Does the comp title carry THIS card's number/code? Insert/prospect codes
// (letters, e.g. BTP-1, BCP-156, FMA-BD, 91CB-22) must appear verbatim.
// Numeric base numbers must appear as a bounded token (optionally #-prefixed),
// never as part of a serial (/150) or another number (149 != 9).
function numberMatches(title:string, num:string){
  if(!num) return true;
  const t=title.toLowerCase(); const n=num.toLowerCase().trim();
  const strip=(s:string)=>s.replace(/[\s-]/g,'');
  if(/[a-z]/.test(n)) return strip(t).includes(strip(n)); // has letters -> insert/prospect code
  const re=new RegExp(`(^|[^0-9a-z/])#?${n}([^0-9]|$)`,'i');
  return re.test(` ${t} `);
}
// Words that unambiguously signal a NON-base parallel (avoids raw colors like
// "blue"/"red" which collide with team names Blue Jays / Red Sox).
const NONBASE_WORDS=['auto','ssp','superfractor','super fractor','x-fractor','xfractor','mini diamond','mojo','shimmer','laser','atomic','prism','sepia','padparadscha','sapphire','printing plate','negative','1/1'];
function matches(title:string, c:any){
  const t=title.toLowerCase();
  const surname=(c.player.split('/')[0].trim().split(' ').pop()||'').toLowerCase();
  if(surname && !t.includes(surname)) return false;
  // product gate: right set family, wrong ones excluded
  const pg=productGate(c.set_name);
  if(pg.require.some(r=>!t.includes(r))) return false;
  if(pg.exclude.some(x=>t.includes(x))) return false;
  // card-number / insert-code gate: THIS exact card, not just this player
  if(!numberMatches(title, c.card_number)) return false;
  // parallel-category gate
  const cat=category(c.parallel); const ser=serial(c.parallel);
  const hasRef=t.includes('refractor')||t.includes('raywave')||t.includes('prism');
  const hasNum=/\/\d/.test(t); const hasAuto=t.includes('auto'); const hasSSP=t.includes('ssp')||t.includes('super');
  if(cat==='minidiamond') return t.includes('mini')&&t.includes('diamond')&&!hasNum&&!hasAuto;
  // base = cheapest common copy: reject only unambiguous parallel signals (NOT plain
  // "refractor", since Chrome/Finest base ARE refractors, and NOT raw colors).
  if(cat==='base') return !hasNum && !hasAuto && !hasSSP && !NONBASE_WORDS.some(w=>t.includes(w));
  if(cat==='refractor'){ const kw=refKeyword(c.parallel); return hasRef && !hasNum && !hasAuto && !hasSSP && (!kw || t.includes(kw.split(' ')[0])); }
  if(cat==='rwb') return (t.includes('red')&&(t.includes('white')||t.includes('blue')))||t.includes('rwb');
  if(cat==='numbered') return ser? t.includes(ser): (hasNum && !hasAuto);
  if(cat==='insert') return true; // product + code gates above already pin it
  return true;
}
function pct(arr:number[],p:number){ const s=[...arr].sort((a,b)=>a-b); return s[Math.min(s.length-1,Math.floor(p*s.length))]; }
async function main(){
  const tok=await token();
  const cards=await sql`SELECT id,player,set_name,year,card_number,parallel,status FROM baseball_cards
    WHERE for_sale=true AND status NOT IN ('listed','sold')
    AND coalesce(notes,'') NOT ILIKE '%AUCTION%' AND coalesce(notes,'') NOT ILIKE '%no auto-price%'
    AND coalesce(notes,'') NOT ILIKE '%in-person auto%'
    AND coalesce(notes,'') NOT ILIKE '%confirm parallel%' AND coalesce(parallel,'') NOT ILIKE '%(CONFIRM)%'
    ORDER BY id`;
  console.log(`pricing ${cards.length} sellable cards... (APPLY=${APPLY})`);
  let priced=0,nocomp=0; const samples:string[]=[];
  for(const c of cards){
    const q=buildQuery(c);
    let items:any[]=[];
    try{
      const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=261328&limit=50`,{headers:{'Authorization':`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
      const j=await r.json(); items=j.itemSummaries||[];
    }catch{}
    await sleep(120);
    const prices=items.filter(it=>matches(it.title||'',c)).map(it=>Number(it.price?.value)).filter(v=>v>0&&v<100000);
    if(prices.length<1){ nocomp++; continue; }
    const med=pct(prices,0.5), low=Math.min(...prices), high=Math.max(...prices);
    // velocity-tuned: 35th percentile, floored at $1.49, rounded to nearest .49/.99
    let ask=Math.max(1.49, pct(prices,0.35));
    ask=Math.round(ask*100)/100;
    // round to a clean .49 or .99
    const whole=Math.floor(ask); const frac=ask-whole; ask = whole + (frac<0.5?0.49:0.99);
    const askCents=Math.round(ask*100);
    const note=`${prices.length} active comps: low $${low.toFixed(2)} / med $${med.toFixed(2)} / high $${high.toFixed(2)} (eBay Browse)`;
    if(APPLY){
      await sql`UPDATE baseball_cards SET asking_price_cents=${askCents}, status='priced', comp_note=${note} WHERE id=${c.id}`;
    }
    priced++;
    if(samples.length<15) samples.push(`  #${c.id} ${c.player} ${c.card_number||''} [${category(c.parallel)}] ${prices.length}comps med $${med.toFixed(2)} -> ask $${ask.toFixed(2)}`);
  }
  console.log(`\npriced: ${priced}, no-comps: ${nocomp}`);
  console.log('samples:\n'+samples.join('\n'));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
