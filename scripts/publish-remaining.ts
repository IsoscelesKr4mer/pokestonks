import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
async function main(){
  const cards=await sql`SELECT id FROM baseball_cards WHERE for_sale=true AND status='priced' AND asking_price_cents IS NOT NULL
    AND coalesce(notes,'') NOT ILIKE '%in-person auto%' AND coalesce(notes,'') NOT ILIKE '%confirm parallel%' AND coalesce(parallel,'') NOT ILIKE '%(CONFIRM)%'`;
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  let ok=0,fail=0;
  for(const c of cards){
    const sku=`BBC-${c.id}`;
    const gr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${sku}`,{headers:auth});
    const gj=await gr.json(); const offer=gj.offers?.[0];
    if(!offer){ console.log(`${sku}: no offer`); fail++; continue; }
    let listingId=offer.listing?.listingId;
    if(offer.status!=='PUBLISHED'||!listingId){
      const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}/publish`,{method:'POST',headers:auth});
      const pj=await pr.json(); listingId=pj.listingId;
      if(!listingId){ console.log(`${sku}: publish fail ${JSON.stringify(pj.errors?.[0]?.message||'').slice(0,80)}`); fail++; continue; }
    }
    await sql`UPDATE baseball_cards SET status='listed',ebay_item_id=${listingId},ebay_offer_id=${offer.offerId},ebay_sku=${sku} WHERE id=${c.id}`;
    ok++;
  }
  console.log(`published ${ok}, failed ${fail}`);
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,300)));
