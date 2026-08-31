/** The two results worth a second look before quoting them. */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
const G=/psa|bgs|sgc|cgc|graded|slab/i, N=/\blot\b|break|random|reprint|custom|digital|\bcase\b/i;
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const s=async(q:string)=>{const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const j:any=await(await fetch(u,{headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    return ((j.itemSummaries||[]) as any[]).map(i=>({p:Number(i.price?.value||0),t:i.title||''}));};
  const show=(lab:string,rows:{p:number;t:string}[])=>{
    const r=rows.filter(x=>x.p>0.5&&x.p<3000&&!G.test(x.t)&&!N.test(x.t)).sort((a,b)=>a.p-b.p);
    console.log(`\n=== ${lab} === ${r.length} raw`);
    if(!r.length) return;
    console.log(`  low $${r[0].p.toFixed(2)}  median $${r[Math.floor(r.length/2)].p.toFixed(2)}  high $${r[r.length-1].p.toFixed(2)}`);
    for(const x of r.slice(0,6)) console.log(`   $${x.p.toFixed(2).padStart(8)}  ${x.t.slice(0,78)}`);
  };
  // 1. Alvarez is an MVP BUYBACK, a stamped insert, not a plain RayWave
  const a=await s('2026 Topps Chrome Yordan Alvarez MVP buyback');
  show('Alvarez MVP buyback', a.filter(x=>/alvarez/i.test(x.t)&&/buyback|mvp/i.test(x.t)));
  show('Alvarez RayWave (no buyback)', a.concat(await s('2026 Topps Chrome Yordan Alvarez raywave'))
        .filter(x=>/alvarez/i.test(x.t)&&/raywave|ray wave/i.test(x.t)&&!/buyback/i.test(x.t)));
  // 2. Ohtani base against his own live ask of $30.49
  const o=await s('2026 Topps Chrome Shohei Ohtani #1 rookie base card');
  show('Ohtani #1 base only', o.filter(x=>/ohtani/i.test(x.t)&&!/refractor|x-?fractor|auto|raywave|logofractor|prism|sapphire|\/\d|insert|1991|wrecking|rival|future|big ticket/i.test(x.t)));
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
