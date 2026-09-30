/**
 * List the 30-card 2026 Bowman Football paper base lot from the ripped mega.
 *
 *   npx tsx scripts/list-fb-lot30-0930.ts            # verify only
 *   npx tsx scripts/list-fb-lot30-0930.ts --apply    # list
 *
 * "What I'm testing is if you can watch this video and create a lot for all the
 * cards I fanned through without actually taking individual photos. These are
 * all paper base."
 *
 * Every card below was read off his fan-through videos and then confirmed
 * against the 2026 Bowman Football checklist, which is also where the numbers
 * come from since the backs are never shown. Method and its traps are in
 * [[reference_read_cards_from_fanthrough_video]].
 *
 * PHOTOS ARE VIDEO FRAMES, which is the whole point of the exercise - no card
 * was photographed individually. Eight stills pulled from IMG_0155.MOV, the
 * slower and sharper of the two clips, one per headline name.
 *
 * PRICING IS WEAK AND THE SCRIPT SAYS SO. The product released TODAY, so there
 * is no lot market yet: a filtered search returns 1 and 3 comps, both far off
 * this shape. $24.99 is built from the parts instead - about 30 cards at a
 * dollar-ish each for paper base, discounted the way bulk always is against
 * sum-of-parts. Treat it as a first offer to the market, not a comped price,
 * and expect to move it once real lots appear.
 *
 * The LaNorris Sellers Mega Prospect insert from the same box is NOT in here.
 * It is not base and it comps on its own.
 *
 * CONDITION IS 1000/New WITHOUT DESCRIPTORS. Category 261329 Trading Card Lots
 * accepts only 1000 or 3000 and rejects the `4000` + `ConditionDescriptor`
 * shape that singles category 261328 requires - "The provided condition id is
 * invalid for the selected primary category id." Same split as the Pokemon
 * 183454 vs 183455 pair.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DIR = 'eBay_assets/iCloud Photos/';
const PRICE = '24.99';
const FLOOR = '18.00';
const TITLE = '2026 Bowman Football 30 Card Lot Bowers Nabers Parsons Gibbs Purdy Mayfield RC';

const PHOTOS = ['Bowman26FB_Lot30_01_parsons.jpg', 'Bowman26FB_Lot30_02_bowers.jpg',
  'Bowman26FB_Lot30_03_nabers.jpg', 'Bowman26FB_Lot30_04_gibbs.jpg',
  'Bowman26FB_Lot30_05_purdy.jpg', 'Bowman26FB_Lot30_06_young.jpg',
  'Bowman26FB_Lot30_07_mayfield.jpg', 'Bowman26FB_Lot30_08_evans.jpg'];

// number, player, team  -- all confirmed against the checklist
const NFL: [string, string, string][] = [
  ['4', 'Michael Penix Jr.', 'Atlanta Falcons'],
  ['13', 'Bryce Young', 'Carolina Panthers'],
  ['25', 'Shedeur Sanders', 'Cleveland Browns'],
  ['30', 'Jahmyr Gibbs', 'Detroit Lions'],
  ['39', 'Micah Parsons', 'Green Bay Packers'],
  ['59', 'Brock Bowers', 'Las Vegas Raiders'],
  ['65', 'Davante Adams', 'Los Angeles Rams'],
  ['68', 'Jaylen Waddle', 'Denver Broncos'],
  ['76', 'Malik Nabers', 'New York Giants'],
  ['87', 'Brock Purdy', 'San Francisco 49ers'],
  ['94', 'Baker Mayfield', 'Tampa Bay Buccaneers'],
  ['100', 'Mike Evans', 'San Francisco 49ers'],
  ['115', 'Kaytron Allen', 'Washington Commanders (RC)'],
  ['129', 'Malachi Fields', 'New York Giants (RC)'],
  ['142', 'Caleb Douglas', 'Miami Dolphins (RC)'],
  ['158', 'Kenyon Sadiq', 'New York Jets (RC)'],
  ['169', 'Spencer Fano', 'Cleveland Browns (RC)'],
  ['180', 'David Bailey', 'New York Jets (RC)'],
];
const BPP: [string, string, string][] = [
  ['BPP-9', 'CJ Brown', 'Arkansas'],
  ['BPP-24', 'Nik McMillan', 'Kansas'],
  ['BPP-27', 'Tiger Bachmeier', 'BYU'],
  ['BPP-54', 'Malachi Hosley', 'Georgia Tech'],
  ['BPP-71', 'Caleb Hawkins', 'Oklahoma State'],
  ['BPP-86', 'DeJuan Williams', 'Maryland'],
  ['BPP-134', 'Ryan Browne', 'Purdue'],
  ['BPP-137', 'AJ Surace', 'Rutgers'],
  ['BPP-142', 'Emmett Mosley V', 'Texas'],
  ['BPP-164', 'Will Hammond', 'Texas Tech'],
  ['BPP-181', "Jai'Den Thomas", 'UNLV'],
  ['BPP-196', 'Kenny Minchey', 'Kentucky'],
];

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
  if (TITLE.length > 80) throw new Error('title ' + TITLE.length + ' chars');
  if (NFL.length + BPP.length !== 30) throw new Error('checklist is ' + (NFL.length + BPP.length) + ', not 30');
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

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

  const pics: string[] = [];
  for (const [i, f] of PHOTOS.entries()) {
    const u = await eps(tok, DIR + f, 'fblot_' + (i + 1));
    if (!u) throw new Error('EPS failed for ' + f);
    pics.push(u);
  }

  const row = ([n, p, t]: [string, string, string]) =>
    '<li><strong>' + esc(n) + '</strong> &ndash; ' + esc(p) + ', ' + esc(t) + '</li>';
  const desc = '<p><strong>2026 Bowman Football &mdash; 30 card paper base lot.</strong> All pulled'
    + ' from a 2026 Bowman Football mega box.</p>'
    + '<p><strong>Every card is listed below by number.</strong> No duplicates, no filler.</p>'
    + '<p><strong>NFL Base (18)</strong></p><ul>' + NFL.map(row).join('') + '</ul>'
    + '<p><strong>Bowman Prospects (12)</strong></p><ul>' + BPP.map(row).join('') + '</ul>'
    + '<p>Paper base only &mdash; no parallels, inserts, autographs or numbered cards in this lot.</p>'
    // NO PACKAGING CLAIMS. [[feedback_listing_shipping_assumptions]] says only
    // "Ships within 1 business day", and the first version of this broke that
    // AND got it wrong: "team bag and top loader" -> "they come ini a team bag
    // not sleeved".
    + '<p>Photos show the actual cards. Ships within 1 business day.</p>'
    + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

  const specifics: [string, string][] = [
    ['Sport', 'Football'], ['League', 'National Football League (NFL)'],
    ['Type', 'Sports Trading Card'], ['Set', '2026 Bowman Football'], ['Season', '2026'],
    ['Manufacturer', 'Topps'], ['Number of Cards', '30'],
    ['Grade', 'Ungraded'], ['Graded', 'No'], ['Vintage', 'No'],
    ['Autographed', 'No'], ['Parallel/Variety', 'Base'], ['Language', 'English'],
    ['Card Condition', 'Near Mint or Better'], ['Card Size', 'Standard'],
    ['Features', 'Rookie'],
  ];

  const item = '<Item><Title>' + esc(TITLE) + '</Title>'
    + '<Description><![CDATA[' + desc + ']]></Description>'
    + '<PrimaryCategory><CategoryID>261329</CategoryID></PrimaryCategory>'
    // 261329 Trading Card Lots accepts ONLY 1000/New or 3000/Used and rejects the
    // 4000 + ConditionDescriptor shape that the singles category 261328 requires
    + '<ConditionID>1000</ConditionID>'
    + '<StartPrice>' + PRICE + '</StartPrice><Quantity>1</Quantity>'
    + '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
    + '<ListingDetails><MinimumBestOfferPrice>' + FLOOR + '</MinimumBestOfferPrice></ListingDetails>'
    + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
    + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
    // 30 sleeved cards will not go in an envelope, so calculated Ground Advantage
    + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>269110723012</ShippingProfileID></SellerShippingProfile>'
    + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
    + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
    + '<ItemSpecifics>' + specifics
      .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
    + '</ItemSpecifics>'
    + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
    + '<ShippingPackageDetails><PackageLength>7</PackageLength><PackageWidth>5</PackageWidth>'
    + '<PackageDepth>2</PackageDepth>'
    + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">8</WeightMinor></ShippingPackageDetails>'
    + '</Item>';

  const v = await call('VerifyAddFixedPriceItem', item);
  const ok = !/<Ack>Failure</.test(v);
  console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  $' + PRICE + '  floor $' + FLOOR
    + '  title ' + TITLE.length + ' chars  ' + (NFL.length + BPP.length) + ' cards  '
    + pics.length + ' photos');
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
  if (!APPLY || !ok) { await sql.end(); return; }

  const a = await call('AddFixedPriceItem', item);
  const id = a.match(/<ItemID>(\d+)</)?.[1];
  if (!id) {
    for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ! ' + m[1].slice(0, 190));
    await sql.end();
    return;
  }
  console.log('   -> https://www.ebay.com/itm/' + id);
  const g = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  const gg = (t: string) => g.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('   GetItem: ' + gg('ListingStatus') + '  $' + gg('CurrentPrice')
    + '  floor $' + gg('MinimumBestOfferPrice') + '  pics ' + (g.match(/<PictureURL>/g)?.length ?? 0));
  await sql.end();
})();
