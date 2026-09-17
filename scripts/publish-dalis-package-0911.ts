/**
 * Publish the Wilder Dalis two-auto package. Michael gave the go-ahead.
 * Both card rows (192 the IP auto, 566 the certified) get pointed at the one
 * listing, which is correct: two different cards sold together, not a card
 * listed twice.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const SKU = 'DALIS-2AUTO-PKG';
function fk(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}}return undefined;}
(async () => {
  const cfg = JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const tk = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const H = { Authorization:'Bearer '+tk.access_token, 'Content-Type':'application/json',
    Accept:'application/json', 'Accept-Language':'en-US', 'Content-Language':'en-US' };

  const q: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku='+SKU,{headers:H})).json();
  const offer = (q.offers||[])[0];
  if (!offer) { console.log('no offer for ' + SKU); await sql.end(); return; }
  if (offer.status === 'PUBLISHED') console.log('already published: ' + offer.listing?.listingId);

  let itemId = offer.listing?.listingId;
  if (offer.status !== 'PUBLISHED') {
    const p: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer/'+offer.offerId+'/publish',
      { method:'POST', headers:H })).json().catch(()=>({}));
    itemId = p.listingId;
    if (!itemId) { console.log('publish failed: ' + JSON.stringify(p).slice(0,400)); await sql.end(); return; }
  }

  // verify with the Trading API, the inventory API has lied about this before
  const x = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{
    'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193',
    'X-EBAY-API-IAF-TOKEN':tk.access_token,'Content-Type':'text/xml'},
    body:'<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>'+itemId+'</ItemID></GetItemRequest>'})).text();
  console.log('itemId ' + itemId + '  status ' + (x.match(/<ListingStatus>(\w+)</)?.[1]) +
    '  price ' + (x.match(/<CurrentPrice[^>]*>([\d.]+)</)?.[1]) +
    '  photos ' + (x.match(/<PictureURL>/g)||[]).length);
  console.log('title: ' + (x.match(/<Title>([^<]*)</)?.[1]));

  for (const id of [192, 566]) {
    await sql`UPDATE baseball_cards SET status='listed', ebay_item_id=${itemId},
      ebay_offer_id=${offer.offerId}, ebay_sku=${SKU}, updated_at=now() WHERE id=${id}`;
  }
  console.log('https://www.ebay.com/itm/' + itemId + '   (rows 192 and 566 point at it)');
  await sql.end();
})();
