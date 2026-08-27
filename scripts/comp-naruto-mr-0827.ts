/** What a raw NREA02 MR / UR / SSR actually asks, by character. Active asks, ungraded only. */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
async function tok(){ const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  if(!j.access_token) throw new Error(JSON.stringify(j).slice(0,200)); return j.access_token as string;}
// graded comps are a different market; lots and sealed are not singles
const BAD=/psa|bgs|cgc|tag \d|gem mint|pristine|graded|lot|bulk|\bbox\b|\bpack\b|sealed|break|choose|you pick|complete set/i;
(async()=>{
  const t=await tok();
  for(const q of ['Naruto Kayou NREA02 MR','Naruto Kayou Earth Scroll 2 MR tarot','Naruto Kayou NREA02 UR','Naruto Kayou NREA02 SSR']){
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const b:any=await(await fetch(u,{headers:{Authorization:`Bearer ${t}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    const rel=((b.itemSummaries||[]) as any[]).filter(i=>!BAD.test(i.title||''))
      .map(i=>({p:Number(i.price?.value||0),t:i.title||''})).filter(x=>x.p>0.5&&x.p<1500).sort((a,b)=>a.p-b.p);
    if(!rel.length){console.log(`\n=== ${q} === none`);continue;}
    console.log(`\n=== ${q} === ${rel.length} raw singles, median $${rel[Math.floor(rel.length/2)].p.toFixed(2)}`);
    for(const x of rel.slice(-10).reverse()) console.log(`  $${x.p.toFixed(2).padStart(8)}  ${x.t.slice(0,84)}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
