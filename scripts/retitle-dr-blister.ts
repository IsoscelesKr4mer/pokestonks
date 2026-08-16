/**
 * Retitle the Destined Rivals checklane blister lot so it can actually be found.
 *
 *   npx tsx scripts/retitle-dr-blister.ts           # dry run
 *   npx tsx scripts/retitle-dr-blister.ts --apply
 *
 * The listing had 0 views. The cause was not price: two-blister lots sold at
 * $24.99 (Aug 12, the same Eevee + Zarude pair) and $30.00 (Aug 8), and this is
 * $27.99, mid-band. The cause was the title missing "Checklane", which is the
 * term this market actually uses. From Michael's own sold search, "Checklane"
 * appears in most of the sold titles:
 *   $16.31  Destined Rivals Checklane Blister Booster Pack - Eevee
 *   $63.99  Eevee Checklane Blister Swirl Lot Of 3
 *   $99.88  Scarlet & Violet - Destined Rivals Checklane Blister - Eevee
 *   $119.99 Scarlet & Violet Destined Rivals Checklane Blister lot of 5
 *   $49.95  Destined Rivals Checklane Blister - Eevee Promo - 4 Packs
 *   $26.01  Eevee SVP 200 Checklane Blister Promo Lot Of 16
 * A listing without the word cannot match a search for it.
 *
 *   was: Pokemon Destined Rivals Blister Lot of 2 Eevee Zarude Promo Coin Sealed  (71)
 *   now: Pokemon TCG Destined Rivals Checklane Blister Lot of 2 Eevee Zarude Sealed  (74)
 *
 * Adds "Checklane" and "TCG", drops "Coin", which nobody searches on. "Swirl" is
 * deliberately NOT added: a swirl lot sold at roughly $21 a blister against ~$16
 * plain, but whether these have swirls has not been confirmed off the cards.
 *
 * Price and quantity are untouched.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168609434868';
const TITLE = 'Pokemon TCG Destined Rivals Checklane Blister Lot of 2 Eevee Zarude Sealed';

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
async function api(tok: string, method: string, path: string, body?: any) {
  const r = await fetch(`https://api.ebay.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const get = (tok: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);

async function main() {
  if (TITLE.length > 80) { console.error(`title is ${TITLE.length} chars`); process.exit(1); }
  const tok = await userToken();
  const g = await get(tok);
  const before = g.match(/<Title>([^<]*)</)?.[1] ?? '';
  const sku = g.match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '';
  const status = g.match(/<ListingStatus>([^<]*)</)?.[1];
  console.log(`${ITEM} [${status}]  price $${g.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}  sku ${sku || '(none)'}`);
  console.log(`  was: ${before}  (${before.length})`);
  console.log(`  now: ${TITLE}  (${TITLE.length})`);
  if (!APPLY) { console.log('\ndry run'); return; }
  if (status !== 'Active') { console.error('not Active, refusing'); process.exit(1); }

  // Prefer the API the listing was created with. A SKU with a live offer means
  // the Inventory API owns it, and revising such a listing through Trading makes
  // the two drift apart.
  let viaInventory = false;
  if (sku) {
    try {
      const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`);
      const offer = offers?.offers?.[0];
      if (offer) {
        const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`);
        inv.product.title = TITLE;
        delete inv.sku;
        await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, inv);
        await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
          availableQuantity: offer.availableQuantity, categoryId: offer.categoryId,
          listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
          listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
          pricingSummary: offer.pricingSummary, tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
        });
        viaInventory = true;
        console.log('  revised through the Inventory API');
      }
    } catch { /* fall through to Trading */ }
  }
  if (!viaInventory) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const res = await trading(tok, 'ReviseFixedPriceItem',
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
      `<Title>${esc(TITLE)}</Title></Item></ReviseFixedPriceItemRequest>`);
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    console.log(`  revised through Trading -> ${ack}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log('     ', m[1].slice(0, 160));
    if (ack !== 'Success' && ack !== 'Warning') process.exit(1);
  }

  const after = await get(tok);
  const now = after.match(/<Title>([^<]*)</)?.[1] ?? '';
  console.log(`  live now: ${now}`);
  console.log(`  price still $${after.match(/<CurrentPrice[^>]*>([^<]*)</)?.[1]}, qty ${after.match(/<Quantity>(\d+)</)?.[1]}`);
  if (now !== TITLE) { console.error('  TITLE DID NOT TAKE'); process.exit(1); }
  console.log('  verified');
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
