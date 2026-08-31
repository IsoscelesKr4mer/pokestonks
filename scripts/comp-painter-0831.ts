/**
 * Andrew Painter RA-AP, 2026 Topps Chrome Rookie Auto, Logofractor True Blue /150.
 * Query wide on player + set, filter on the number afterwards -- putting RA-AP in
 * the search string throttles it to nothing because most titles omit it.
 */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const q=async(query:string)=>{
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=200`;
    const j:any=await(await fetch(u,{headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    return ((j.itemSummaries||[]) as any[]).map(i=>({p:Number(i.price?.value||0),t:i.title||''})).filter(x=>x.p>3);
  };
  const all=[...await q('2026 Topps Chrome Andrew Painter autograph'),
             ...await q('Andrew Painter Topps Chrome rookie auto Phillies')];
  const seen=new Set<string>(); const rows=all.filter(x=>!seen.has(x.t)&&seen.add(x.t));
  const bucket=(name:string,re:RegExp,not?:RegExp)=>{
    const s=rows.filter(x=>re.test(x.t)&&!(not&&not.test(x.t))).sort((a,b)=>a.p-b.p);
    console.log(`\n=== ${name} === ${s.length}`);
    if(!s.length) return;
    console.log(`  low $${s[0].p.toFixed(2)}  median $${s[Math.floor(s.length/2)].p.toFixed(2)}  high $${s[s.length-1].p.toFixed(2)}`);
    for(const x of s.slice(0,7)) console.log(`   $${x.p.toFixed(2).padStart(8)}  ${x.t.slice(0,80)}`);
  };
  bucket('LOGOFRACTOR (any colour)', /logofractor/i);
  bucket('numbered /150', /\/\s?150|150\b/i);
  bucket('any Painter Chrome auto', /painter/i, /logofractor/i);
  console.log(`\n${rows.length} distinct active listings scanned`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
