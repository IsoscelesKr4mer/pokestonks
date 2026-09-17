/**
 * The Wilder Dalis two-autograph package: the in-person signed BCP-150 error
 * card plus the Topps certified CPA-WD True Purple Refractor /250.
 *
 *   npx tsx scripts/draft-dalis-package-0911.ts          # show the draft
 *   npx tsx scripts/draft-dalis-package-0911.ts --apply  # create it, UNPUBLISHED
 *
 * Creates an inventory item and an offer and STOPS. Publishing is a separate
 * script and needs Michael's explicit go-ahead.
 *
 * Photos are uploaded to eBay EPS from local originals, so Supabase being over
 * quota is irrelevant. Two of the five had to be recovered rather than
 * re-shot: the signed BCP-150 front is IMG_1616 from the 2026-08-16 in-person
 * session, traced through log-ip-autos-0816.ts, and the BCP-150 back is
 * IMG_0727 from the original drop. Both were in eBay_assets/_originals.
 *
 * Both card rows point at this one listing, the same way the you-pick works.
 * That is not the duplicate case the duplicate_of_id guard exists for; these
 * are two different cards sold together.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const SKU = 'DALIS-2AUTO-PKG';
// Repriced 2026-09-11 to $249.99 with a much lower Best Offer floor. This
// constant MUST track the live price: rerunning this script PUTs the offer and
// will silently reset whatever the listing is currently at. It did exactly that
// once, reverting a reprice back to $299.99 during an unrelated title edit.
const PRICE = 24999;
const DECLINE = 16500;   // deliberately low; a 75% floor was silently bouncing every offer
const IP_ROW = 192, CERT_ROW = 566;
const CACHE = 'scripts/_dalis_eps.json';

const PHOTOS: [string, string][] = [
  ['eBay_assets/dalis_side_by_side.jpg', 'both cards side by side, cropped'],
  ['eBay_assets/card drop/IMG_4078.JPG', 'CPA-WD front, certified auto 241/250'],
  ['eBay_assets/card drop/IMG_4089.JPG', 'CPA-WD back, Topps authenticity statement'],
  ['eBay_assets/_originals/baseball_0816/IMG_1616.JPEG', 'BCP-150 signed in purple'],
  ['eBay_assets/_originals/IMG_0727.JPEG', 'BCP-150 back, shows BCP-150 and 1st Bowman'],
];

const TITLE = '2026 Bowman Chrome Wilder Dalis Auto True Purple /250 1st Bowman Color Match';

const DESC = [
  '<p><b>Two Wilder Dalis autographs. Colorado Rockies shortstop.</b></p>',
  '<p><b>2026 Bowman #BCP-150 Mojo Refractor, signed in person.</b> This is the May release and it was his 1st Bowman card. It carries the wrong player photo, which is why Topps gave him a second 1st Bowman in the September Bowman Chrome release as #BCP-188. Both checklists are public if you want to confirm it: the May product runs chrome prospects BCP-1 to BCP-150, and Bowman Chrome runs BCP-151 to BCP-250.</p>',
  '<p>I got this one signed in person at an Everett AquaSox game on August 16 2026. Dalis was there with the visiting Spokane Indians, the Colorado Rockies High-A affiliate. He looked at the card as he signed it and indicated the photo was not him. He signed in purple, a Rockies color match. I watched him sign it and I guarantee it passes any authentication service.</p>',
  '<p><b>2026 Bowman Chrome Prospect Autographs #CPA-WD, True Purple Refractor, numbered 241/250.</b> On-card signature certified by Topps, from the September release. A purple parallel on a Rockies prospect, so this one is a color match as well.</p>',
  '<p>The card he says is not him, signed by him, next to his certified autograph on the reissue.</p>',
  '<p>Both cards are raw and ungraded, near mint or better. They ship together in penny sleeves and toploaders, protected between rigid cardboard, with tracking. Ships within 1 business day.</p>',
  '<p>Smoke-free home. Thanks for looking.</p>',
].join('');

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function eps(tok: string, file: string, name: string) {
  const jpeg = await sharp(readFileSync(file)).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 }).toBuffer();
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<PictureName>' + name + '</PictureName><PictureSet>Supersize</PictureSet>' +
    '</UploadSiteHostedPicturesRequest>';
  const head = Buffer.from(
    '--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n' +
    '--' + B + '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'multipart/form-data; boundary=' + B,
    },
    body: Buffer.concat([head, jpeg, Buffer.from('\r\n--' + B + '--\r\n', 'utf8')]),
  });
  return (await r.text()).match(/<FullURL>([^<]*)</)?.[1] ?? null;
}

(async () => {
  const missing = PHOTOS.filter(([f]) => !existsSync(f));
  if (missing.length) { missing.forEach(([f]) => console.log('MISSING ' + f)); await sql.end(); return; }

  console.log('title (' + TITLE.length + ' chars): ' + TITLE);
  console.log('price  $' + (PRICE / 100).toFixed(2) + '   Best Offer auto-decline $' + (DECLINE / 100).toFixed(2));
  console.log('photos:');
  PHOTOS.forEach(([f, d]) => console.log('   ' + d.padEnd(42) + f.replace('eBay_assets/', '')));
  const net = PRICE / 100 * 0.847;
  console.log('net at full ask after eBay fees: $' + net.toFixed(2) + '   (box cost $332.00)');
  if (TITLE.length > 80) { console.log('>>> TITLE TOO LONG'); await sql.end(); return; }
  if (!APPLY) { console.log('\nDRY RUN, pass --apply to create the draft (still unpublished)'); await sql.end(); return; }

  const tok = await userToken();
  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const urls: string[] = [];
  for (const [f, d] of PHOTOS) {
    if (!cache[f]) {
      const u = await eps(tok, f, 'dalis_pkg_' + urls.length);
      if (!u) { console.log('EPS failed: ' + f); await sql.end(); return; }
      cache[f] = u;
      writeFileSync(CACHE, JSON.stringify(cache, null, 1));
    }
    urls.push(cache[f]);
    console.log('photo ok  ' + d);
  }

  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json',
    Accept: 'application/json', 'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };
  const inv = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, {
    method: 'PUT', headers: H,
    body: JSON.stringify({
      locale: 'en_US', condition: 'USED_VERY_GOOD',
      conditionDescriptors: [{ name: '40001', values: ['400010'] }],
      packageWeightAndSize: {
        dimensions: { width: 4, length: 6, height: 1, unit: 'INCH' },
        weight: { value: 3, unit: 'OUNCE' }, shippingIrregular: false,
      },
      availability: { shipToLocationAvailability: { quantity: 1 } },
      product: {
        title: TITLE, description: DESC, imageUrls: urls,
        aspects: {
          Sport: ['Baseball'], League: ['Major League Baseball (MLB)'],
          Type: ['Sports Trading Card'], Set: ['2026 Bowman Chrome'],   // eBay allows exactly one Set value; the title carries both product names Season: ['2026'],
          Manufacturer: ['Bowman'], Player: ['Wilder Dalis'], Team: ['Colorado Rockies'],
          'Card Number': ['BCP-150, CPA-WD'], Grade: ['Ungraded'], Graded: ['No'],
          Vintage: ['No'], Autographed: ['Yes'],
          'Parallel/Variety': ['Mojo Refractor, True Purple Refractor /250'],
          Features: ['Autograph', '1st Bowman', 'Serial Numbered', 'Refractor'],
        },
      },
    }),
  });
  if (!inv.ok && inv.status !== 204) { console.log('inventory ' + inv.status + ': ' + (await inv.text()).slice(0, 300)); await sql.end(); return; }

  // Re-runnable: the inventory item PUT above is how a corrected title or
  // description gets pushed, but POSTing an offer that already exists fails
  // with "Offer entity already exists". Reuse the existing offer id.
  const existing: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + SKU, { headers: H })).json();
  const prior = (existing.offers || [])[0];
  const off = await fetch('https://api.ebay.com/sell/inventory/v1/offer' + (prior ? '/' + prior.offerId : ''), {
    method: prior ? 'PUT' : 'POST', headers: H,
    body: JSON.stringify({
      sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1,
      categoryId: '261328', merchantLocationKey: 'edmonds-wa', listingDescription: DESC,
      listingPolicies: {
        paymentPolicyId: '269110704012', returnPolicyId: '269110705012',
        fulfillmentPolicyId: '269110723012', eBayPlusIfEligible: false,
        bestOfferTerms: { bestOfferEnabled: true, autoDeclinePrice: { value: (DECLINE / 100).toFixed(2), currency: 'USD' } },
      },
      pricingSummary: { price: { value: (PRICE / 100).toFixed(2), currency: 'USD' } },
      tax: { applyTax: false },
    }),
  });
  const oj: any = await off.json().catch(() => (prior ? { offerId: prior.offerId } : {}));
  if (!oj.offerId && prior) oj.offerId = prior.offerId;
  if (!oj.offerId) { console.log('offer failed: ' + JSON.stringify(oj).slice(0, 400)); await sql.end(); return; }

  await sql`UPDATE baseball_cards SET asking_price_cents = ${PRICE}, status = 'priced', updated_at = now()
    WHERE id = ${IP_ROW} AND asking_price_cents IS DISTINCT FROM ${PRICE}`;
  console.log('\noffer ' + oj.offerId + ' created, UNPUBLISHED. Nothing is visible to buyers.');
  await sql.end();
})();
