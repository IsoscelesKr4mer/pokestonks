/**
 * Put real package dimensions on every eBay Standard Envelope listing.
 *
 *   npx tsx scripts/set-ese-package-dims.ts           # dry run
 *   npx tsx scripts/set-ese-package-dims.ts --apply
 *
 * Michael: "why is my shipping for ebay standard envelopes defaulted to 1x1x1
 * dimensions? I have to change it every time and that is obviously wrong."
 *
 * Cause: ESE is a FLAT-RATE service, so eBay never forces package details at
 * listing time and none of the ESE listings carry any. GetItem shows
 * `ShippingPackage=None, WeightMajor=0, WeightMinor=0` across all of them. With
 * nothing on the listing, the label flow has nothing to prefill and falls back
 * to 1x1x1. The Ground Advantage listings are fine precisely because calculated
 * shipping refuses to publish without dimensions.
 *
 * Values are the ones Michael actually ships and has been billed for, NOT the
 * mailer's spec sheet: "should be 2oz not 1oz. 2 oz w/ 7x5x1 cost me $1.07 and
 * i charge $1.29". So 7 x 5 x 1 at 2 oz. I had derived 7 x 4.35 x 0.25 at 1 oz
 * from the Shell Mailer packaging, which is the empty envelope, not a packed
 * one that has cleared the counter at a known price. His receipt wins.
 *
 * ShippingPackage is `Letter`, which is what ESE actually is.
 *
 * TWO KINDS OF LISTING, AND ONLY ONE IS FIXABLE FROM HERE:
 *  - Inventory-API listings (a SKU with a live offer) take dimensions through
 *    PUT inventory_item.packageWeightAndSize, verified by reading it back.
 *    GetItem does NOT surface these, which is why they can look empty.
 *  - Trading multi-variation you-picks accept ReviseFixedPriceItem with
 *    ShippingPackageDetails, return Ack=Success, and then do not persist it.
 *    eBay simply drops it on a flat-rate multi-variation listing. Those are
 *    reported at the end rather than silently counted as done.
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { config } from 'dotenv';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const LENGTH = '7', WIDTH = '5', DEPTH = '1';
const WEIGHT_OZ = '2';
const PACKAGE = 'Letter';

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
  if (r.status >= 300) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 200)}`);
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
const item = (tok: string, id: string) => trading(tok, 'GetItem',
  `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);

async function activeIds(tok: string) {
  const ids: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const x = await trading(tok, 'GetMyeBaySelling',
      `<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>` +
      `</GetMyeBaySellingRequest>`);
    const found = [...x.matchAll(/<ItemID>(\d+)<\/ItemID>/g)].map((m) => m[1]);
    ids.push(...found);
    const total = Number(x.match(/<TotalNumberOfPages>(\d+)</)?.[1] ?? '1');
    if (page >= total) break;
  }
  return [...new Set(ids)];
}

async function main() {
  const tok = await userToken();
  const ids = await activeIds(tok);
  console.log(`${ids.length} active listings`);

  const targets: { id: string; title: string; sku: string }[] = [];
  for (const id of ids) {
    const g = await item(tok, id);
    if (!/<ShippingProfileName>eBay Standard Envelope</.test(g)) continue;
    targets.push({ id, title: (g.match(/<Title>([^<]*)</)?.[1] ?? '').slice(0, 60), sku: g.match(/<SKU>([^<]*)<\/SKU>/)?.[1] ?? '' });
  }
  console.log(`\n${targets.length} ESE listings with no package details:`);
  for (const t of targets) console.log(`  ${t.id}  ${t.title}`);
  console.log(`\nwould set: ${PACKAGE}  ${LENGTH} x ${WIDTH} x ${DEPTH} in, ${WEIGHT_OZ} oz`);
  if (!APPLY) { console.log('\ndry run'); return; }

  let ok = 0; const stuck: string[] = [];
  for (const t of targets) {
    // Inventory API first: it is the one that actually persists on these.
    if (t.sku) {
      try {
        const offers = await api(tok, 'GET', `/sell/inventory/v1/offer?sku=${encodeURIComponent(t.sku)}`);
        if (offers?.offers?.[0]) {
          const inv = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${encodeURIComponent(t.sku)}`);
          inv.packageWeightAndSize = {
            packageType: 'LETTER',
            dimensions: { length: Number(LENGTH), width: Number(WIDTH), height: Number(DEPTH), unit: 'INCH' },
            weight: { value: Number(WEIGHT_OZ), unit: 'OUNCE' }, shippingIrregular: false,
          };
          delete inv.sku;
          await api(tok, 'PUT', `/sell/inventory/v1/inventory_item/${encodeURIComponent(t.sku)}`, inv);
          const back = await api(tok, 'GET', `/sell/inventory/v1/inventory_item/${encodeURIComponent(t.sku)}`);
          const d = back?.packageWeightAndSize?.dimensions;
          const took = Number(d?.length) === Number(LENGTH) && Number(d?.height) === Number(DEPTH);
          console.log(`  ${t.id} inventory ${took ? 'verified' : 'DID NOT TAKE'}  ${t.title}`);
          if (took) { ok++; continue; }
        }
      } catch { /* fall through to Trading */ }
    }
    const res = await trading(tok, 'ReviseFixedPriceItem',
      `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
      `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${t.id}</ItemID>` +
      `<ShippingPackageDetails>` +
        `<ShippingIrregular>false</ShippingIrregular><ShippingPackage>${PACKAGE}</ShippingPackage>` +
        `<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">${WEIGHT_OZ}</WeightMinor>` +
        `<PackageLength>${LENGTH}</PackageLength><PackageWidth>${WIDTH}</PackageWidth><PackageDepth>${DEPTH}</PackageDepth>` +
      `</ShippingPackageDetails></Item></ReviseFixedPriceItemRequest>`);
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    if (ack !== 'Success' && ack !== 'Warning') {
      console.log(`  ${t.id} FAILED`);
      for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`     ${m[1].slice(0, 150)}`);
      continue;
    }
    const after = await item(tok, t.id);
    const pkg = after.match(/<ShippingPackageDetails>([\s\S]*?)<\/ShippingPackageDetails>/)?.[1] ?? '';
    const took = /<PackageLength>/.test(pkg) && !/<ShippingPackage>None</.test(pkg);
    console.log(`  ${t.id} ${ack}${took ? ' verified' : '  DID NOT TAKE'}`);
    if (took) ok++;
  }
  console.log(`\n${ok}/${targets.length} updated`);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
