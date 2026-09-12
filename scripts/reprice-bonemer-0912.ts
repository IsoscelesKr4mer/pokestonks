/**
 * Bonemer Purple Wave /250 to $9.99.
 *
 *   npx tsx scripts/reprice-bonemer-0912.ts           # dry run
 *   npx tsx scripts/reprice-bonemer-0912.ts --apply
 *
 * Michael: "Check comps and you decide. I want to actually sell stuff and not
 * have it sit forever especially while the set is still new."
 *
 * Live Purple /250 Bonemers on 2026-09-12, his own $18 excluded:
 *   $8.99   Purple Wave #93/250        the identical parallel
 *   $10.00  Purple Refractor /250
 *   $13.00  Purple /250
 *   $16.50  Purple Pulsar Refractor /250
 *   $40.00  Purple /250                 nobody is paying this
 *
 * At $18 he was the second dearest thing on the board while the same card sat
 * at $8.99, which is not a price, it is a decision not to sell. The vault's
 * $13 was better but still third of six.
 *
 * $9.99 puts him a dollar off the cheapest identical copy and, more usefully,
 * under the $10 filter buyers actually click. Six copies of one parallel of a
 * non-premier prospect is real supply; there is no scarcity here to wait out,
 * and the set is newest right now.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BOWCH-BCP218-7';
const ITEM = '168680124215';
const ROW = 564;
const PRICE = 9.99;
// The old Best Offer floor was set against an $18 ask and is higher than the
// new price, which eBay rejects outright. It would also have silently bounced
// every offer, the same way the Dalis package's floor did.
const DECLINE = 7.5;

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o:any,k:string):string|undefined{ if(o&&typeof o==='object')for(const kk of Object.keys(o)){ if(kk===k&&typeof o[kk]==='string')return o[kk]; const r=fk(o[kk],k); if(r)return r;} return undefined;}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(fk(cfg,'EBAY_CLIENT_ID')+':'+fk(cfg,'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg,'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  return j.access_token as string;
}
async function live(tok: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', { method:'POST',
    headers:{'X-EBAY-API-CALL-NAME':'GetItem','X-EBAY-API-SITEID':'0','X-EBAY-API-COMPATIBILITY-LEVEL':'1193','X-EBAY-API-IAF-TOKEN':tok,'Content-Type':'text/xml'},
    body:'<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>'+ITEM+'</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>' });
  const x = await r.text();
  return { price: x.match(/<StartPrice[^>]*>([\d.]+)</)?.[1] ?? '', title: x.match(/<Title>([^<]*)</)?.[1] ?? '',
           status: x.match(/<ListingStatus>(\w+)</)?.[1], sold: x.match(/<QuantitySold>(\d+)</)?.[1] };
}

(async () => {
  const tok = await userToken();
  const H = { Authorization:'Bearer '+tok, 'Content-Type':'application/json', Accept:'application/json',
              'Accept-Language':'en-US','Content-Language':'en-US' };
  const before = await live(tok);
  const [row]: any = await sql`select asking_price_cents ask from baseball_cards where id = ${ROW}`;
  console.log(before.title);
  console.log('live $' + before.price + ' | vault $' + (row.ask/100).toFixed(2) + ' | sold ' + before.sold + ' | ' + before.status);
  console.log('new  $' + PRICE.toFixed(2));
  if (Number(before.sold) > 0) throw new Error('this has sold, do not reprice');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const offers: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku='+SKU,{headers:H})).json();
  const offer = offers.offers?.[0];
  if (!offer) throw new Error('no offer for ' + SKU);
  const oldFloor = offer.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value;
  console.log('Best Offer floor $' + oldFloor + ' -> $' + DECLINE.toFixed(2));
  const body: any = { ...offer,
    pricingSummary: { ...offer.pricingSummary, price: { value: PRICE.toFixed(2), currency: 'USD' } },
    listingPolicies: offer.listingPolicies?.bestOfferTerms
      ? { ...offer.listingPolicies, bestOfferTerms: { ...offer.listingPolicies.bestOfferTerms,
          autoDeclinePrice: { value: DECLINE.toFixed(2), currency: 'USD' } } }
      : offer.listingPolicies };
  for (const k of ['offerId','sku','marketplaceId','format','listing','status']) delete body[k];
  const p = await fetch('https://api.ebay.com/sell/inventory/v1/offer/'+offer.offerId, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('PUT offer: ' + p.status);
  if (p.status >= 400) { console.log(await p.text()); process.exit(1); }

  const after = await live(tok);
  console.log('verify live: $' + after.price);
  if (Number(after.price) !== PRICE) throw new Error('price did not take, live is ' + after.price);
  await sql`update baseball_cards set asking_price_cents = ${Math.round(PRICE*100)}, updated_at = now() where id = ${ROW}`;
  console.log('vault: row ' + ROW + ' set to $' + PRICE.toFixed(2) + ', matches the listing again');
  await sql.end();
})();
