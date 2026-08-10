import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function findKey(o:any,k:string):string|undefined{ if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=findKey(o[kk],k);if(r)return r;}} return undefined; }
const cfg=JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8'));
const CID=findKey(cfg,'EBAY_CLIENT_ID')!,SEC=findKey(cfg,'EBAY_CLIENT_SECRET')!,REFRESH=findKey(cfg,'EBAY_USER_REFRESH_TOKEN')!;
const SKUS:[string,number][]=[['BBC-80',80],['BBC-62',62],['BBC-88',88],['BBC-104',104],['BBC-112',112]];
async function main(){
  const tr=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${CID}:${SEC}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`});
  const tj=await tr.json(); const auth={Authorization:`Bearer ${tj.access_token}`,'Content-Type':'application/json','Content-Language':'en-US','Accept-Language':'en-US','Accept':'application/json'};
  for(const [sku,id] of SKUS){
    const gr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${sku}`,{headers:auth});
    const gj=await gr.json(); const offer=gj.offers?.[0];
    if(!offer){ console.log(`${sku}: no offer found`); continue; }
    const offerId=offer.offerId;
    if(offer.status==='PUBLISHED' && offer.listing?.listingId){
      await sql`UPDATE baseball_cards SET status='listed',ebay_item_id=${offer.listing.listingId},ebay_offer_id=${offerId},ebay_sku=${sku} WHERE id=${id}`;
      console.log(`${sku}: already published ${offer.listing.listingId} -> writeback`); continue;
    }
    const pr=await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerId}/publish`,{method:'POST',headers:auth});
    const pj=await pr.json();
    if(pj.listingId){ await sql`UPDATE baseball_cards SET status='listed',ebay_item_id=${pj.listingId},ebay_offer_id=${offerId},ebay_sku=${sku} WHERE id=${id}`; console.log(`${sku}: PUBLISHED ${pj.listingId}`); }
    else console.log(`${sku}: publish failed ${JSON.stringify(pj.errors?.[0]?.message||pj).slice(0,160)}`);
  }
  await sql.end();
}
main().catch(e=>console.error(String(e).slice(0,400)));
