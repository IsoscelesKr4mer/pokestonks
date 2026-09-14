/**
 * List 7 of the 10 Bowman Chrome megas, in hand, ahead of the 09-23 release.
 *
 *   npx tsx scripts/list-bowman-chrome-mega-0914.ts            # dry run
 *   npx tsx scripts/list-bowman-chrome-mega-0914.ts --apply    # publishes
 *
 * Michael: "List 7 in hand and publish. These don't get released until 9/23
 * so we're super early."
 *
 * 7 of 10 at $99.99, keeping 3 to rip. At $99.99 the seven bring back about
 * $580 against the $553.40 he paid for all ten, so the three he tears are
 * free with roughly $27 to spare. Selling 6 and ripping 4 needed $111 a box,
 * which is above the 75th percentile of the board and would sit.
 *
 * The whole reason this works is that almost every competing listing is a
 * presale for 09-23 and these are physically here, so IN HAND and Ships Now
 * are in the title rather than buried in the description. That edge expires
 * on release day.
 *
 * Photos are Michael's own, IMG_4221 front and IMG_4222 back, uploaded to
 * eBay EPS. UPC 887521163625 read off the back of the box and matching the
 * Fred Meyer receipt SKU 88752116362.
 *
 * Shape copied from the NBA mega listing that already works: category 261332,
 * condition NEW, the edmonds-wa location and his three business policies.
 * packageWeightAndSize carries no packageType, which is what breaks publish.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { preflight, assertPreflight } from './lib/preflight';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SKU = 'BOWCH26-MEGA';
const QTY = 7;
const PRICE = '99.99';
const CATALOG = 135610;
const UPC = '887521163625';
const TITLE = '2026 Bowman Chrome Baseball Mega Box SEALED IN HAND Ships Now 6 Packs 36 Cards';

const PHOTOS = [
  'C:/Users/Michael/.claude/channels/discord/inbox/1789422576410-1549175264511004852.jpg',
  'C:/Users/Michael/.claude/channels/discord/inbox/1789422576597-1549175264842358844.jpg',
];

const DESC =
  '<p>2026 Bowman Chrome Baseball Mega Box. Factory sealed.</p>' +
  '<p>In hand and ships now. This product does not release until September 23, so most listings you will see are presale. These are physically here.</p>' +
  '<p>6 packs per box, 6 cards per pack, 36 cards total. Packs containing a special insert may hold fewer cards, per the box.</p>' +
  '<p>Ships within 1 business day.</p>' +
  '<p>Buying several? Add them all to your cart and they ship together.</p>' +
  '<p>Smoke-free home. Thanks for looking.</p>';

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function retry<T>(f: () => Promise<T>, n = 4): Promise<T> {
  let e: any;
  for (let i = 0; i < n; i++) { try { return await f(); } catch (err) { e = err; await new Promise((r) => setTimeout(r, 1500 * (i + 1))); } }
  throw e;
}

async function userToken(scope: string) {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await retry(async () => (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent(scope),
  })).json());
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token as string;
}

async function eps(tok: string, file: string, name: string) {
  const jpeg = await sharp(readFileSync(file)).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<PictureName>' + name + '</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>';
  const head = Buffer.from('--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\n' +
    'Content-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n--' + B +
    '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\n' +
    'Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
  const t: string = await retry(async () => {
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': 'multipart/form-data; boundary=' + B,
      },
      body: Buffer.concat([head, jpeg, Buffer.from('\r\n--' + B + '--\r\n', 'utf8')]),
    });
    return r.text();
  });
  const url = t.match(/<FullURL>([^<]*)</)?.[1];
  if (!url) throw new Error('EPS upload failed for ' + name + ': ' + t.slice(0, 300));
  return url;
}

(async () => {
  const tok = await userToken('https://api.ebay.com/oauth/api_scope/sell.inventory');
  const H = {
    Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Accept: 'application/json',
    'Accept-Language': 'en-US', 'Content-Language': 'en-US',
  };

  const [lot]: any = await sql`select p.id, p.quantity, p.cost_cents,
      coalesce((select count(*) from rips r where r.source_purchase_id=p.id),0)
      + coalesce((select count(*) from box_decompositions b where b.source_purchase_id=p.id),0)
      + coalesce((select sum(s.quantity) from sales s where s.purchase_id=p.id),0) used
    from purchases p where p.catalog_item_id = ${CATALOG} and p.deleted_at is null order by p.id limit 1`;
  const onHand = lot.quantity - Number(lot.used);
  console.log('on hand: ' + onHand + ' @ $' + (lot.cost_cents / 100).toFixed(2) + '   listing ' + QTY + ', keeping ' + (onHand - QTY) + ' to rip');
  if (QTY > onHand) throw new Error('only ' + onHand + ' on hand');

  console.log('\nuploading photos...');
  const imageUrls: string[] = [];
  for (let i = 0; i < PHOTOS.length; i++) imageUrls.push(await eps(tok, PHOTOS[i], 'bowch26mega_' + (i === 0 ? 'front' : 'back')));
  imageUrls.forEach((u) => console.log('   ' + u));

  const pf = await preflight({
    sku: SKU, title: TITLE, priceCents: 9999, costCentsPerUnit: lot.cost_cents,
    unitsPerListing: 1, upc: UPC, imageUrls,
  });
  console.log('\npreflight: ' + (pf.ok ? 'ok' : 'FAILED'));
  pf.errors.forEach((e) => console.log('   ERROR ' + e));
  pf.warnings.forEach((w) => console.log('   warn  ' + w));
  assertPreflight(SKU, pf);

  console.log('\ntitle (' + TITLE.length + '): ' + TITLE);
  console.log('price $' + PRICE + ' x ' + QTY);
  if (!APPLY) { console.log('\nDRY RUN, pass --apply to publish'); await sql.end(); return; }

  const item = {
    availability: { shipToLocationAvailability: { quantity: QTY } },
    condition: 'NEW',
    packageWeightAndSize: {
      dimensions: { width: 8, length: 8, height: 4, unit: 'INCH' },
      weight: { value: 12, unit: 'OUNCE' },
      shippingIrregular: false,
    },
    product: {
      title: TITLE, description: DESC, imageUrls, upc: [UPC],
      aspects: {
        Sport: ['Baseball'],
        League: ['Major League Baseball (MLB)'],
        Autographed: ['No'],
        Set: ['2026 Bowman Chrome'],
        Configuration: ['Box'],
        'Number of Cards': ['36'],
        Manufacturer: ['Topps'],
        'Number of Boxes': ['1'],
        'Year Manufactured': ['2026'],
        Features: ['Sealed'],
      },
    },
  };
  let r = await fetch('https://api.ebay.com/sell/inventory/v1/inventory_item/' + SKU, {
    method: 'PUT', headers: H, body: JSON.stringify(item),
  });
  console.log('\nPUT inventory_item: ' + r.status);
  if (r.status >= 400) { console.log(await r.text()); process.exit(1); }

  const existing: any = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer?sku=' + SKU, { headers: H })).json();
  let offerId = existing.offers?.[0]?.offerId;
  const offer = {
    sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: QTY,
    categoryId: '261332', merchantLocationKey: 'edmonds-wa',
    listingDescription: DESC,
    listingPolicies: {
      paymentPolicyId: '269110704012',
      returnPolicyId: '269110705012',
      fulfillmentPolicyId: '269110723012',
    },
    pricingSummary: { price: { value: PRICE, currency: 'USD' } },
  };
  if (offerId) {
    const b: any = { ...offer }; delete b.sku; delete b.marketplaceId; delete b.format;
    r = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + offerId, { method: 'PUT', headers: H, body: JSON.stringify(b) });
    console.log('PUT offer ' + offerId + ': ' + r.status);
  } else {
    r = await fetch('https://api.ebay.com/sell/inventory/v1/offer', { method: 'POST', headers: H, body: JSON.stringify(offer) });
    const j: any = await r.json();
    offerId = j.offerId;
    console.log('POST offer: ' + r.status + '  ' + offerId);
    if (r.status >= 400) { console.log(JSON.stringify(j).slice(0, 600)); process.exit(1); }
  }

  r = await fetch('https://api.ebay.com/sell/inventory/v1/offer/' + offerId + '/publish', { method: 'POST', headers: H });
  const pub: any = await r.json().catch(() => ({}));
  console.log('publish: ' + r.status + '  listingId ' + (pub.listingId ?? '(none returned)'));
  if (r.status >= 400) console.log(JSON.stringify(pub).slice(0, 700));

  // the Inventory API lies about its own publishes, so confirm with Trading
  const ttok = await userToken('https://api.ebay.com/oauth/api_scope/sell.inventory');
  const listingId = pub.listingId;
  if (listingId) {
    const x: string = await retry(async () => {
      const g = await fetch('https://api.ebay.com/ws/api.dll', {
        method: 'POST',
        headers: {
          'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': ttok, 'Content-Type': 'text/xml',
        },
        body: '<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
          '<ItemID>' + listingId + '</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>',
      });
      return g.text();
    });
    console.log('\nVERIFIED LIVE');
    console.log('  title  ' + x.match(/<Title>([^<]*)</)?.[1]);
    console.log('  price  $' + x.match(/<StartPrice[^>]*>([\d.]+)</)?.[1]);
    console.log('  qty    ' + x.match(/<Quantity>(\d+)</)?.[1]);
    console.log('  status ' + x.match(/<ListingStatus>(\w+)</)?.[1]);
    console.log('  UPC    ' + x.match(/<UPC>([^<]*)</)?.[1]);
    console.log('  https://www.ebay.com/itm/' + listingId);

    const [{ user_id }]: any = await sql`select user_id from purchases order by id desc limit 1`;
    await sql`insert into ebay_listing_mappings (user_id, ebay_item_id, mappings)
      values (${user_id}, ${listingId}, ${JSON.stringify([{ qty: 1, catalogItemId: CATALOG }])}::jsonb)`;
    console.log('  mapped in ebay_listing_mappings, qty 1 per listing unit');
  }
  await sql.end();
})();
