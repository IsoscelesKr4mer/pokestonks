/**
 * Build the pick-your-DVD multi-variation listing (Trading API).
 *
 *   npx tsx scripts/build-dvd-pyp-0901.ts           # verify only, creates nothing
 *   npx tsx scripts/build-dvd-pyp-0901.ts --apply   # create the listing
 *
 * Category 617 reports variationsSupported: true, but the aspect metadata says
 * "Movie/TV Title" is REQUIRED and is NOT one of the six variation-enabled
 * aspects (Season, Language, Subtitle Language, Region Code, MPN, Run Time).
 * A pick-your-title listing therefore cannot vary by the aspect that names the
 * thing being sold. The Trading API takes free-text variation names where the
 * Inventory API would not, so this varies by a custom "Movie" specific and
 * leans on VerifyAddFixedPriceItem to say whether eBay actually accepts it.
 * Verify first, always: this is the one question the docs cannot settle.
 *
 * Condition is 5000 "Good", deliberately the conservative call. The only photo
 * shows spines, so nothing about the discs themselves can be claimed; under-
 * promising cannot produce a not-as-described case, over-promising can.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const TITLE = 'DVD Movies You Pick Your Title - Disney Comedy Sports TV - Combined Shipping';
const CATEGORY = '617';
const VARY_BY = 'Movie';
const CONDITION = 5000; // Good
const POLICIES = { ship: '269110723012', ret: '269110705012', pay: '269110704012' };

const DESCRIPTION = [
  '<p><strong>Pick your title from the dropdown above.</strong> Each disc is sold individually and priced on its own.</p>',
  '<p>All titles are pre-owned DVDs in their original cases. Discs show normal shelf wear from storage.</p>',
  '<p><strong>Buying more than one?</strong> Add them to your cart and they ship together in one package.</p>',
  '<p>Ships within 1 business day.</p>',
  '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
].join('');

/** 70% of the median active ask, .99-ended, $3.99 floor. */
function ask(med: number): number {
  const p = Math.max(3.99, Math.round(med * 0.7 * 100) / 100);
  const whole = Math.floor(p);
  return p - whole > 0.5 ? whole + 0.99 : Math.max(3, whole - 1) + 0.99;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  const v = typeof node === 'string' ? esc(node) : String(node);
  return name ? `<${name}>${v}</${name}>` : v;
}
function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token as string;
}

async function call(name: string, tok: string, xmlBody: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body: xmlBody,
  });
  return r.text();
}

async function main() {
  const comps: any[] = JSON.parse(readFileSync('data/dvd_comps_0901.json', 'utf8'));
  const photo = JSON.parse(readFileSync('eBay_assets/dvd_photo_urls.json', 'utf8')) as string[];

  const variations = comps
    .map((c) => ({ label: c.name.slice(0, 50), price: ask(c.med), comp: c.med }))
    .sort((a, b) => b.price - a.price);

  // eBay caps a variation-specific value at 50 chars; a collision would silently
  // merge two movies into one dropdown row.
  const labels = new Set(variations.map((v) => v.label));
  if (labels.size !== variations.length) throw new Error('duplicate variation label after truncation');

  const item: any = {
    Title: TITLE,
    Description: DESCRIPTION,
    PrimaryCategory: { CategoryID: CATEGORY },
    ConditionID: CONDITION,
    Country: 'US', Currency: 'USD',
    Location: 'Edmonds, Washington', PostalCode: '98026',
    DispatchTimeMax: 1,
    ListingDuration: 'GTC',
    ListingType: 'FixedPriceItem',
    SellerProfiles: {
      SellerShippingProfile: { ShippingProfileID: POLICIES.ship },
      SellerReturnProfile: { ReturnProfileID: POLICIES.ret },
      SellerPaymentProfile: { PaymentProfileID: POLICIES.pay },
    },
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Format', Value: 'DVD' },
        { Name: 'Movie/TV Title', Value: 'See dropdown for title' },
        { Name: 'Region Code', Value: 'DVD: 1 (US, Canada...)' },
        { Name: 'Type', Value: 'Movie' },
      ],
    },
    PictureDetails: { PictureURL: photo },
    // Trading API REQUIRES a shipping package; the Inventory API rejects one.
    ShippingPackageDetails: {
      ShippingPackage: 'PackageThickEnvelope',
      PackageLength: 8, PackageWidth: 6, PackageDepth: 2,
      WeightMajor: 0, WeightMinor: 6,
    },
    Variations: {
      VariationSpecificsSet: { NameValueList: [{ Name: VARY_BY, Value: variations.map((v) => v.label) }] },
      Variation: variations.map((v) => ({
        SKU: 'DVD-' + v.label.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30),
        StartPrice: v.price.toFixed(2),
        Quantity: 1,
        VariationSpecifics: { NameValueList: [{ Name: VARY_BY, Value: v.label }] },
      })),
    },
  };

  const skus = new Set(item.Variations.Variation.map((v: any) => v.SKU));
  if (skus.size !== variations.length) throw new Error('duplicate SKU after slugging');

  const body = (call: string) =>
    `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(item, 'Item') + `</${call}Request>`;

  writeFileSync('scripts/_dvd_pyp.json', JSON.stringify(item, null, 1));
  console.log(`${variations.length} variations, total qty ${variations.length}`);
  console.log(`price range $${variations[variations.length - 1].price.toFixed(2)} - $${variations[0].price.toFixed(2)}`);
  console.log(`sum if all sell: $${variations.reduce((a, v) => a + v.price, 0).toFixed(2)}`);
  console.log(`title ${TITLE.length} chars, photos ${photo.length}`);

  const tok = await userToken();
  const vt = await call('VerifyAddFixedPriceItem', tok, body('VerifyAddFixedPriceItem'));
  console.log(`\nVerify: ${vt.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of vt.matchAll(/<(?:Short|Long)Message>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 220)}`);
  const fees = vt.match(/<Name>ListingFee<\/Name><Fee[^>]*>([\d.]+)</)?.[1];
  if (fees) console.log(`  listing fee: $${fees}`);

  if (!APPLY) { console.log('\nverify only, nothing created'); return; }
  if (/<Ack>Failure</.test(vt)) { console.log('\nverify FAILED, not creating'); return; }

  const at = await call('AddFixedPriceItem', tok, body('AddFixedPriceItem'));
  console.log(`\nAdd: ${at.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of at.matchAll(/<(?:Short|Long)Message>([^<]*)</g)) console.log(`  - ${m[1].slice(0, 220)}`);
  const id = at.match(/<ItemID>(\d+)</)?.[1];
  console.log(`ItemID: ${id ?? '(none)'}`);
  if (id) console.log(`https://www.ebay.com/itm/${id}`);
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
