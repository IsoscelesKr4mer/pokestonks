import { config } from 'dotenv'; import postgres from 'postgres'; import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}}return undefined;}
async function main(){
  const c:any = await sql`SELECT id,name,product_type,last_market_cents,manual_market_cents FROM catalog_items WHERE name ILIKE '%finest%' AND (name ILIKE '%mega%' OR product_type ILIKE '%mega%')`;
  console.log('catalog matches:', c.length);
  for(const x of c) console.log(`  ci${x.id} | ${x.name}`);
  const p:any = await sql`SELECT p.id,p.purchase_date::text d,p.quantity,p.cost_cents,ci.name FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id WHERE ci.name ILIKE '%finest%' AND p.deleted_at IS NULL ORDER BY p.purchase_date DESC LIMIT 5`;
  console.log('prior finest purchases:', p.length);
  for(const x of p) console.log(`  lot${x.id} ${x.d} qty${x.quantity} $${(x.cost_cents/100).toFixed(2)} ${x.name}`);

  const cfg=JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const t=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')});
  const tok=(await t.json()).access_token;
  const q=encodeURIComponent('2026 Topps Finest baseball mega box');
  const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=100`,{headers:{Authorization:'Bearer '+tok,Accept:'application/json','X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
  const j:any=await r.json();
  const items=(j.itemSummaries||[]).filter((i:any)=>/finest/i.test(i.title)&&/mega/i.test(i.title)&&/2026/.test(i.title)&&!/lot|case|pack|break/i.test(i.title));
  const prices=items.map((i:any)=>Number(i.price?.value)).filter((n:number)=>!isNaN(n)).sort((a:number,b:number)=>a-b);
  console.log(`\nactive single mega box asks: n=${prices.length}`);
  if(prices.length) console.log(`  low $${prices[0]} | med $${prices[Math.floor(prices.length/2)]} | high $${prices[prices.length-1]}`);
  for(const i of items.slice(0,10)) console.log(`  $${i.price.value}${i.buyingOptions?.includes('AUCTION')?' (auction)':''} | ${i.title.slice(0,70)}`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
