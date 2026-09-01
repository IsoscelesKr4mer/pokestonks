import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}} return undefined;}
(async()=>{
  const m:any = await sql`SELECT market_price_cents p, snapshot_date::text d FROM market_prices
    WHERE catalog_item_id=17235 ORDER BY snapshot_date DESC LIMIT 3`;
  console.log('DR bundle market price (TCGplayer via pokestonks):');
  m.forEach((r:any)=>console.log(`  ${r.d}  $${(r.p/100).toFixed(2)}`));

  const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
  const tok=(await(await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(`${fk(cfg,'EBAY_CLIENT_ID')}:${fk(cfg,'EBAY_CLIENT_SECRET')}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const u=`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent('Pokemon Destined Rivals Booster Bundle sealed')}&limit=200`;
  const j:any=await(await fetch(u,{headers:{Authorization:`Bearer ${tok}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}})).json();
  // A DR bundle listing legitimately says "6 booster packs", so filtering on
  // "pack" killed every hit. Only exclude what is genuinely a different product
  // or a multi-unit lot.
  const BAD=/\blot\b|\bcase\b|\bdisplay\b|elite trainer|\betb\b|blister|\btin\b|booster box|half box|build ?& ?battle|opened|empty|proxy|custom|\b(2|3|4|5|6|7|8|9|10)x?\s+(bundles|booster bundles)\b/i;
  const hits=((j.itemSummaries||[]) as any[])
    .map(i=>({p:Number(i.price?.value||0),ship:Number(i.shippingOptions?.[0]?.shippingCost?.value??0),t:i.title||''}))
    .filter(x=>x.p>20&&x.p<200)
    .filter(x=>/destined rivals/i.test(x.t) && /bundle/i.test(x.t))
    .filter(x=>!BAD.test(x.t))
    .sort((a,b)=>a.p-b.p);
  const med=hits.length?hits[Math.floor(hits.length/2)]:null;
  console.log(`\neBay single-bundle asks: ${hits.length}`);
  if(med) console.log(`  low $${hits[0].p.toFixed(2)}  median $${med.p.toFixed(2)}  high $${hits[hits.length-1].p.toFixed(2)}`);
  hits.slice(0,6).forEach(h=>console.log(`    $${h.p.toFixed(2)} +$${h.ship.toFixed(2)} ship  ${h.t.slice(0,66)}`));

  const ask = med?.p ?? 0;
  const FEE=0.1325, ORDER=0.40;
  const ebayNet = ask*(1-FEE)-ORDER;                 // buyer pays shipping
  const TP=60.99, SHIP_PER=1.50;                     // ~$15 to send a 10-box carton
  console.log(`\nPER BUNDLE, net to him:`);
  console.log(`  eBay at the median ask $${ask.toFixed(2)}   -> $${ebayNet.toFixed(2)}  (13.25% + $0.40/order, buyer pays shipping)`);
  console.log(`  TradePost maker $${TP.toFixed(2)}          -> $${(TP-SHIP_PER).toFixed(2)}  (less ~$${SHIP_PER.toFixed(2)}/box shipping on a 10-box carton)`);
  console.log(`  card show at 80% of $${ask.toFixed(2)}      -> $${(ask*0.80).toFixed(2)}  cash, no fees`);
  console.log(`\n  cost basis $30.00 each`);
  console.log(`  profit/bundle: eBay $${(ebayNet-30).toFixed(2)} | TradePost $${(TP-SHIP_PER-30).toFixed(2)} | show $${(ask*0.80-30).toFixed(2)}`);
  console.log(`\n  he holds 8; the maker needs 10, so 2 more at $30 = $60 to unlock it`);
  console.log(`  10 x TradePost nets $${(10*(TP-SHIP_PER)).toFixed(2)} on $${(10*30).toFixed(2)} cost = $${(10*(TP-SHIP_PER)-300).toFixed(2)} profit`);
  console.log(`   8 x eBay      nets $${(8*ebayNet).toFixed(2)} on $${(8*30).toFixed(2)} cost = $${(8*ebayNet-240).toFixed(2)} profit`);
  await sql.end();
})();
