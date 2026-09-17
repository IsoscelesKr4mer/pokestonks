/**
 * Reprice the Dalis package: $299.99 -> $249.99, and drop the Best Offer
 * auto-decline floor hard.
 *
 * The headline price is the smaller half of this change. Auto-decline was at
 * $224.99, 75% of the old ask, so ANY offer under that was silently bounced
 * with no counter and no conversation. The single card sold its interest
 * through exactly that conversation: a message and offers, off an $85 opener
 * against a $125 ask. At a 75% floor that buyer never reaches Michael at all.
 *
 * Updates the offer in place. It does NOT end and recreate, so the listing
 * keeps its item number and whatever Best Match standing it has built.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs'; import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PRICE = '249.99';
const DECLINE = '165.00';
function fk(o:any,k:string):string|undefined{if(o&&typeof o==='object'){for(const kk of Object.keys(o)){if(kk===k&&typeof o[kk]==='string')return o[kk];const r=fk(o[kk],k);if(r)return r;}}return undefined;}

(async () => {
  const cfg = JSON.parse(readFileSync(homedir()+'/.claude.json','utf8'));
  const tk = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',
    headers:{Authorization:'Basic '+Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded'},
    body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!)+'&scope='+encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')})).json();
  const H={Authorization:'Bearer '+tk.access_token,'Content-Type':'application/json',Accept:'application/json','Accept-Language':'en-US','Content-Language':'en-US'};

  const q:any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=DALIS-2AUTO-PKG',{headers:H})).json();
  const o = (q.offers||[])[0];
  console.log('now: $' + o.pricingSummary.price.value + '   auto-decline $' +
    (o.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value ?? 'none'));
  console.log('to:  $' + PRICE + '   auto-decline $' + DECLINE);
  if (!APPLY) { console.log('DRY RUN, pass --apply'); return; }

  const body = JSON.parse(JSON.stringify(o));
  delete body.offerId; delete body.sku; delete body.listing; delete body.status;
  body.pricingSummary = { price: { value: PRICE, currency: 'USD' } };
  body.listingPolicies.bestOfferTerms = {
    bestOfferEnabled: true,
    autoDeclinePrice: { value: DECLINE, currency: 'USD' },
  };
  const r = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + o.offerId, {
    method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('offer update: ' + r.status);
  if (!r.ok) { console.log((await r.text()).slice(0, 400)); return; }

  const x = await (await fetch('https://api.ebay.com/ws/api.dll',{method:'POST',headers:{
    'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193',
    'X-EBAY-API-IAF-TOKEN':tk.access_token,'Content-Type':'text/xml'},
    body:'<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>168680173463</ItemID></GetItemRequest>'})).text();
  console.log('live: item ' + (x.match(/<ItemID>(\d+)</)?.[1]) + '  ' +
    (x.match(/<ListingStatus>(\w+)</)?.[1]) + '  $' + (x.match(/<CurrentPrice[^>]*>([\d.]+)</)?.[1]));
})();
