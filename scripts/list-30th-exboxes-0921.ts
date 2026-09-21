/**
 * List the two 30th Celebration ex boxes.
 *
 *   npx tsx scripts/list-30th-exboxes-0921.ts            # verify only
 *   npx tsx scripts/list-30th-exboxes-0921.ts --apply    # list
 *
 * "Okay go ahead and list these with square center cropped images" plus front
 * and back of each box. He took the split: ex boxes to eBay, Knock Outs and
 * Poster Collections to TradePost.
 *
 * Multi-quantity, so this is TWO listings for seven boxes rather than seven
 * listings. Same shape as his DR sleeved lot at qty 10.
 *
 * PRICED OFF EBAY ASKS, and they came in under TCGplayer market on the
 * Greninja, so the earlier $71 edge over TradePost is really about $49:
 *
 *                eBay asks (132/133 live)      TradePost net/u
 *   Greninja     low 48, 25th 56.90, MED 60.00        $44.87
 *   Sylveon      low 43, 25th 60.00, MED 65.00        $40.99
 *
 * Greninja lists at $57.99, between the 25th and the median, because there are
 * five of them to move into a 132-deep book. Sylveon lists at $64.99, just
 * under its median, because there are only two.
 *
 * THE BEST OFFER FLOORS ARE SET OFF TRADEPOST, not off the ask. TradePost was
 * the real alternative, so an accepted offer must never net less than TradePost
 * would have paid:
 *   Greninja floor $53.00 -> net $44.89 vs TradePost $44.87
 *   Sylveon  floor $57.00 -> net $48.28 vs TradePost $40.99
 * A floor of $50 on the Greninja would have netted $42.35 and quietly lost to
 * the channel he turned down.
 *
 * UPCs read off the back panels and check-digit verified. Both print as EAN-13
 * with a leading zero, which is stripped for a US listing:
 *   Greninja  0 196214 158740 -> 196214158740   (box code 10-10463-122)
 *   Sylveon   0 196214 158733 -> 196214158733   (box code 10-10463-121)
 *
 * Shipping is 269110723012 Ground Advantage Calculated: these are boxes, not
 * single cards, so the envelope profile does not apply. Buyer pays calculated,
 * which is why the declared weight is rounded up.
 *
 * Contents come off the box panels only, nothing inferred.
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
  key: string; mon: string; title: string; price: string; floor: string;
  qty: number; upc: string; photos: string[];
};

const JOBS: Job[] = [
  {
    key: 'greninja', mon: 'Greninja', qty: 5, price: '57.99', floor: '53.00',
    upc: '196214158740',
    title: 'Pokemon TCG 30th Celebration Greninja ex Box Sealed In Hand 4 Packs Promo',
    photos: ['30thCelebration_GreninjaExBox_01_front.JPEG', '30thCelebration_GreninjaExBox_02_back.JPEG'],
  },
  {
    key: 'sylveon', mon: 'Sylveon', qty: 2, price: '64.99', floor: '57.00',
    upc: '196214158733',
    title: 'Pokemon TCG 30th Anniversary Celebration Sylveon ex Box Sealed In Hand 4 Pack',
    photos: ['30thCelebration_SylveonExBox_01_front.JPEG', '30thCelebration_SylveonExBox_02_back.JPEG'],
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
  const call = async (name: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + name + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + body + '</' + name + 'Request>',
  })).text();

  for (const job of JOBS) {
    if (job.title.length > 80) throw new Error('title too long: ' + job.title);
    const pics: string[] = [];
    for (const [i, f] of job.photos.entries()) {
      const u = await eps(tok, DIR + f, job.key + '_' + (i + 1));
      if (!u) throw new Error('EPS failed for ' + f);
      pics.push(u);
    }

    const desc = '<p>Pokemon TCG <strong>30th Celebration ' + esc(job.mon) + ' ex Box</strong>, factory sealed.</p>'
      + '<p>Contents, from the box:</p><ul>'
      + '<li>1 foil promo card featuring ' + esc(job.mon) + ' ex</li>'
      + '<li>1 foil oversize card featuring ' + esc(job.mon) + ' ex</li>'
      + '<li>4 Pokemon TCG: 30th Celebration booster packs</li></ul>'
      + '<p><strong>In hand, not a presale.</strong> Ships within 1 business day.</p>'
      + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

    const specifics: [string, string][] = [
      ['Game', 'Pokémon TCG'], ['Set', '30th Celebration'],
      ['Configuration', job.mon + ' ex Box'], ['Language', 'English'],
      ['Manufacturer', 'The Pokémon Company'], ['Character', job.mon],
      ['Number of Packs', '4'], ['Features', 'Sealed'],
    ];

    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + desc + ']]></Description>'
      + '<PrimaryCategory><CategoryID>261044</CategoryID></PrimaryCategory>'
      + '<ProductListingDetails><UPC>' + job.upc + '</UPC></ProductListingDetails>'
      + '<ConditionID>1000</ConditionID>'
      + '<StartPrice>' + job.price + '</StartPrice><Quantity>' + job.qty + '</Quantity>'
      + '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
      + '<ListingDetails><MinimumBestOfferPrice>' + job.floor + '</MinimumBestOfferPrice></ListingDetails>'
      + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
      + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
      + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>269110723012</ShippingProfileID></SellerShippingProfile>'
      + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
      + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
      + '<ItemSpecifics>' + specifics
        .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
      + '</ItemSpecifics>'
      + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
      + '<ShippingPackageDetails><PackageLength>8</PackageLength><PackageWidth>8</PackageWidth>'
      + '<PackageDepth>4</PackageDepth>'
      + '<WeightMajor unit="lbs">1</WeightMajor><WeightMinor unit="oz">4</WeightMinor></ShippingPackageDetails>'
      + '</Item>';

    const v = await call('VerifyAddFixedPriceItem', item);
    const ok = !/<Ack>Failure</.test(v);
    console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  ' + job.mon + '  $' + job.price + ' x' + job.qty
      + '  floor $' + job.floor);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 175));
    if (!APPLY || !ok) continue;
    const a = await call('AddFixedPriceItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    if (!id) { for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ! ' + m[1].slice(0, 175)); continue; }
    console.log('   -> https://www.ebay.com/itm/' + id);
  }
})();
