/**
 * What do Kayou Naruto Earth Scroll Series 2 singles actually fetch, by rarity?
 * Browse API = ACTIVE asks, not solds, so read the median as a ceiling.
 * Query wide (no card numbers) per the pricer rule, then filter on the tier code.
 */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
async function tok(){ const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  if(!j.access_token) throw new Error('token: '+JSON.stringify(j).slice(0,200)); return j.access_token as string;}
const BAD=/lot of|\bbundle\b|\bbox\b|\bpack\b|sealed|\bcase\b|break|random|\bset\b|complete|choose|you pick|\bpick\b/i;
(async()=>{
  const t=await tok();
  // one wide query; bucket the results by the rarity code in the title
  const qs=['Naruto Kayou Earth Scroll CR','Naruto Kayou Earth Scroll AR','Naruto Kayou Earth Scroll MR card','Naruto Kayou Earth Scroll UR','Naruto Kayou Earth Scroll SSR'];
  for(const q of qs){
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const b:any=await(await fetch(u,{headers:{Authorization:`Bearer ${t}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    const items=(b.itemSummaries||[]) as any[];
    const rel=items.filter(i=>!BAD.test(i.title||'')).map(i=>({p:Number(i.price?.value||0),t:i.title}))
      .filter(x=>x.p>0.5&&x.p<3000).sort((a,b)=>a.p-b.p);
    if(!rel.length){console.log(`${q}: no comps`);continue;}
    const med=rel[Math.floor(rel.length/2)].p;
    console.log(`\n=== ${q} === ${rel.length} active singles`);
    console.log(`  low $${rel[0].p.toFixed(2)}  median $${med.toFixed(2)}  high $${rel[rel.length-1].p.toFixed(2)}`);
    for(const x of rel.slice(-6).reverse()) console.log(`   $${x.p.toFixed(2).padStart(8)}  ${x.t.slice(0,86)}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
