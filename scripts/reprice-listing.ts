/**
 * Reprice one live eBay listing, whichever API created it.
 *
 *   npx tsx scripts/reprice-listing.ts 168573778601 79.99
 *   npx tsx scripts/reprice-listing.ts 168573778601 79.99 --apply
 *
 * Reusable because repricing keeps coming up and the two APIs are not
 * interchangeable: a listing that owns a SKU with a live offer belongs to the
 * Inventory API, and revising it through Trading makes the two drift apart.
 * This detects which one owns the listing and uses that, then re-reads the live
 * listing to prove the price actually moved rather than trusting the response.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { config } from 'dotenv';
config({ path: '.env.local' });

const [, , ITEM, PRICE_ARG] = process.argv;
const APPLY = process.argv.includes('--apply');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}
async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const t = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}
async function look(tok: string) {
  const g = await trading(tok, 'GetItem',
    `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
  const q = Number(g.match(/<Quantity>(\d+)</)?.[1] ?? 0), sold = Number(g.match(/<QuantitySold>(\d+)</)?.[1] ?? 0);
  return {
    status: g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?',
    price: g.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1] ?? '?',
    sku: g.match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '',
    title: g.match(/<Title>([^<]*)</)?.[1] ?? '',
    avail: Math.max(0, q - sold),
    ship: g.match(/<ShippingProfileName>([^<]*)</)?.[1] ?? '?',
    free: /<FreeShipping>true/.test(g),
  };
}

async function main() {
  const price = Number(PRICE_ARG);
  if (!/^\d+$/.test(ITEM ?? '') || !(price > 0)) {
    console.error('usage: reprice-listing.ts <itemId> <price> [--apply]'); process.exit(1);
  }
  const tok = await userToken();
  const before = await look(tok);
  console.log(`${ITEM} [${before.status}]  qty ${before.avail}  sku ${before.sku || '(none)'}`);
  console.log(`  ${before.title}`);
  console.log(`  $${before.price} -> $${price.toFixed(2)}   shipping: ${before.ship}${before.free ? '  FREE SHIPPING - CHECK THIS' : ''}`);
  if (before.status !== 'Active') { console.error('  not Active, refusing'); process.exit(1); }
  if (!APPLY) { console.log('\ndry run'); return; }

  let viaInventory = false;
  if (before.sku) {
    try {
      const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(before.sku)}`)).offers?.[0];
      if (offer) {
        await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
          availableQuantity: offer.availableQuantity, categoryId: offer.categoryId,
          listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
          listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
          pricingSummary: { price: { value: price.toFixed(2), currency: 'USD' } },
          tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
        });
        viaInventory = true;
        console.log('  repriced through the Inventory API');
      }
    } catch { /* fall through */ }
  }
  if (!viaInventory) {
    const res = await trading(tok, 'ReviseFixedPriceItem',
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
      `<StartPrice>${price.toFixed(2)}</StartPrice></Item></ReviseFixedPriceItemRequest>`);
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    console.log(`  repriced through Trading -> ${ack}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('     ', m[1].slice(0, 150));
    if (ack !== 'Success' && ack !== 'Warning') process.exit(1);
  }

  const after = await look(tok);
  console.log(`  live now $${after.price}, qty ${after.avail}, shipping ${after.ship}${after.free ? '  FREE SHIPPING' : ''}`);
  if (Number(after.price) !== price) { console.error('  PRICE DID NOT TAKE'); process.exit(1); }
  console.log('  verified');
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
