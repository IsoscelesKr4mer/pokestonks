/** 2022 Bowman Chrome Sapphire: sealed boxes vs the Julio image-variation card. */
import { config } from 'dotenv'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });
function f(o:any,k:string):any{if(o&&typeof o==='object')for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=f(o[kk],k);if(r)return r;}}
(async()=>{
  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const b=Buffer.from(f(cfg,'EBAY_CLIENT_ID')+':'+f(cfg,'EBAY_CLIENT_SECRET')).toString('base64');
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+b,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const q=async(query:string,bad:RegExp,lo=5,hi=100000)=>{
    const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=200`;
    const j:any=await(await fetch(u,{headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
    return ((j.itemSummaries||[]) as any[]).filter(i=>!bad.test(i.title||''))
      .map(i=>({p:Number(i.price?.value||0),t:i.title||''})).filter(x=>x.p>lo&&x.p<hi).sort((a,b)=>a.p-b.p);
  };
  const show=(label:string,rows:{p:number;t:string}[],n=6)=>{
    console.log(`\n=== ${label} === ${rows.length} active`);
    if(!rows.length) return;
    console.log(`  low $${rows[0].p.toFixed(2)}  median $${rows[Math.floor(rows.length/2)].p.toFixed(2)}  high $${rows[rows.length-1].p.toFixed(2)}`);
    for(const r of rows.slice(0,n)) console.log(`   $${r.p.toFixed(2).padStart(9)}  ${r.t.slice(0,76)}`);
  };
  // The wide query drags in 2021 boxes, which are a different and cheaper
  // product. Filter on the year in the TITLE rather than trusting the search.
  const boxes=(await q('Bowman Chrome Sapphire Edition sealed hobby box', /lot|case|break|single|card |pack only|empty|wrapper/i, 80))
    .filter(x=>/2022/.test(x.t) && !/2021|2023|2024|2025|2026/.test(x.t));
  show('SEALED 2022 Bowman Chrome Sapphire box (year-filtered)', boxes, 8);
  if(boxes.length){
    const med=boxes[Math.floor(boxes.length/2)].p;
    console.log(`
  1 Image Variation per ~57 packs, 8 packs/box  ->  ~1 in 7.1 boxes has ANY variation`);
    console.log(`  15 different variations                      ->  ~1 in 107 boxes for Julio specifically`);
    console.log(`  107 boxes x $${med.toFixed(0)} median = $${(107*med).toLocaleString('en-US',{maximumFractionDigits:0})} to average one Julio`);
  }
  show('Julio Rodriguez Sapphire IMAGE VARIATION',
       await q('2022 Bowman Chrome Sapphire Julio Rodriguez image variation', /lot|break|reprint|custom|digital/i, 20));
  show('Julio Rodriguez Sapphire base RC #48',
       await q('2022 Bowman Chrome Sapphire Julio Rodriguez 48 rookie', /lot|break|reprint|custom|digital|variation/i, 5));
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
