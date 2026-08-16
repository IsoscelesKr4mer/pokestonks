/**
 * Retitle the DR and PE single Booster Bundle listings.
 *
 *   npx tsx scripts/retitle-bundle-listings.ts           # dry run
 *   npx tsx scripts/retitle-bundle-listings.ts --apply
 *
 * The PE title ended in a bare "Scarlet". Michael: "whys the title just say
 * scarlet and not & violet". Because the full set name pushed it to 83 chars
 * against the 80 limit and the tail got trimmed, leaving a dangling word that
 * reads like a broken listing. Trimming a title should never be allowed to cut
 * mid-phrase; the fix is to shorten somewhere harmless instead.
 *
 * Both now follow the house convention already used across listings_v2.md:
 * "Pokemon TCG Scarlet Violet <Set> Booster Bundle Sealed 6 Packs", with no
 * ampersand (eBay search ignores it and it costs two characters) and "6 Packs"
 * rather than "6 Booster Packs" to buy the room.
 *
 *   DR  72 chars, was 76
 *   PE  77 chars, was 74 and truncated
 *
 * These listings were created through the Inventory API, so they are revised
 * through it as well: PUT the inventory item, then PUT the offer to push the
 * change to the live listing. Verified afterwards with Trading GetItem, because
 * the Inventory API has misreported listing state before.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const CHANGES = [
  { sku: 'DR-BUNDLE-SINGLE', item: '168617483804', title: 'Pokemon TCG Scarlet Violet Destined Rivals Booster Bundle Sealed 6 Packs' },
  { sku: 'PE-BUNDLE-SINGLE', item: '168617484171', title: 'Pokemon TCG Scarlet Violet Prismatic Evolutions Booster Bundle Sealed 6 Packs' },
];

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
  const text = await r.text();
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
async function liveTitle(tok: string, item: string) {
  const g = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${item}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`,
  }).then((r) => r.text());
  return { title: g.match(/<Title>([^<]*)</)?.[1] ?? '', status: g.match(/<ListingStatus>([^<]*)</)?.[1] ?? '?' };
}

async function main() {
  const tok = await userToken();
  for (const c of CHANGES) {
    if (c.title.length > 80) { console.error(`${c.sku}: new title is ${c.title.length} chars`); process.exit(1); }
    const before = await liveTitle(tok, c.item);
    console.log(`${c.sku} (${c.item}) [${before.status}]`);
    console.log(`  was: ${before.title}  (${before.title.length})`);
    console.log(`  now: ${c.title}  (${c.title.length})`);
    if (!APPLY) continue;

    const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${c.sku}`);
    inv.product.title = c.title;
    delete inv.sku;
    await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${c.sku}`, inv);

    // pushing the offer is what propagates the change to the live listing
    const offer = (await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${c.sku}`)).offers[0];
    await api(tok, 'PUT', `/sell/inventory/v1/offer/${offer.offerId}`, {
      availableQuantity: offer.availableQuantity, categoryId: offer.categoryId,
      listingDescription: offer.listingDescription, listingDuration: offer.listingDuration,
      listingPolicies: offer.listingPolicies, merchantLocationKey: offer.merchantLocationKey,
      pricingSummary: offer.pricingSummary, tax: offer.tax, format: offer.format ?? 'FIXED_PRICE',
    });

    const after = await liveTitle(tok, c.item);
    console.log(`  live now: ${after.title}`);
    if (after.title !== c.title) { console.error('  TITLE DID NOT TAKE'); process.exit(1); }
    console.log('  verified');
  }
  if (!APPLY) console.log('\ndry run');
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
