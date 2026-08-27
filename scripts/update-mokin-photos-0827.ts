/**
 * Swap the live MOKiN listing over to the square crops.
 *
 * eBay copies images to its own CDN at publish time and keys off the source
 * URL, so re-uploading to the same Supabase path would leave the listing
 * showing the old shots. The crops are hosted under _sq names for exactly that
 * reason, and this points the inventory item at them.
 *
 * Read-modify-write so nothing but imageUrls changes, then verify against the
 * Trading API, which is the only thing that reports what buyers actually see.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const SKU = 'MOKIN-MOTB0101-TB4';
const ITEM = '168644337111';
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings';
const NAMES = [
  'MOKiN_MOTB0101_01_kit_sq.jpg',
  'MOKiN_MOTB0101_02_box_front_sq.jpg',
  'MOKiN_MOTB0101_03_spec_label_sq.jpg',
  'MOKiN_MOTB0101_04_box_contents_sq.jpg',
];

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(find(cfg, 'EBAY_USER_REFRESH_TOKEN')!)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory')}`,
  })).json()).access_token;
  const auth = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', 'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json' };

  const urls = NAMES.map((n) => `${BASE}/${n}`);
  for (const u of urls) {
    const h = await fetch(u, { method: 'HEAD' });
    console.log(`  ${h.status} ${u.split('/').pop()}`);
    if (!h.ok) { console.error('photo not reachable, aborting'); process.exit(1); }
  }

  const item = await (await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { headers: auth })).json();
  item.product.imageUrls = urls;
  delete item.sku;
  const up = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, { method: 'PUT', headers: auth, body: JSON.stringify(item) });
  console.log(`inventory PUT ${up.status}${up.status >= 300 ? ' ' + (await up.text()).slice(0, 400) : ''}`);

  const xml = `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><RequesterCredentials><eBayAuthToken>${tok}</eBayAuthToken></RequesterCredentials><ItemID>${ITEM}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`;
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: { 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-CALL-NAME': 'GetItem', 'Content-Type': 'text/xml' },
    body: xml,
  });
  const t = await r.text();
  const status = t.match(/<ListingStatus>([^<]*)</)?.[1] ?? '-';
  const pics = (t.match(/<PictureURL>[^<]*<\/PictureURL>/g) ?? []).length;
  const ext = t.match(/<ExternalPictureURL>([^<]*)</)?.[1] ?? '-';
  console.log(`\nlive: ${status}, ${pics} photos`);
  console.log(`first source: ${ext.split('/').pop()}`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
