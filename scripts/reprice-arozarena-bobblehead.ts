/**
 * Price the Arozarena bobblehead to sell, and use the free lever too.
 *
 *   npx tsx scripts/reprice-arozarena-bobblehead.ts --apply
 *
 * 28 days live at $29.99 with 0 watchers, 0 leads, 0 sold. Cost basis is $0
 * (SGA), so break-even is $0 and any price is profit. July's comp work put the
 * sold NIB cluster at $24-30 and this was listed at the TOP of it, against 9+
 * active listings of the same bobblehead.
 *
 * Also fixes the title, which was only 63 of 80 characters. 17 wasted characters
 * on a listing with zero watchers is the cheapest fix available. No giveaway date
 * added: competitors list both 5/27/25 and 5/29/25 for what was a 3-day giveaway,
 * and asserting the wrong one would be fabrication.
 *
 * Title lives on the inventory item, price on the offer. Verify on the live
 * listing afterwards; REST reporting success is not proof.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BBL-AROZARENA-2025';
const ITEM = '168566579473';
const NEW_PRICE = '19.99';
const NEW_TITLE = '2025 Seattle Mariners Randy Arozarena Bobblehead SGA Giveaway New in Box MLB';

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  console.log(`title (${NEW_TITLE.length}): ${NEW_TITLE}`);
  console.log(`price -> $${NEW_PRICE}`);
  if (!APPLY) { console.log('\ndry run'); return; }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' };

  const inv = await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { headers: auth })).json();
  console.log(`old title: ${inv.product.title}`);
  inv.product.title = NEW_TITLE;
  delete inv.sku;
  const ir = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { method: 'PUT', headers: auth, body: JSON.stringify(inv) });
  console.log('inventory PUT', ir.status, ir.status >= 300 ? await ir.text() : '');

  const offer = (await (await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${SKU}`, { headers: auth })).json()).offers[0];
  console.log(`old price: $${offer.pricingSummary.price.value}  offer ${offer.offerId}`);
  const or = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({
      sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE',
      availableQuantity: offer.availableQuantity, categoryId: offer.categoryId,
      merchantLocationKey: offer.merchantLocationKey, listingDescription: offer.listingDescription,
      listingPolicies: offer.listingPolicies, tax: offer.tax,
      pricingSummary: { price: { value: NEW_PRICE, currency: 'USD' } },
    }),
  });
  console.log('offer PUT', or.status, or.status >= 300 ? await or.text() : '');

  const g = await (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  })).text();
  const pick = (t: string) => g.match(new RegExp(`<${t}[^>]*>([^<]*)<`))?.[1] ?? '?';
  console.log(`\nLIVE ${ITEM}: ${pick('ListingStatus')} | $${pick('CurrentPrice')} | hidden ${pick('HideFromSearch')}`);
  console.log(`  ${pick('Title')}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
