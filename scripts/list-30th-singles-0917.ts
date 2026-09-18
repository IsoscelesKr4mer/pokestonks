/**
 * List the ten cards out of the two 30th Celebration Tech Sticker Collections.
 *
 *   npx tsx scripts/list-30th-singles-0917.ts            # verify only
 *   npx tsx scripts/list-30th-singles-0917.ts --apply    # actually list
 *
 * "List those Pokemon cards however you recommend."
 *
 * Three listings, not ten. The six Pikachu variations and the two box promos
 * are worth $1-4 each on eBay, and eBay's $0.40 per-order floor plus an
 * envelope each would eat most of that, so they go out as ONE themed lot: a
 * buyer chasing the 30-card Pikachu subset wants several at once. Only the
 * Zapdos and the Arceus carry a solo listing.
 *
 * Prices come from eBay live asks, not TCGplayer market, because the two
 * disagree and eBay is where these sell. TCGplayer had the Arceus at $8.76
 * against an eBay median of $12.99, and the Pikachus at ~$1.50 against $3.99.
 * Michael's read is that the set softens from here, so everything is priced
 * between the 25th percentile and the median, to sit near the front of the
 * queue rather than wait for the median:
 *
 *   Zapdos 133/128   199 asks, 25th $15.99, median $19.99  ->  $17.99
 *   Arceus VSTAR      68 asks, 25th  $9.99, median $12.99  ->  $10.99
 *   Pikachu singles  197 asks, 25th  $2.99, median  $3.99  ->  lot at $18.99
 *
 * The lot is priced at sum-of-parts on the 25th percentile, $2.99 x 6 plus the
 * two promos, per the standing rule not to discount a bundle below its parts.
 *
 * Categories were confirmed with the taxonomy API rather than assumed: 183454
 * CCG Individual Cards for the singles, 183455 CCG Mixed Card Lots for the lot.
 * 183455 takes ONLY a bare ConditionID and rejects ConditionDescriptors, while
 * 183454 requires the descriptor, so the two shapes are deliberately different.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
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

const INBOX = 'C:/Users/Michael/.claude/channels/discord-pokestonks/inbox/';

type Job = {
  key: string; title: string; price: string; floor: string; cat: string;
  photos: string[]; desc: string; specifics: [string, string][]; oz: number;
};

const JOBS: Job[] = [
  {
    key: 'zapdos',
    title: 'Pokemon 30th Celebration Zapdos 133/128 Illustration Rare Secret IR English NM',
    price: '17.99', floor: '14.00', cat: '183454', oz: 3,
    photos: [INBOX + '1789699130480-1550335180688855182.jpg'],
    desc: '<p><strong>Zapdos 133/128</strong>, Illustration Rare, Pokemon TCG <strong>ME: 30th Celebration</strong>. Illustrated by mashu.</p>'
      + '<p>English. Pulled from a 30th Celebration pack and sleeved straight away, never played. The photo is of the actual card.</p>'
      + '<p>Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    specifics: [['Game', 'Pok\u00e9mon TCG'], ['Set', 'ME: 30th Celebration'], ['Card Name', 'Zapdos'],
      ['Card Number', '133/128'], ['Rarity', 'Illustration Rare'], ['Language', 'English'],
      ['Card Type', 'Pok\u00e9mon'], ['Character', 'Zapdos'], ['Manufacturer', 'The Pok\u00e9mon Company'],
      ['Graded', 'No'], ['Grade', 'Ungraded'], ['Finish', 'Holo'], ['Features', 'Illustration Rare']],
  },
  {
    key: 'arceus',
    title: 'Pokemon 30th Celebration Classic Collection Arceus VSTAR 123/172 Holo English',
    price: '10.99', floor: '8.50', cat: '183454', oz: 3,
    photos: [INBOX + '1789699130949-1550335181838221402.jpg'],
    desc: '<p><strong>Arceus VSTAR 123/172</strong>, Pokemon TCG <strong>ME: 30th Celebration Classic Collection</strong>. Illustrated by 5ban Graphics.</p>'
      + '<p>The Classic Collection reprints carry the original set numbering and copyright with the 30th anniversary Pikachu stamp on the front, the same way the 2021 Celebrations Classic Collection did.</p>'
      + '<p>English. Pulled from a 30th Celebration pack and sleeved straight away, never played. The photo is of the actual card.</p>'
      + '<p>Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    specifics: [['Game', 'Pok\u00e9mon TCG'], ['Set', 'ME: 30th Celebration Classic Collection'],
      ['Card Name', 'Arceus VSTAR'], ['Card Number', '123/172'], ['Rarity', 'Ultra Rare'],
      ['Language', 'English'], ['Card Type', 'Pok\u00e9mon'], ['Character', 'Arceus'],
      ['Manufacturer', 'The Pok\u00e9mon Company'], ['Graded', 'No'], ['Grade', 'Ungraded'], ['Finish', 'Holo']],
  },
  {
    key: 'lot',
    title: 'Pokemon 30th Celebration 6 Pikachu Variations + 2 Promos 8 Card Lot English NM',
    price: '18.99', floor: '15.00', cat: '183455', oz: 3,
    photos: ['eBay_assets/iCloud Photos/30thCelebration_PikachuLot_8cards.JPEG'],
    desc: '<p><strong>8 cards</strong> from Pokemon TCG <strong>ME: 30th Celebration</strong>, all English, all pictured.</p>'
      + '<p><strong>Six Pikachu variations</strong> from the 30-card subset:</p><ul>'
      + '<li>023/128 (01/30), illus. Ken Sugimori</li><li>029/128 (07/30), illus. James Turner</li>'
      + '<li>033/128 (11/30), illus. Narumi Sato</li><li>034/128 (12/30), illus. USGMEN</li>'
      + '<li>042/128 (20/30), illus. Akira Komayama</li><li>046/128 (24/30), illus. svlt</li></ul>'
      + '<p><strong>Plus two 30th Celebration promos:</strong> Alolan Exeggutor 094 and Lucario 095.</p>'
      + '<p>Pulled from 30th Celebration packs and sleeved straight away, never played. The photo is of the actual cards.</p>'
      + '<p>Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    specifics: [['Game', 'Pok\u00e9mon TCG'], ['Set', 'ME: 30th Celebration'], ['Language', 'English'],
      ['Manufacturer', 'The Pok\u00e9mon Company'], ['Graded', 'No'], ['Number of Cards', '8'],
      ['Character', 'Pikachu'], ['Features', 'Holo']],
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
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function eps(tok: string, path: string, name: string) {
  const jpeg = await sharp(readFileSync(path)).rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
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
    const pics: string[] = [];
    for (const [i, p] of job.photos.entries()) {
      const u = await eps(tok, p, job.key + '_' + (i + 1));
      if (!u) throw new Error('EPS upload failed for ' + p);
      pics.push(u);
    }
    // 183455 (Mixed Card Lots) rejects ConditionDescriptors and takes a bare
    // ConditionID; 183454 (Individual Cards) refuses a bare one and requires
    // the 40001 descriptor.
    const cond = job.cat === '183455'
      ? '<ConditionID>1000</ConditionID>'
      : '<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor>'
        + '<Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>';
    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + job.desc + ']]></Description>'
      + '<PrimaryCategory><CategoryID>' + job.cat + '</CategoryID></PrimaryCategory>'
      + cond
      + '<StartPrice>' + job.price + '</StartPrice><Quantity>1</Quantity>'
      + '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
      + '<ListingDetails><MinimumBestOfferPrice>' + job.floor + '</MinimumBestOfferPrice></ListingDetails>'
      + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
      + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
      + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>'
      + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
      + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
      + '<ItemSpecifics>' + job.specifics.filter(([, v]) => v)
        .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
      + '</ItemSpecifics>'
      + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
      + '<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>'
      + '<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>'
      + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">' + job.oz + '</WeightMinor></ShippingPackageDetails>'
      + '</Item>';

    const v = await call('VerifyAddFixedPriceItem', item);
    console.log('\n== ' + job.key + '  $' + job.price + '   Verify: ' + (v.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
    if (!APPLY || /<Ack>Failure</.test(v)) continue;
    const a = await call('AddFixedPriceItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    console.log('   Add: ' + (a.match(/<Ack>([^<]*)</)?.[1] ?? '?') + '   ItemID ' + id);
    for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
    if (id) console.log('   https://www.ebay.com/itm/' + id);
  }
})();
