import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
function pct(a:number[],p:number){const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];}
const KW:Record<string,(t:string)=>boolean>={ raywave:(t)=>t.includes('raywave')||t.includes('ray wave'), seams:(t)=>t.includes('seams'), rwb:(t)=>t.includes('red')&&(t.includes('white')||t.includes('blue')) };
const CARDS=[
  {player:'Zack Wheeler',num:'290',newPar:'RayWave Refractor',type:'raywave'},
  {player:'Jack Flaherty',num:'14',newPar:'Baseball Seams Refractor',type:'seams'},
  {player:'Max Scherzer',num:'148',newPar:'RayWave Refractor',type:'raywave'},
  {player:'Lars Nootbaar',num:'292',newPar:'Baseball Seams Refractor',type:'seams'},
];
async function main(){
  const at=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope')})).json()).access_token;
  const tok=(await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`})).json()).access_token;
  const uauth={Authorization:`Bearer ${tok}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  for(const c of CARDS){
    const rows=await sql`SELECT id,player,card_number,parallel,ebay_sku,ebay_offer_id,asking_price_cents FROM baseball_cards WHERE player ILIKE ${'%'+c.player+'%'} AND card_number=${c.num} AND status='listed'`;
    if(rows.length!==1){ console.log(`SKIP ${c.player} #${c.num}: matched ${rows.length}`); continue; }
    const row=rows[0]; const sku=row.ebay_sku, offerId=row.ebay_offer_id;
    await sql`UPDATE baseball_cards SET parallel=${c.newPar} WHERE id=${row.id}`;
    // re-comp
    const r=await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(`2026 Topps Chrome ${c.player} ${c.newPar} #${c.num}`)}&category_ids=261328&limit=50`,{headers:{Authorization:`Bearer ${at}`,'X-EBAY-C-MARKETPLACE-ID':'EBAY_US'}});
    const items=(await r.json()).itemSummaries||[];
    const last=c.player.split(' ').pop()!.toLowerCase();
    const prices=items.filter((it:any)=>{const t=(it.title||'').toLowerCase(); return t.includes(last)&&t.includes(c.num)&&t.includes('refractor')&&KW[c.type](t)&&!t.includes('auto')&&!t.includes('/');}).map((it:any)=>Number(it.price?.value)).filter((v:number)=>v>0&&v<2000);
    let ask=row.asking_price_cents/100;
    if(prices.length>=2){ ask=Math.max(1.49,pct(prices,0.35)); const w=Math.floor(ask); ask=w+(ask-w<0.5?0.49:0.99); }
    const note=prices.length?`${prices.length} ${c.newPar} comps: low $${Math.min(...prices).toFixed(2)} / med $${pct(prices,0.5).toFixed(2)} (eBay Browse)`:'no clean comps (kept price)';
    // inventory item
    const item=await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`,{headers:uauth})).json();
    const team=(item.product.description?.match(/#\d+,\s*(.+?)\.<\/p>/)||[])[1]||'';
    const newTitle=`2026 Topps Chrome ${row.player} ${c.newPar} #${c.num}`;
    const newDesc=`<p>2026 Topps Chrome ${c.newPar} - ${row.player} #${c.num}${team?', '+team:''}.</p><p>Raw / ungraded, near mint or better. Stored in a penny sleeve and toploader, shipped protected between rigid cardboard with tracking. Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>`;
    item.product.title=newTitle; item.product.aspects['Parallel/Variety']=[c.newPar]; item.product.aspects['Features']=['Refractor']; item.product.description=newDesc; if(!item.locale)item.locale='en_US';
    const ir=await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${sku}`,{method:'PUT',headers:uauth,body:JSON.stringify(item)});
    // offer update (full clean body)
    const ful = ask>20 ? '269110723012' : '272052757012';
    const lp:any={paymentPolicyId:'269110704012',returnPolicyId:'269110705012',fulfillmentPolicyId:ful,eBayPlusIfEligible:false};
    if(ask>=10) lp.bestOfferTerms={bestOfferEnabled:true,autoDeclinePrice:{value:(ask*0.75).toFixed(2),currency:'USD'}};
    const body={sku,marketplaceId:'EBAY_US',format:'FIXED_PRICE',availableQuantity:1,categoryId:'261328',merchantLocationKey:'edmonds-wa',listingDescription:newDesc,listingPolicies:lp,pricingSummary:{price:{value:ask.toFixed(2),currency:'USD'}},tax:{applyTax:false}};
    const or=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}`,{method:'PUT',headers:uauth,body:JSON.stringify(body)});
    await sql`UPDATE baseball_cards SET asking_price_cents=${Math.round(ask*100)}, comp_note=${note} WHERE id=${row.id}`;
    console.log(`id${row.id} ${sku}: ${row.parallel} -> ${c.newPar} | inv ${ir.status} offer ${or.status} | $${(row.asking_price_cents/100).toFixed(2)}->$${ask.toFixed(2)} (${prices.length} comps) | ${newTitle}`);
    if(or.status>=300) console.log('   OFFER ERR:',(await or.text()).slice(0,200));
  }
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
