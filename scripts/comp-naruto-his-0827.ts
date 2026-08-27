/**
 * Price the three cards Michael actually pulled: NREA02 UR-005, UR-014, MR-001.
 * Wide queries per the pricer rule (never put the card number in the query),
 * then filter the RESULTS on the number. Raw only -- graded is another market.
 */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
async function tok(){ const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  if(!j.access_token) throw new Error(JSON.stringify(j).slice(0,200)); return j.access_token as string;}
const GRADED=/psa|bgs|cgc|\btag\b|gem mint|pristine|graded/i;
const MULTI=/lot|bulk|\bset\b|\bbox\b|\bpack\b|sealed|break|choose|you pick|\d+\s*(cards|pcs)|&|\+/i;
(async()=>{
  const t=await tok(); const seen=new Map<string,{p:number;t:string}[]>();
  const queries=['Naruto Kayou Earth Scroll 2 UR English','Naruto Kayou NREA02 UR','Naruto Kayou NREA02 MR','Naruto Kayou Earth Scroll MR English'];
  for(const q of queries){
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const b:any=await(await fetch(u,{headers:{Authorization:`Bearer ${t}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    for(const i of (b.itemSummaries||[]) as any[]){
      const title=i.title||''; const p=Number(i.price?.value||0); if(!p) continue;
      for(const [label,re] of [['UR-005',/UR[- ]?005/i],['UR-014',/UR[- ]?014/i],['MR-001',/MR[- ]?001/i]] as [string,RegExp][]){
        if(!re.test(title)) continue;
        if(!seen.has(label)) seen.set(label,[]);
        const arr=seen.get(label)!; if(arr.some(x=>x.t===title)) continue;
        arr.push({p,t:title});
      }
    }
  }
  for(const label of ['MR-001','UR-005','UR-014']){
    const all=seen.get(label)||[];
    const raw=all.filter(x=>!GRADED.test(x.t)&&!MULTI.test(x.t)).sort((a,b)=>a.p-b.p);
    console.log(`\n=== NREA02-${label} === ${all.length} hits, ${raw.length} raw singles`);
    if(raw.length) console.log(`  low $${raw[0].p.toFixed(2)}  median $${raw[Math.floor(raw.length/2)].p.toFixed(2)}  high $${raw[raw.length-1].p.toFixed(2)}`);
    for(const x of raw.slice(0,8)) console.log(`   $${x.p.toFixed(2).padStart(7)}  ${x.t.slice(0,82)}`);
    const other=all.filter(x=>GRADED.test(x.t)||MULTI.test(x.t));
    if(other.length) console.log(`  (${other.length} graded/multi excluded, e.g. ${other[0].t.slice(0,60)})`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
