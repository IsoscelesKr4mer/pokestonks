import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
function pct(a:number[],p:number){const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];}
async function main(){
  await sql`UPDATE baseball_cards SET parallel='base' WHERE id=61`;
  // app token for browse comps
  const at=await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json();
  const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent('2026 Topps Chrome Aaron Judge #100')}&category_ids=261328&limit=50`,{headers:{Authorization:`Bearer ${at.access_token}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
  const items=(await r.json()).itemSummaries||[];
  const prices=items.filter((it:any)=>{const t=(it.title||'').toLowerCase(); return t.includes('judge')&&/(^|[^0-9])100([^0-9]|$)/.test(t)&&!t.includes('refractor')&&!/\/\d/.test(t)&&!t.includes('auto')&&!t.includes('ssp')&&!t.includes('/');}).map((it:any)=>Number(it.price?.value)).filter((v:number)=>v>0&&v<1000);
  let ask=prices.length?Math.max(1.49,pct(prices,0.35)):null;
  if(ask){const w=Math.floor(ask);ask=w+(ask-w<0.5?0.49:0.99);}
  const note=prices.length?`${prices.length} base comps: low $${Math.min(...prices).toFixed(2)} / med $${pct(prices,0.5).toFixed(2)} (eBay Browse)`:'no base comps';
  console.log(`base Judge comp: ${prices.length} -> ask $${ask?ask.toFixed(2):'n/a (keep/hand-price)'}`);
  // update live listing BBC-61: remove Refractor, set price
  const tok=await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json();
  const auth={Authorization:`Bearer ${tok.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  const item=await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-61',{headers:auth})).json();
  item.product.title='2026 Topps Chrome Aaron Judge #100';
  delete item.product.aspects['Parallel/Variety'];
  item.product.aspects['Features']=(item.product.aspects['Features']||[]).filter((f:string)=>f.toLowerCase()!=='refractor');
  if(!item.product.aspects['Features'].length) delete item.product.aspects['Features'];
  item.product.description=(item.product.description||'').replace(/base Refractor - /,'- ').replace(/Refractor/g,'base');
  if(!item.locale) item.locale='en_US';
  const pr=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-61',{method:'PUT',headers:auth,body:JSON.stringify(item)});
  console.log('inventory PUT',pr.status);
  if(ask){
    const off=await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=BBC-61',{headers:auth})).json();
    const o=off.offers[0];
    const body={sku:'BBC-61',marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'261328',merchantLocationKey:'edmonds-wa',listingDescription:item.product.description,listingPolicies:o.listingPolicies,pricingSummary:{price:{value:ask.toFixed(2),currency:'USD'}},tax:{applyTax:false}};
    const or=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${o.offerId}`,{method:'PUT',headers:auth,body:JSON.stringify(body)});
    console.log('offer PUT',or.status,'-> $'+ask.toFixed(2));
    await sql`UPDATE baseball_cards SET asking_price_cents=${Math.round(ask*100)}, comp_note=${note} WHERE id=61`;
  }
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
