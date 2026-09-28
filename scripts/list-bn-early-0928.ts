/**
 * List the three Barnes & Noble early-release boxes, in hand before street date.
 *
 *   npx tsx scripts/list-bn-early-0928.ts            # verify only
 *   npx tsx scripts/list-bn-early-0928.ts --apply    # list
 *
 * [voice] "Barnes & Noble put out all these boxes early... All of these have a
 * release date and a street date of Wednesday the 30th. I bought these today...
 * I just bought two boxes of each to see how easy we could sell these on eBay
 * because we have them in hand right now. And most of the ones on eBay are like
 * pre-sales. So I want you to list these aggressively on eBay with the Ships
 * Today or Ships Now label. Price them to sell. and see if we can flip these and
 * see if it's worth buying more tomorrow before they release on Wednesday."
 *
 * THE WHOLE EDGE IS THE STREET DATE, and it expires Wednesday 09-30. Nobody
 * else can ship until then, so IN HAND and SHIPS TODAY go in the TITLE, not the
 * description ([[feedback_premium_must_be_in_title_and_thumbnail]]). Same play
 * that worked on the 09-14 Bowman Chrome mega.
 *
 * Priced at or under the 25th percentile of a board that is almost entirely
 * presale, because the experiment he is running is velocity, not margin:
 *
 *                      asks  presale   25th     MED     ask
 *   FB Mega Box         74   nearly all  94.98  109.94   99.99
 *   FB Blaster/Value    25   nearly all  50.00   55.00   49.99
 *   Star Wars Chrome    24   17 of 24    51.00   59.99   49.99
 *
 * COMBINED SHIPPING ON ALL THREE because each is quantity 2. Add silently drops
 * the block, so it goes on by Revise afterwards and is read back
 * ([[reference_combined_shipping_is_settable]]).
 *
 * UPCs read off the back panels, all three check-digit verified:
 *   FB Blaster   887521163236
 *   FB Mega      887521163281
 *   Star Wars    887521161195
 *
 * NO CARD OR PACK COUNTS ON THE FOOTBALL BOXES. eBay sellers say 42 and 60, but
 * neither panel states it and a seller's title is not a source
 * ([[feedback_no_fabricated_product_specifics]]). Star Wars does print "32 CARDS
 * PER BOX" and "4 RAYWAVE REFRACTOR CARDS GUARANTEED PER BOX", so that one says
 * it.
 *
 * COST IS NOT KNOWN YET. He did not say what he paid, so nothing is logged to
 * the vault here; that follows when he sends the receipt.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const DIR = 'eBay_assets/iCloud Photos/';
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

type Job = {
  key: string; title: string; price: string; floor: string; upc: string;
  cat: string; photos: string[]; desc: string; specifics: [string, string][];
  pkg: { l: number; w: number; d: number; lb: number; oz: number };
};

const SHIPS = '<p><strong>IN HAND AND SHIPPING TODAY.</strong> This product has a street date of'
  + ' Wednesday, September 30. Most listings you will find for it right now are presales that'
  + ' cannot ship until then. This one is sealed, in hand, and goes out the same business day.</p>';
const TAIL = '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

const JOBS: Job[] = [
  {
    key: 'fbmega', price: '99.99', floor: '88.00', upc: '887521163281', cat: '261332',
    title: '2026 Bowman Football MEGA Box SEALED IN HAND SHIPS TODAY Not Presale Chrome NFL',
    photos: ['Bowman26FB_Mega_01_front.jpg', 'Bowman26FB_Mega_02_back.jpg'],
    pkg: { l: 10, w: 8, d: 4, lb: 1, oz: 8 },
    desc: '<p><strong>2026 Bowman Football Mega Box</strong>, factory sealed, NFL and NFLPA licensed.</p>'
      + '<p>From the box: <strong>exclusive parallels in every box</strong>.</p>' + SHIPS + TAIL,
    specifics: [
      ['Manufacturer', 'Topps'], ['Set', '2026 Bowman Football'], ['Sport', 'Football'],
      ['League', 'National Football League (NFL)'], ['Season', '2026'],
      ['Product', 'Mega Box'], ['Configuration', 'Mega Box'], ['Features', 'Sealed'],
      ['Language', 'English'], ['Country/Region of Manufacture', 'United States'],
    ],
  },
  {
    key: 'fbblaster', price: '49.99', floor: '43.00', upc: '887521163236', cat: '261332',
    title: '2026 Bowman Football Blaster Value Box SEALED IN HAND SHIPS TODAY Not Presale',
    photos: ['Bowman26FB_Blaster_01_front.jpg', 'Bowman26FB_Blaster_02_back.jpg'],
    pkg: { l: 9, w: 7, d: 3, lb: 1, oz: 0 },
    desc: '<p><strong>2026 Bowman Football Value / Blaster Box</strong>, factory sealed, NFL and'
      + ' NFLPA licensed.</p>'
      + '<p>From the box: <strong>look for autograph cards</strong>.</p>' + SHIPS + TAIL,
    specifics: [
      ['Manufacturer', 'Topps'], ['Set', '2026 Bowman Football'], ['Sport', 'Football'],
      ['League', 'National Football League (NFL)'], ['Season', '2026'],
      ['Product', 'Blaster Box'], ['Configuration', 'Blaster Box'], ['Features', 'Sealed'],
      ['Language', 'English'], ['Country/Region of Manufacture', 'United States'],
    ],
  },
  {
    key: 'starwars', price: '49.99', floor: '43.00', upc: '887521161195', cat: '261035',
    title: '2026 Topps Chrome Star Wars Blaster Box SEALED IN HAND SHIPS TODAY Not Presale',
    photos: ['ToppsChrome26_StarWars_Blaster_01_front.jpg', 'ToppsChrome26_StarWars_Blaster_02_back.jpg'],
    pkg: { l: 9, w: 7, d: 3, lb: 1, oz: 0 },
    desc: '<p><strong>2026 Topps Chrome Star Wars Blaster / Value Box</strong>, factory sealed.</p>'
      + '<p>From the box:</p><ul>'
      + '<li><strong>32 cards per box</strong></li>'
      + '<li><strong>4 RayWave Refractor cards guaranteed per box</strong></li></ul>' + SHIPS + TAIL,
    specifics: [
      ['Franchise', 'Star Wars'], ['Manufacturer', 'Topps'],
      ['Set', '2026 Topps Chrome Star Wars'], ['Year Manufactured', '2026'],
      ['Product', 'Blaster Box'], ['Configuration', 'Blaster Box'], ['Features', 'Sealed'],
      ['Type', 'Trading Card Box'], ['Language', 'English'],
      ['Country/Region of Manufacture', 'United States'],
    ],
  },
];

async function token() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const j: any = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(fk(cfg, 'EBAY_CLIENT_ID') + ':' + fk(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!)
      + '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function eps(tok: string, path: string, name: string) {
  const jpeg = await sharp(readFileSync(path)).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml = '<?xml version="1.0" encoding="utf-8"?><UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<PictureName>' + name + '</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>';
  const head = Buffer.from('--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n'
    + '--' + B + '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
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
  const tok = await token();
  const call = async (n: string, b: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': n, 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + n + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + b + '</' + n + 'Request>',
  })).text();

  for (const job of JOBS) {
    if (job.title.length > 80) throw new Error(job.key + ' title ' + job.title.length + ' chars');
    const pics: string[] = [];
    for (const [i, f] of job.photos.entries()) {
      const u = await eps(tok, DIR + f, job.key + '_' + (i + 1));
      if (!u) throw new Error('EPS failed for ' + f);
      pics.push(u);
    }

    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + job.desc + ']]></Description>'
      + '<PrimaryCategory><CategoryID>' + job.cat + '</CategoryID></PrimaryCategory>'
      + '<ProductListingDetails><UPC>' + job.upc + '</UPC></ProductListingDetails>'
      + '<ConditionID>1000</ConditionID>'
      + '<StartPrice>' + job.price + '</StartPrice><Quantity>2</Quantity>'
      + '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
      + '<ListingDetails><MinimumBestOfferPrice>' + job.floor + '</MinimumBestOfferPrice></ListingDetails>'
      + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
      + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
      + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>269110723012</ShippingProfileID></SellerShippingProfile>'
      + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
      + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
      + '<ItemSpecifics>' + job.specifics
        .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
      + '</ItemSpecifics>'
      + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
      + '<ShippingPackageDetails><PackageLength>' + job.pkg.l + '</PackageLength>'
      + '<PackageWidth>' + job.pkg.w + '</PackageWidth><PackageDepth>' + job.pkg.d + '</PackageDepth>'
      + '<WeightMajor unit="lbs">' + job.pkg.lb + '</WeightMajor>'
      + '<WeightMinor unit="oz">' + job.pkg.oz + '</WeightMinor></ShippingPackageDetails>'
      + '</Item>';

    const v = await call('VerifyAddFixedPriceItem', item);
    const ok = !/<Ack>Failure</.test(v);
    console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  ' + job.key + '  $' + job.price + ' x2  floor $'
      + job.floor + '  cat ' + job.cat + '  title ' + job.title.length);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
    if (!APPLY || !ok) continue;

    const a = await call('AddFixedPriceItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    if (!id) {
      for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ! ' + m[1].slice(0, 190));
      continue;
    }
    console.log('   -> https://www.ebay.com/itm/' + id);

    // Add drops this silently; Revise is the call that takes
    await call('ReviseFixedPriceItem',
      '<Item><ItemID>' + id + '</ItemID><ShippingDetails>'
      + '<ApplyShippingDiscount>true</ApplyShippingDiscount>'
      + '<ShippingDiscountProfileID>1423939012</ShippingDiscountProfileID></ShippingDetails></Item>');
    const g = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const gg = (t: string) => g.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    console.log('      ' + gg('ListingStatus') + '  $' + gg('CurrentPrice') + '  qty ' + gg('Quantity')
      + '  UPC ' + gg('UPC') + '  combined=' + gg('ApplyShippingDiscount'));
  }
})();
