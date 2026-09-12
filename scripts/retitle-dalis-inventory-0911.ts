/**
 * Put BOTH Dalis cards in the title. Inventory API version.
 *
 *   npx tsx scripts/retitle-dalis-inventory-0911.ts           # dry run
 *   npx tsx scripts/retitle-dalis-inventory-0911.ts --apply
 *
 * retitle-dalis-package-0911.ts tried this through the Trading API and eBay
 * refused: "Inventory-based listing management is not currently supported by
 * this tool." This listing was created by the Inventory API, so the title
 * lives on the inventory item's product.title and has to change there.
 *
 * Michael: "the wilder listing only lists one card in the title. 2026 bowman
 * chrome takes up way too many characters let's just use the bcp and we can
 * put both."
 *
 * Old: 2026 Bowman Chrome Wilder Dalis Auto True Purple /250 1st Bowman Color Match
 * 76 characters describing only the certified auto. The IP-signed error card,
 * which is the whole reason this is a package, did not appear at all.
 *
 * Spending "2026 Bowman Chrome" on a set name buys room for the second card's
 * number, the error, and the in-person auto. The word Bowman survives inside
 * "1st Bowman", and the Set aspect still reads 2026 Bowman Chrome for search.
 *
 * Kept deliberately, each has cost traffic before when dropped:
 *   True Purple   the parallel term buyers search
 *   /250 Auto     adjacent, so the serial reads as an autograph
 *   1st Bowman    "holy smokes how does the ebay title not have 1st bowman in it"
 *
 * Reads the live inventory item and changes ONLY product.title, so the price,
 * the Best Offer floor and the description cannot move. Rerunning
 * draft-dalis-package-0911.ts would have reset the price to its constant,
 * which is exactly how $249.99 silently became $299.99 once already.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'DALIS-2AUTO-PKG';
const TITLE = '2026 Wilder Dalis CPA-WD True Purple /250 Auto + BCP-150 Error IP 1st Bowman';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

(async () => {
  if (TITLE.length > 80) throw new Error('title is ' + TITLE.length + ' chars, limit is 80');
  const tok = await userToken();
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const item: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, { headers: H })).json();
  if (!item.product) throw new Error('no inventory item for ' + SKU + ': ' + JSON.stringify(item).slice(0, 300));
  const offers: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + SKU, { headers: H })).json();
  const offer = offers.offers?.[0];
  const priceBefore = offer?.pricingSummary?.price?.value;
  const declineBefore = offer?.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value;

  console.log('old (' + item.product.title.length + '): ' + item.product.title);
  console.log('new (' + TITLE.length + '): ' + TITLE);
  console.log('price $' + priceBefore + ', auto-decline $' + declineBefore + ', listing ' + offer?.listingId);
  console.log('pictures on the item: ' + (item.product.imageUrls?.length ?? 0));
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); return; }

  const body = { ...item, product: { ...item.product, title: TITLE } };
  delete (body as any).sku;
  delete (body as any).locale;
  const put = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  });
  console.log('\nPUT inventory_item: ' + put.status);
  if (put.status >= 400) { console.log(await put.text()); process.exit(1); }

  const after: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, { headers: H })).json();
  const offAfter: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + SKU, { headers: H })).json();
  const o2 = offAfter.offers?.[0];
  console.log('verify title: ' + after.product.title);
  if (after.product.title !== TITLE) throw new Error('title did not take');
  if (o2?.pricingSummary?.price?.value !== priceBefore)
    throw new Error('PRICE MOVED ' + priceBefore + ' -> ' + o2?.pricingSummary?.price?.value);
  if (o2?.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value !== declineBefore)
    throw new Error('auto-decline moved ' + declineBefore + ' -> ' + o2?.listingPolicies?.bestOfferTerms?.autoDeclinePrice?.value);
  console.log('verify price: $' + o2.pricingSummary.price.value + ', auto-decline $' +
    o2.listingPolicies.bestOfferTerms.autoDeclinePrice.value + ', both unchanged');
  console.log('https://www.ebay.com/itm/' + o2.listingId);
})();
