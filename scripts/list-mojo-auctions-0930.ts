/**
 * Two auctions off the ripped football mega: the 11-card Mojo lot, and the
 * LaNorris Sellers green /99 on its own.
 *
 *   npx tsx scripts/list-mojo-auctions-0930.ts            # verify only
 *   npx tsx scripts/list-mojo-auctions-0930.ts --apply    # list
 *
 * "Let's make another listing and this time let's make it an auction for the
 * whole lot and also and auction for the green /99 separately. Ending Sunday at
 * 6:00pm or another time you think is good."
 *
 * TIMING: scheduled Thu 10-01 18:00 PDT, 3 days, closing SUNDAY 2026-10-04 at
 * 6:00pm Pacific.
 *
 * Both of his constraints are satisfiable at once and I had wrongly presented
 * them as a trade: "you can't end it at a specific time? Ending at 11:29PT is
 * retardo." **`ScheduleTime` sets the close as precisely as the start**, since
 * eBay's durations are fixed - start plus duration fixes the end to the minute.
 * Starting immediately was what forced the 11:29pm close, not any limitation.
 *
 * Landing Sunday 18:00 PT needs a start of Thu 18:00 PT with Days_3, which also
 * clears the 10-08 release-day 7-day wave by four days. The only real cost is
 * about 42 hours of pre-start invisibility, and a prime Sunday-evening close is
 * worth more than that on a $0.99 no-reserve.
 *
 * PAYMENT POLICY MUST BE 273540269012. The usual 269110704012 sets
 * immediatePay, which eBay refuses on an auction with no Buy It Now (21917141).
 *
 * BOTH OPEN AT $0.99, NO RESERVE, because he does not want to be left holding
 * them: "dont have a starting price where they end w/ 0 bids that would suck i
 * dont want to hold onto these". That is the right read of how auctions fail -
 * an opening price above what anyone will bid ends at zero bids and sells
 * nothing, whereas a $0.99 open reliably draws a first bidder and lets the
 * field compete. The cost is real: a quiet week means it goes cheap, and he has
 * accepted that trade explicitly.
 *
 * What the parts are worth, for judging the result rather than setting the
 * open: 2026 Bowman Football mojo singles run a $12 median and a $25 75th, so
 * eleven sum to roughly $90-130 before the usual lot discount. Sellers has NO
 * comparable at all - his 2025 Bowman U cards sit at $6-10 and the only 2026
 * numbered ask is a /50 Gold at $65.
 *
 * THE GREEN IS A MOJO, CONFIRMED TWICE. The card does not name its own finish,
 * so the first version said only "Green 67/99" rather than invent a Topps
 * parallel name. He then said "i know it's a mojo" and sent the odds sheet,
 * which lists **Mega Prospects Green Mojo at 1:928 packs** - that is where the
 * name and the pull rate in the description both come from.
 *
 * The same sheet killed a claim of mine: Mojo runs through Chrome NFL Base,
 * Chrome Rookie and Chrome Prospects at 1:3, so it is not "the mega box
 * exclusive finish" and that line is gone from the lot.
 *
 * Every name and number below was read off the backs and then confirmed against
 * the 2026 Bowman Football checklist.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const DIR = 'eBay_assets/iCloud Photos/';
// Scheduled so the CLOSE lands where it should. eBay durations are fixed
// (1/3/5/7/10 days), so start time plus duration fixes the end exactly:
// Thu 18:00 PT + 3 days = SUNDAY 10-04 18:00 PT, the prime auction window,
// and still four days clear of the 10-08 release-day 7-day wave.
const SCHEDULE = '2026-10-02T01:00:00.000Z';   // Thu 10-01 18:00 PDT
const DURATION = 'Days_3';                     // -> Sun 10-04 18:00 PDT
const PAY_AUCTION = '273540269012';            // no immediate pay
const RETURN_POLICY = '269110705012';
const SHIP_CALC = '269110723012';

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

// number, player, team/school  -- confirmed against the checklist
const LOT: [string, string, string][] = [
  ['BCV-76', 'Malik Nabers', 'New York Giants'],
  ['BCV-68', 'Jaylen Waddle', 'Denver Broncos'],
  ['BCV-78', 'Cam Skattebo', 'New York Giants'],
  ['BCV-118', 'Carnell Tate', 'Tennessee Titans (RC)'],
  ['BCV-107', 'Cade Klubnik', 'New York Jets (RC)'],
  ['BCV-114', 'Adam Randall', 'Baltimore Ravens (RC)'],
  ['BCP-146', 'Josh Hoover', 'Indiana'],
  ['BCP-137', 'AJ Surace', 'Rutgers'],
  ['BCP-46', 'Mandrell Desir', 'Florida State'],
  ['BCP-37', 'Nick Minicucci', 'Delaware'],
  ['BCP-23', 'Kaelan Chudzinski', 'Boston College'],
];

type Job = {
  key: string; title: string; start: string; cat: string; cond: string;
  photos: string[]; desc: string; specifics: [string, string][];
};

const TAIL = '<p>Card is in the photos exactly as it will ship. Ships within 1 business day.</p>'
  + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

const JOBS: Job[] = [
  {
    key: 'mojolot', start: '0.99', cat: '261329', cond: '1000',
    title: '2026 Bowman Chrome Football Mojo Refractor Lot 11 Nabers Waddle Skattebo RC',
    photos: ['Bowman26FB_MojoLot11_00_grid.jpg',
      ...['01_nabers','02_waddle','03_skattebo','04_tate','05_klubnik','06_randall',
          '07_hoover','08_surace','09_desir','10_minicucci','11_chudzinski']
        .map((n) => 'Bowman26FB_MojoFront_' + n + '.jpg')],
    desc: '<p><strong>2026 Bowman Chrome Football &mdash; 11 Mojo Refractors</strong>, every'
      + ' one pulled from a single mega box.</p>'
      + '<p><strong>Every card listed by number, no duplicates:</strong></p><ul>'
      + LOT.map(([n, p, t]) => '<li><strong>' + esc(n) + '</strong> &ndash; ' + esc(p)
        + ', ' + esc(t) + '</li>').join('')
      + '</ul>'
      + '<p>No duplicates and nothing filler &mdash; this is the full Mojo run out of one box.</p>'
      + TAIL,
    specifics: [
      ['Sport', 'Football'], ['League', 'National Football League (NFL)'],
      ['Type', 'Sports Trading Card'], ['Set', '2026 Bowman Chrome Football'],
      ['Season', '2026'], ['Manufacturer', 'Topps'], ['Number of Cards', '11'],
      ['Parallel/Variety', 'Mojo Refractor'], ['Features', 'Refractor'],
      ['Grade', 'Ungraded'], ['Graded', 'No'], ['Vintage', 'No'], ['Autographed', 'No'],
      ['Language', 'English'], ['Card Condition', 'Near Mint or Better'],
      ['Card Size', 'Standard'],
    ],
  },
  {
    key: 'sellers', start: '0.99', cat: '261328', cond: '4000',
    title: '2026 Bowman Chrome U LaNorris Sellers Mega Prospects Green Mojo Refractor 67/99',
    photos: ['Bowman26FBU_Sellers_GreenMP16_01_front.jpg',
      'Bowman26FBU_Sellers_GreenMP16_02_serial.jpg',
      'Bowman26FBU_Sellers_GreenMP16_03_back.jpg'],
    desc: '<p><strong>2026 Bowman Chrome U &mdash; Mega Prospects &mdash; LaNorris Sellers</strong>,'
      + ' card <strong>MP-16</strong>, South Carolina QB.</p>'
      + '<p><strong>Green Mojo Refractor, serial numbered 67/99</strong> in gold foil on the front.</p>'
      + '<ul><li>Hand numbered <strong>67/99</strong></li>'
      + '<li>Mega Prospects insert, MP-16</li>'
      + '<li>South Carolina Gamecocks, quarterback</li></ul>'
      + '<p><strong>Topps lists the Mega Prospects Green Mojo at odds of 1:928 packs.</strong></p>'
      + '<p>Pulled from a 2026 Bowman Football mega box. Closeup of the serial number is'
      + ' included in the photos.</p>'
      + TAIL,
    specifics: [
      ['Sport', 'Football'], ['League', 'NCAA'], ['Type', 'Sports Trading Card'],
      ['Set', '2026 Bowman Chrome U'], ['Season', '2026'], ['Manufacturer', 'Topps'],
      ['Player/Athlete', 'LaNorris Sellers'], ['Team', 'South Carolina Gamecocks'],
      ['Card Number', 'MP-16'], ['Parallel/Variety', 'Green Mojo Refractor'],
      ['Features', 'Serial Numbered'], ['Grade', 'Ungraded'], ['Graded', 'No'],
      ['Vintage', 'No'], ['Autographed', 'No'], ['Language', 'English'],
      ['Card Condition', 'Near Mint or Better'], ['Card Size', 'Standard'],
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
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer();
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
  if (LOT.length !== 11) throw new Error('lot is ' + LOT.length + ', not 11');
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
    if (job.title.length > 80) throw new Error(job.key + ' title ' + job.title.length);
    const pics: string[] = [];
    for (const [i, f] of job.photos.entries()) {
      const u = await eps(tok, DIR + f, job.key + '_' + (i + 1));
      if (!u) throw new Error('EPS failed for ' + f);
      pics.push(u);
    }

    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + job.desc + ']]></Description>'
      + '<PrimaryCategory><CategoryID>' + job.cat + '</CategoryID></PrimaryCategory>'
      + (job.cond === '4000'
        ? '<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor>'
          + '<Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>'
        : '<ConditionID>' + job.cond + '</ConditionID>')
      + '<ListingType>Chinese</ListingType>'
      + '<StartPrice>' + job.start + '</StartPrice><Quantity>1</Quantity>'
      + '<ListingDuration>' + DURATION + '</ListingDuration>'
      + (SCHEDULE ? '<ScheduleTime>' + SCHEDULE + '</ScheduleTime>' : '')
      + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
      + '<DispatchTimeMax>1</DispatchTimeMax>'
      + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>' + SHIP_CALC + '</ShippingProfileID></SellerShippingProfile>'
      + '<SellerReturnProfile><ReturnProfileID>' + RETURN_POLICY + '</ReturnProfileID></SellerReturnProfile>'
      + '<SellerPaymentProfile><PaymentProfileID>' + PAY_AUCTION + '</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
      + '<ItemSpecifics>' + job.specifics
        .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
      + '</ItemSpecifics>'
      + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
      + '<ShippingPackageDetails><PackageLength>7</PackageLength><PackageWidth>5</PackageWidth>'
      + '<PackageDepth>2</PackageDepth>'
      + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">7</WeightMinor></ShippingPackageDetails>'
      + '</Item>';

    const v = await call('VerifyAddItem', item);
    const ok = !/<Ack>Failure</.test(v);
    console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  ' + job.key + '  open $' + job.start
      + '  ' + DURATION + '  starts ' + (SCHEDULE.slice(0, 16) || 'now')
      + '  title ' + job.title.length + '  pics ' + pics.length);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
    if (!APPLY || !ok) continue;

    const a = await call('AddItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    if (!id) {
      for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ! ' + m[1].slice(0, 190));
      continue;
    }
    console.log('   -> https://www.ebay.com/itm/' + id);
    const g = await call('GetItem', '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const gg = (t: string) => g.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
    console.log('   GetItem: ' + gg('ListingStatus') + '  type ' + gg('ListingType')
      + '  open $' + gg('StartPrice') + '  start ' + gg('StartTime').slice(0, 16)
      + '  end ' + gg('EndTime').slice(0, 16));
  }
})();
