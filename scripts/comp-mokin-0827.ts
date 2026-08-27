/** MOKiN Thunderbolt 4 dock (MOTBO101) -- active asks, new and used. */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  const t=j.access_token;
  for(const q of ['MOKiN Thunderbolt 4 docking station','MOTBO101','MOKiN docking station Thunderbolt','Thunderbolt 4 dock 40Gbps dual monitor']){
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=100`;
    const b:any=await(await fetch(u,{headers:{Authorization:`Bearer ${t}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    const items=((b.itemSummaries||[]) as any[]).map(i=>({p:Number(i.price?.value||0),t:i.title||'',c:i.condition||'',s:i.itemWebUrl}))
      .filter(x=>x.p>10&&x.p<500).sort((a,b)=>a.p-b.p);
    console.log(`\n=== ${q} === ${items.length}`);
    if(items.length) console.log(`  low $${items[0].p.toFixed(2)}  median $${items[Math.floor(items.length/2)].p.toFixed(2)}  high $${items[items.length-1].p.toFixed(2)}`);
    for(const x of items.slice(0,10)) console.log(`   $${x.p.toFixed(2).padStart(7)} [${x.c.slice(0,12).padEnd(12)}] ${x.t.slice(0,74)}`);
  }
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
