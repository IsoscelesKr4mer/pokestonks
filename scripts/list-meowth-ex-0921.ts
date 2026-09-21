/**
 * Log the vending Perfect Order pack, its rip, and list the Meowth ex.
 *
 *   npx tsx scripts/list-meowth-ex-0921.ts            # verify only
 *   npx tsx scripts/list-meowth-ex-0921.ts --apply    # write + list
 *
 * "Opened a perfect order pack at the vending machine trying to pull something
 * in early from next drop but got this meowth and iirc these sell for a few
 * shekels so let's list it"
 *
 * Card read off the photos: Meowth ex, Basic, HP 170, Ability Last-Ditch Catch,
 * Tuck Tail 60, number 062/088 with the double star, set code POR, illus. 5ban
 * Graphics. 062 sits inside the 88-card set, so it is the standard Double Rare
 * ex, not one of the two variants above the set size. That distinction is the
 * whole value of the card:
 *
 *   062/088  Double Rare        $2.25 TCGplayer   <- this one
 *   107/088  Ultra Rare        $12.30
 *   121/088  Special Illus.   $107.32
 *
 * Priced off eBay rather than TCGplayer, which disagree again: 189 live asks,
 * low $0.99, 25th $2.58, median $2.99 against TCGplayer's $2.25. Lists at the
 * median. No Best Offer; on a $2.99 card any floor worth accepting is inside
 * eBay's $0.40 fixed fee.
 *
 * The pack was a $5.00 loss and always was. He was probing the machine for
 * early next-set stock, not buying Perfect Order on purpose; recovering ~$2.40
 * of the $5.00 is the best outcome available.
 *
 * Purchase and rip follow the pu464 precedent exactly: same catalog item
 * (ci19843), same $5.00 vending flat, ripped immediately.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const PACK_CI = 19843;                 // Perfect Order Booster Pack
const DATE = '2026-09-21';
const PRICE = '2.99';
const TITLE = 'Pokemon Meowth ex 062/088 Perfect Order Double Rare Holo English NM';
const INBOX = 'C:/Users/Michael/.claude/channels/discord-pokestonks/inbox/';
const PHOTOS = [
  INBOX + '1790019046628-1551676972344811660.jpg',   // front, bare
  INBOX + '1790019042631-1551676960927907901.jpg',   // back
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

// loose crop, 9% pad, no aspect lock, so corners and the whole edge run are in
// frame. Same treatment as the 30th Celebration singles.
async function cropCard(path: string) {
  const im = sharp(readFileSync(path)).rotate();
  const { width: w = 0, height: h = 0 } = await im.metadata();
  const raw = await im.raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  let x0 = info.width, x1 = 0, y0 = info.height, y1 = 0;
  const cut = Math.floor(info.height * 0.88);
  for (let y = 0; y < cut; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels;
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      if (v > 110) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const cw = x1 - x0;
  const px = Math.round(cw * 0.09);
  const py = Math.round((cw / (2.5 / 3.5)) * 0.09);
  const left = Math.max(0, x0 - px), top = Math.max(0, y0 - py);
  const right = Math.min(info.width, x1 + px), bottom = Math.min(info.height, y1 + py);
  return sharp(readFileSync(path)).rotate()
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92 }).toBuffer();
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
  return j.access_token as string;
}

async function eps(tok: string, jpeg: Buffer, name: string) {
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
  if (TITLE.length > 80) throw new Error('title too long');
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [ci] = await sql`select id, name from catalog_items where id = ${PACK_CI}`;
  if (!/Perfect Order Booster Pack/.test(ci.name)) throw new Error('ci' + PACK_CI + ' is ' + ci.name);

  let pid: number | null = null;
  const [dupe] = await sql`select id from purchases where catalog_item_id = ${PACK_CI}
    and purchase_date = ${DATE} and deleted_at is null limit 1`;
  if (dupe) { pid = dupe.id; console.log('pack already logged as pu' + pid); }
  else if (APPLY) {
    const [p] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${PACK_CI}, ${DATE}, 1, 500, 'Vending Machine', null,
        ${'Bought to probe the machine for early next-set stock, not for Perfect ' +
          'Order itself; the next set had not loaded. $5.00 is the standing vending ' +
          'single-pack flat. Machine not named in his report, ask before using this ' +
          'for drop timing.'})
      returning id`;
    pid = p.id;
    console.log('logged pack pu' + pid + '  x1 $5.00 Vending Machine');
  } else console.log('would log pack: ci' + PACK_CI + ' x1 $5.00 Vending Machine');

  if (pid) {
    const [r0] = await sql`select count(*)::int n from rips where source_purchase_id = ${pid}`;
    if (r0.n) console.log('rip already recorded');
    else if (APPLY) {
      const [r] = await sql`insert into rips (user_id, source_purchase_id, rip_date,
          pack_cost_cents, realized_loss_cents, notes)
        values (${USER}, ${pid}, ${DATE}, 500, 0,
          ${'Opened at the machine. Yielded Meowth ex 062/088, the Double Rare, ' +
            'worth about $2.99 on eBay against the $5.00 pack. No realized loss ' +
            'booked and the basis is unassigned, same as every prior rip; the ' +
            'single is listed separately and Pokemon singles are not vault-tracked.'})
        returning id`;
      console.log('ripped pu' + pid + ' -> rip#' + r.id);
    } else console.log('would rip pu' + pid);
  }
  await sql.end();

  const tok = await token();
  const pics: string[] = [];
  for (const [i, p] of PHOTOS.entries()) {
    const u = await eps(tok, await cropCard(p), 'meowth_' + (i + 1));
    if (!u) throw new Error('EPS failed ' + p);
    pics.push(u);
  }

  const desc = '<p><strong>Meowth ex 062/088</strong>, Double Rare, Pokemon TCG <strong>ME03: Perfect Order</strong>. Illustrated by 5ban Graphics.</p>'
    + '<p>Basic, HP 170. Ability <em>Last-Ditch Catch</em>, attack <em>Tuck Tail</em> 60.</p>'
    + '<p>English. Pulled and sleeved straight away, never played. Photos are of the actual card, front and back.</p>'
    + '<p>Ships within 1 business day.</p>'
    + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>';

  const specifics: [string, string][] = [
    ['Game', 'Pok\u00e9mon TCG'], ['Set', 'ME03: Perfect Order'], ['Card Name', 'Meowth ex'],
    ['Card Number', '062/088'], ['Rarity', 'Double Rare'], ['Language', 'English'],
    ['Card Type', 'Pok\u00e9mon'], ['Character', 'Meowth'],
    ['Manufacturer', 'The Pok\u00e9mon Company'], ['Graded', 'No'], ['Grade', 'Ungraded'],
    ['Finish', 'Holo'],
  ];

  const item = '<Item><Title>' + esc(TITLE) + '</Title>'
    + '<Description><![CDATA[' + desc + ']]></Description>'
    + '<PrimaryCategory><CategoryID>183454</CategoryID></PrimaryCategory>'
    + '<ConditionID>4000</ConditionID><ConditionDescriptors><ConditionDescriptor>'
    + '<Name>40001</Name><Value>400010</Value></ConditionDescriptor></ConditionDescriptors>'
    + '<StartPrice>' + PRICE + '</StartPrice><Quantity>1</Quantity>'
    + '<Country>US</Country><Currency>USD</Currency><Location>Edmonds, Washington</Location><PostalCode>98026</PostalCode>'
    + '<DispatchTimeMax>1</DispatchTimeMax><ListingDuration>GTC</ListingDuration><ListingType>FixedPriceItem</ListingType>'
    + '<SellerProfiles><SellerShippingProfile><ShippingProfileID>272052757012</ShippingProfileID></SellerShippingProfile>'
    + '<SellerReturnProfile><ReturnProfileID>269110705012</ReturnProfileID></SellerReturnProfile>'
    + '<SellerPaymentProfile><PaymentProfileID>269110704012</PaymentProfileID></SellerPaymentProfile></SellerProfiles>'
    + '<ItemSpecifics>' + specifics
      .map(([n, v]) => '<NameValueList><Name>' + esc(n) + '</Name><Value>' + esc(v) + '</Value></NameValueList>').join('')
    + '</ItemSpecifics>'
    + '<PictureDetails>' + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('') + '</PictureDetails>'
    + '<ShippingPackageDetails><ShippingPackage>PackageThickEnvelope</ShippingPackage>'
    + '<PackageLength>7</PackageLength><PackageWidth>5</PackageWidth><PackageDepth>1</PackageDepth>'
    + '<WeightMajor unit="lbs">0</WeightMajor><WeightMinor unit="oz">3</WeightMinor></ShippingPackageDetails>'
    + '</Item>';

  const call = async (name: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': name, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + name + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + item + '</' + name + 'Request>',
  })).text();

  const v = await call('VerifyAddFixedPriceItem');
  console.log('\nVerify: ' + (v.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 175));
  if (!APPLY || /<Ack>Failure</.test(v)) return;
  const a = await call('AddFixedPriceItem');
  const id = a.match(/<ItemID>(\d+)</)?.[1];
  console.log('Add: ' + (a.match(/<Ack>([^<]*)</)?.[1] ?? '?') + '  ItemID ' + id);
  for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 175));
  if (id) console.log('https://www.ebay.com/itm/' + id);
})();
