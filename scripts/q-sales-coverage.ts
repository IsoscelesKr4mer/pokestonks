import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
(async()=>{
  const [v]:any = await sql`SELECT COUNT(*)::int n, SUM(quantity)::int q, SUM(sale_price_cents)::int g, SUM(fees_cents)::int f, SUM(matched_cost_cents)::int c FROM sales`;
  console.log(`VAULT  (sales table -> /sales page)`);
  console.log(`  ${v.n} rows, ${v.q} units, gross $${(v.g/100).toFixed(2)}, fees $${(v.f/100).toFixed(2)}, cost $${(v.c/100).toFixed(2)}, realized $${((v.g-v.f-v.c)/100).toFixed(2)}`);
  const plat:any = await sql`SELECT platform, COUNT(*)::int n, SUM(sale_price_cents)::int g FROM sales GROUP BY platform ORDER BY g DESC`;
  plat.forEach((p:any)=>console.log(`     ${String(p.platform).padEnd(20)} ${String(p.n).padStart(3)} rows  $${(p.g/100).toFixed(2)}`));

  const [b]:any = await sql`SELECT COUNT(*)::int n, SUM(sold_price_cents)::int g FROM baseball_cards WHERE status='sold'`;
  console.log(`\nCARDS  (baseball_cards -> /baseball-cards sales tab)`);
  console.log(`  ${b.n} sold, gross $${(b.g/100).toFixed(2)}  (no fees or cost tracked at all)`);

  // Everything eBay has ever paid him
  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${findKey(cfg,'EBAY_CLIENT_ID')}:${findKey(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.fulfillment')})).json()).access_token;
  const buckets: Record<string,{n:number,g:number}> = {};
  let total=0, orders=0;
  for(let off=0; off<400; off+=50){
    const r:any = await (await fetch(`https://api.ebay.com/sell/fulfillment/v1/order?filter=creationdate:%5B2026-01-01T00:00:00.000Z..%5D&limit=50&offset=${off}`,{headers:{Authorization:`Bearer ${tok}`,Accept:'application/json'}})).json();
    if(!r.orders?.length) break;
    orders += r.orders.length;
    for(const o of r.orders) for(const li of o.lineItems){
      const sku = li.sku ?? '';
      const k = /^(BBC-|PYP-CHROME|PYP-BOWMAN|PYP-FINEST|PYP-BTP|PYP-P-)/.test(sku) ? 'sports cards'
              : /^PYP-HOB/.test(sku) ? 'MAGIC'
              : /^PIN-/.test(sku) ? 'pins'
              : /^BBL-/.test(sku) ? 'bobbleheads'
              : /^JERSEY-/.test(sku) ? 'jerseys'
              : 'sealed vault';
      const val = Number(li.lineItemCost.value);
      buckets[k] ??= {n:0,g:0}; buckets[k].n++; buckets[k].g += val; total += val;
    }
    if(orders >= (r.total ?? 0)) break;
  }
  console.log(`\nWHAT EBAY ACTUALLY PAID (${orders} orders in 2026, item revenue only):`);
  for(const [k,val] of Object.entries(buckets).sort((a,b)=>b[1].g-a[1].g))
    console.log(`  ${k.padEnd(16)} ${String(val.n).padStart(3)} lines  $${val.g.toFixed(2)}`);
  console.log(`  ${'TOTAL'.padEnd(16)} ${' '.padStart(3)}        $${total.toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
