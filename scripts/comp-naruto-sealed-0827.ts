/** Sealed Earth Scroll 5-pack collector box: what do they ask, and what is Michael asking? */
import { config } from 'dotenv'; import postgres from 'postgres'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=findKey(o[kk],k); if(r)return r;} return undefined;}
(async()=>{
  const sql=postgres(process.env.DATABASE_URL_DIRECT!,{prepare:false});
  const m:any=await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE mappings::text LIKE '%135082%'`;
  console.log('mapped listings for ci135082:', m.map((x:any)=>x.ebay_item_id).join(', ')||'none');
  await sql.end();
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const j:any=await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  const t=j.access_token;
  const BAD=/lot of|\bcase\b|\b(2|3|4|5|6|10|12|24)\s*(box|boxes)\b|break|random|single|\bcard\b/i;
  const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent('Naruto Kayou Earth Scroll collector box 5 packs sealed')}&limit=200`;
  const b:any=await(await fetch(u,{headers:{Authorization:`Bearer ${t}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
  const rel=((b.itemSummaries||[]) as any[]).filter(i=>!BAD.test(i.title||''))
    .map(i=>({p:Number(i.price?.value||0),t:i.title||''})).filter(x=>x.p>3&&x.p<120).sort((a,b)=>a.p-b.p);
  console.log(`\n=== sealed 5-pack collector boxes === ${rel.length} active`);
  if(rel.length) console.log(`  low $${rel[0].p.toFixed(2)}  median $${rel[Math.floor(rel.length/2)].p.toFixed(2)}`);
  for(const x of rel.slice(0,12)) console.log(`   $${x.p.toFixed(2).padStart(7)}  ${x.t.slice(0,82)}`);
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
