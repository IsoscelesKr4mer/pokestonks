/**
 * List the Leonardo Reynoso 1st Bowman GOLD INK auto /15.
 *
 *   npx tsx scripts/list-reynoso-goldink-0928.ts            # verify only
 *   npx tsx scripts/list-reynoso-goldink-0928.ts --apply    # list + vault row
 *
 * "Got this nuke in a break - list it for $1499.99"
 *
 * I ARGUED AGAINST THIS PRICE AND I WAS WRONG. The comp run priced it off
 * Reynoso's colour-refractor ladder (/499 $25, /250 $20-30, /150 $23-40, /99
 * $35) and concluded a /15 was worth $105-200. That reasoning treats /15 as the
 * next rung on the refractor ladder. It is not.
 *
 *   "You're retarded this is gold ink and one already sold for 1100 and
 *    there's none others listed"
 *   "Gold ink to /15 is not your average parallel"
 *
 * **GOLD INK IS AN INK TIER, NOT A COLOUR PARALLEL.** It is priced on a
 * different axis from Refractor/Purple/Blue/Green and sits far above all of
 * them. The searches here never surfaced it because every filter was built
 * around refractor colour words.
 *
 * THE COMP IS A SOLD COMP, AND HE HAD IT:
 *   SOLD 2026-09-16, $1,100.00, eBay Authenticity Guarantee
 *   "Bowman Chrome 2026 Leonardo Reynoso 1st Gold Ink Auto CPA-LR /15 Mariners"
 *   serial 05/15, the identical card one number away from his 08/15.
 *
 * And there are ZERO competing listings. So $1,499.99 is a 36% premium over the
 * only confirmed sale while being the sole copy on the market, which is a
 * perfectly defensible ask rather than a moonshot.
 *
 * Best Offer floor is $1,200, above the $1,100 sale, because he is the only
 * seller and has no reason to accept under the last trade.
 *
 * eBay Authenticity Guarantee is automatic on trading cards at $250+: the card
 * ships to eBay's authenticator first, not to the buyer, at no cost to him.
 * That is why this is NOT on the envelope profile.
 *
 * Every fact in the description is read off the card. The scouting lines are
 * printed on the back, not sourced from anywhere else.
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
const PRICE = '1499.99';
const FLOOR = '1200.00';
const TITLE = '2026 Bowman Chrome Leonardo Reynoso 1st Bowman GOLD INK Auto /15 CPA-LR Mariners';
const PHOTOS = ['BowmanChrome26_Reynoso_GoldInk15_01_front.jpg',
  'BowmanChrome26_Reynoso_GoldInk15_02_back.jpg'];

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
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  // the duplicate guard: one card, one listing
  const [dupe] = await sql`select id, status, ebay_item_id from baseball_cards
    where player ilike '%Reynoso%' and card_number = 'CPA-LR'`;
  if (dupe) console.log('EXISTING vault row #' + dupe.id + ' status=' + dupe.status
    + ' ebay=' + (dupe.ebay_item_id ?? '-'));

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
    const u = await eps(tok, DIR + f, 'reynoso_' + (i + 1));
    if (!u) throw new Error('EPS failed for ' + f);
    pics.push(u);
  }

  const desc = '<p><strong>2026 Bowman Chrome Leonardo Reynoso 1st Bowman Chrome Prospect Autograph</strong>,'
    + ' <strong>GOLD INK</strong>, serial numbered <strong>08/15</strong>. Card #CPA-LR.</p>'
    + '<p>On-card gold ink signature. Topps Certified Autograph Issue.</p>'
    + '<ul>'
    + '<li><strong>Gold Ink parallel, numbered to just 15 copies</strong></li>'
    + '<li>1ST BOWMAN &mdash; his first Bowman card</li>'
    + '<li>Seattle Mariners, shortstop, switch hitter</li>'
    + '<li>Signed by Seattle as a free agent 1/15/26</li>'
    + '</ul>'
    + '<p>From the back of the card: rated the <strong>48th-best talent in the 2026'
    + ' international free agent class by MLB Pipeline</strong>, and 65th on'
    + ' <em>Baseball America</em>&#39;s Bonus Board. Trained at Cacon Baseball Academy in'
    + ' the Dominican. Scouting comps to Aramis Ram&iacute;rez. 2026 will be his first'
    + ' professional season.</p>'
    + '<p>Pulled from a break and sleeved straight away, never played. Photos are of the'
    + ' actual card, front and back.</p>'
    + '<p>Ships within 1 business day.</p>'
    + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

  const specifics: [string, string][] = [
    ['Sport', 'Baseball'], ['League', 'Major League Baseball (MLB)'],
    ['Type', 'Sports Trading Card'], ['Set', '2026 Bowman Chrome'], ['Season', '2026'],
    ['Manufacturer', 'Topps'], ['Player/Athlete', 'Leonardo Reynoso'],
    ['Team', 'Seattle Mariners'], ['Card Number', 'CPA-LR'],
    ['Parallel/Variety', 'Gold Ink'], ['Features', 'Serial Numbered'],
    ['Autographed', 'Yes'], ['Autograph Format', 'Hard Signed'],
    ['Autograph Authentication', 'Topps'],
    ['Grade', 'Ungraded'], ['Graded', 'No'], ['Vintage', 'No'],
    ['Language', 'English'], ['Card Condition', 'Near Mint or Better'],
    ['Card Size', 'Standard'],
  ];

  const item = '<Item><Title>' + esc(TITLE) + '</Title>'
    + '<Description><![CDATA[' + desc + ']]></Description>'
    + '<PrimaryCategory><CategoryID>261328</CategoryID></PrimaryCategory>'
    + '<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor>'
    + '<Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>'
    + '<StartPrice>' + PRICE + '</StartPrice><Quantity>1</Quantity>'
    + '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>'
    + '<ListingDetails><MinimumBestOfferPrice>' + FLOOR + '</MinimumBestOfferPrice></ListingDetails>'
    + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
    + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
    // NOT the envelope profile: Authenticity Guarantee routes this to eBay's
    // authenticator and the envelope service caps at $20 of value anyway
    + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>269110723012</ShippingProfileID></SellerShippingProfile>'
    + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
    + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
    + '<ItemSpecifics>' + specifics
      .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
    + '</ItemSpecifics>'
    + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
    + '<ShippingPackageDetails><PackageLength>8</PackageLength><PackageWidth>6</PackageWidth>'
    + '<PackageDepth>2</PackageDepth>'
    + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">6</WeightMinor></ShippingPackageDetails>'
    + '</Item>';

  const v = await call('VerifyAddFixedPriceItem', item);
  const ok = !/<Ack>Failure</.test(v);
  console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  $' + PRICE + '  floor $' + FLOOR
    + '  title ' + TITLE.length + ' chars');
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

  if (!dupe) {
    const [row] = await sql`insert into baseball_cards (user_id, player, set_name, year,
        card_number, parallel, sport, status, for_sale, asking_price_cents, ebay_item_id,
        photo_urls, comp_note, notes)
      values (${USER}, 'Leonardo Reynoso', '2026 Bowman Chrome Prospect Autographs', 2026,
        'CPA-LR', 'Gold Ink Auto /15 (08/15)', 'baseball', 'listed', true, 149999, ${id},
        ${sql.json(pics)},
        ${'SOLD COMP: $1,100.00 on 2026-09-16, the identical Gold Ink Auto CPA-LR /15 at '
          + 'serial 05/15, with eBay Authenticity Guarantee. No other copy listed anywhere '
          + 'at the time of listing, so $1,499.99 is a 36% premium over the only confirmed '
          + 'trade while being the sole copy on the market. NOTE Gold Ink is an INK tier, '
          + 'not a colour parallel: his colour ladder runs /499 $25, /250 $20-30, /150 '
          + '$23-40, /99 $35, and pricing the /15 off that ladder underestimated this card '
          + 'by about 10x.'},
        ${'Seattle Mariners SS, switch hitter, born 10-17-08 Santo Domingo DR, signed by '
          + 'Seattle as a free agent 1/15/26. 48th-best talent in the 2026 international FA '
          + 'class per MLB Pipeline, 65th on Baseball America Bonus Board. 2026 is his first '
          + 'professional season. Pulled from a break 2026-09-28. On-card gold ink auto, '
          + '1ST BOWMAN logo present on the front.'})
      returning id`;
    console.log('   vault card#' + row.id + ' created, status listed');
  } else {
    await sql`update baseball_cards set status='listed', for_sale=true,
      asking_price_cents=149999, ebay_item_id=${id}, updated_at=now() where id=${dupe.id}`;
    console.log('   vault card#' + dupe.id + ' updated');
  }
  await sql.end();
})();
