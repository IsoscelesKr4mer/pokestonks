import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
function pct(a:number[],p:number){const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];}
const CARDS=[
  {id:146,sku:'BBC-146',last:'lile',num:'132',newPar:'Red White & Blue Refractor',q:'2026 Topps Chrome Daylen Lile Red White Blue Refractor #132',kw:(t:string)=>t.includes('red')&&(t.includes('white')||t.includes('blue'))},
  {id:154,sku:'BBC-154',last:'baldwin',num:'258',newPar:'RayWave Refractor',q:'2026 Topps Chrome Drake Baldwin RayWave Refractor #258',kw:(t:string)=>t.includes('raywave')||t.includes('ray wave')},
];
async function main(){
  const at=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const uauth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  for(const c of CARDS){
    await sql`UPDATE baseball_cards SET parallel=${c.newPar} WHERE id=${c.id}`;
    // comp
    const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(c.q)}&category_ids=261328&limit=50`,{headers:{Authorization:`Bearer ${at}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
    const items=(await r.json()).itemSummaries||[];
    const prices=items.filter((it:any)=>{const t=(it.title||'').toLowerCase(); return t.includes(c.last)&&t.includes(c.num)&&t.includes('refractor')&&c.kw(t)&&!t.includes('seams')&&!t.includes('auto')&&!t.includes('/');}).map((it:any)=>Number(it.price?.value)).filter((v:number)=>v>0&&v<2000);
    let ask:number|null=null;
    if(prices.length>=2){ ask=Math.max(1.49,pct(prices,0.35)); const w=Math.floor(ask); ask=w+(ask-w<0.5?0.49:0.99); }
    const note=prices.length?`${prices.length} ${c.newPar} comps: low $${Math.min(...prices).toFixed(2)} / med $${pct(prices,0.5).toFixed(2)} (eBay Browse)`:'no clean comps (kept price)';
    // inventory item update
    const item=await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${c.sku}`,{headers:uauth})).json();
    const oldTitle=item.product.title;
    item.product.title=oldTitle.replace('Baseball Seams Refractor',c.newPar).replace('Baseball Seams',c.newPar);
    item.product.aspects['Parallel/Variety']=[c.newPar];
    item.product.aspects['Features']=['Refractor'];
    if(item.product.description) item.product.description=item.product.description.replace(/Baseball Seams Refractor/g,c.newPar).replace(/Baseball Seams/g,c.newPar);
    if(!item.locale) item.locale='en_US';
    const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${c.sku}`,{method:'PUT',headers:uauth,body:JSON.stringify(item)});
    if(ask!=null){ await sql`UPDATE baseball_cards SET asking_price_cents=${Math.round(ask*100)}, comp_note=${note} WHERE id=${c.id}`; }
    console.log(`id${c.id} ${c.sku}: par->${c.newPar} | invPUT ${pr.status} | comps=${prices.length} ask=${ask!=null?'$'+ask.toFixed(2):'KEEP'} | title="${item.product.title}"`);
    console.log(`   desc="${item.product.description}"`);
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
