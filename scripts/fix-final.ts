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
  const at=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const auth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};

  // --- SEMIEN #281 -> RWB ---
  await sql`UPDATE baseball_cards SET parallel='Red White & Blue Refractor' WHERE id=156`;
  const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent('2026 Topps Chrome Marcus Semien Red White Blue Refractor #281')}&category_ids=261328&limit=50`,{headers:{Authorization:`Bearer ${at}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
  const items=(await r.json()).itemSummaries||[];
  const prices=items.filter((it:any)=>{const t=(it.title||'').toLowerCase(); return t.includes('semien')&&t.includes('281')&&t.includes('refractor')&&t.includes('red')&&(t.includes('white')||t.includes('blue'))&&!t.includes('seams')&&!t.includes('auto')&&!t.includes('/');}).map((it:any)=>Number(it.price?.value)).filter((v:number)=>v>0&&v<2000);
  let ask=3.99; if(prices.length>=2){ ask=Math.max(1.49,pct(prices,0.35)); const w=Math.floor(ask); ask=w+(ask-w<0.5?0.49:0.99); }
  const note=prices.length?`${prices.length} RWB comps: low $${Math.min(...prices).toFixed(2)} / med $${pct(prices,0.5).toFixed(2)} (eBay Browse)`:'no clean comps (kept)';
  const si=await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-156',{headers:auth})).json();
  const team=(si.product.description?.match(/#\d+,\s*(.+?)\.<\/p>/)||[])[1]||'';
  si.product.title='2026 Topps Chrome Marcus Semien Red White & Blue Refractor #281';
  si.product.aspects['Parallel/Variety']=['Red White & Blue Refractor']; si.product.aspects['Features']=['Refractor'];
  si.product.description=`<p>2026 Topps Chrome Red White & Blue Refractor - Marcus Semien #281${team?', '+team:''}.</p><p>Raw / ungraded, near mint or better. Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking. Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>`;
  if(!si.locale)si.locale='en_US';
  const sir=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-156',{method:'PUT',headers:auth,body:JSON.stringify(si)});
  const ful= ask>20?'269110723012':'272052757012'; const lp:any={paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:ful,eBayPlusIfEligible:false}; if(ask>=10)lp.bestOfferTerms={bestOfferEnabled:true,autoDeclinePrice:{value:(ask*0.75).toFixed(2),currency:'USD'}};
  const sor=await fetch('https://api.ebay.com/sell/inventory/v1/offer/216194678011',{method:'PUT',headers:auth,body:JSON.stringify({sku:'BBC-156',marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'261328',merchantLocationKey:'edmonds-wa',listingDescription:si.product.description,listingPolicies:lp,pricingSummary:{price:{value:ask.toFixed(2),currency:'USD'}},tax:{applyTax:false}})});
  await sql`UPDATE baseball_cards SET asking_price_cents=${Math.round(ask*100)}, comp_note=${note} WHERE id=156`;
  console.log(`SEMIEN id156: ->RWB inv ${sir.status} offer ${sor.status} $${ask.toFixed(2)} (${prices.length} comps)`);

  // --- VLAD #66 -> keep Baseball Seams, add Color Match to title ---
  const vi=await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-144',{headers:auth})).json();
  let vt=vi.product.title as string;
  if(!/color match/i.test(vt)) vt=vt.replace(/ #66\b/,' Color Match #66');
  if(!/color match/i.test(vt)) vt=vt+' Color Match';
  vi.product.title=vt; if(!vi.locale)vi.locale='en_US';
  const vir=await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/BBC-144',{method:'PUT',headers:auth,body:JSON.stringify(vi)});
  const vpr=await fetch('https://api.ebay.com/sell/inventory/v1/offer/216194845011/publish',{method:'POST',headers:auth});
  await sql`UPDATE baseball_cards SET notes=${'Color match (Baseball Seams red pattern matches red uniform)'} WHERE id=144`;
  console.log(`VLAD id144: title="${vt}" (${vt.length}) inv ${vir.status} pub ${vpr.status}`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
