/**
 * List the One Piece DP-12 and the two Lorcana Best Buddies bundles.
 *
 *   npx tsx scripts/list-op12-lorcana-0924.ts            # verify only
 *   npx tsx scripts/list-op12-lorcana-0924.ts --apply    # list + map
 *
 * "these are not good trade posts candidates, lorcana buddy bundle not even on
 * there and the one piece ask is $27 w/ $9 shipping. Post both to ebay now"
 *
 * TradePost is out on both, and on the One Piece it is out by a mile: $27 less
 * a $9 label he pays is $18 net against roughly $29 net here.
 *
 * PRICES, off delivered eBay asks with the parted-out listings filtered out.
 * The filter is the whole job here: unfiltered, DP-12 looks like a $10 item
 * because of loose DON!! promos, and Best Buddies looks like $35 because of
 * binder-and-pin-only lots.
 *
 *              sealed asks   low     25th    MED      ask     floor   net@floor
 *   DP-12          55       28.99   35.00   40.52   34.99    26.00      22.02
 *   Best Buddies   91       71.50   85.00   90.00   79.99    69.00      58.44
 *
 * DP-12's floor is set off TradePost's $18 net, the channel he turned down, so
 * an accepted offer cannot quietly lose to it. Best Buddies has no buylist at
 * all, so its floor is set to keep a real margin on the $44.19 basis: $69 nets
 * $58.44, which is +$14.25 a bundle.
 *
 * COMBINED SHIPPING IS ON THE LORCANA and has to be, because it is one listing
 * at quantity 2. Without profile 1423939012 a buyer taking both pays two full
 * labels, which is exactly what cost a sale on the Sylveon boxes.
 *
 * UPCs read off the back panels, both check-digit verified:
 *   DP-12         810199502014    (UPC-A, check 4)
 *   Best Buddies  4050368901576   (EAN-13, check 6) - goes in the UPC field,
 *                 not the EAN field, or it never reaches a US listing.
 *
 * DECLARED WEIGHTS ARE ESTIMATES, not scale readings, and they are rounded UP
 * because the buyer pays calculated. The Lorcana box in particular has not been
 * measured; 14x11x4 at 3 lb is a generous envelope around it. Tighten both once
 * he weighs them.
 *
 * Contents come off the box panels only.
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
  key: string; title: string; price: string; floor: string; qty: number;
  upc: string; catalogItemId: number; photos: string[];
  pkg: { l: number; w: number; d: number; lb: number; oz: number };
  combined?: boolean;
  desc: string; specifics: [string, string][];
};

const JOBS: Job[] = [
  {
    key: 'op12', qty: 1, price: '34.99', floor: '26.00', catalogItemId: 135613,
    upc: '810199502014',
    title: 'One Piece TCG OP-17 Double Pack Set 12 Worlds Strongest Warriors Sealed In Hand',
    photos: ['OnePiece_DoublePackSet12_01_front.jpg', 'OnePiece_DoublePackSet12_02_back.jpg'],
    pkg: { l: 8, w: 8, d: 4, lb: 0, oz: 12 },
    desc: '<p>One Piece Card Game <strong>Double Pack Set Vol. 12</strong>, factory sealed.</p>'
      + '<p>From the set <em>The World&#39;s Strongest Warriors</em> (OP-17), 4th Anniversary.</p>'
      + '<p>Contents, from the box:</p><ul>'
      + '<li>1 Special DON!! Card Pack (1 card, randomly inserted from 2 types)</li>'
      + '<li>2 booster packs [OP-17], 12 cards each</li></ul>'
      + '<p>English print. <strong>In hand, not a presale.</strong> Ships within 1 business day.</p>'
      + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    specifics: [
      ['Game', 'One Piece CCG'], ['Set', 'The World’s Strongest Warriors'],
      ['Configuration', 'Double Pack Set'], ['Language', 'English'],
      ['Manufacturer', 'Bandai'], ['Number of Packs', '2'],
      ['Features', 'Sealed'], ['Year Manufactured', '2026'],
    ],
  },
  {
    key: 'buddies', qty: 2, price: '79.99', floor: '69.00', catalogItemId: 135614,
    upc: '4050368901576', combined: true,
    title: 'Disney Lorcana Best Buddies Bundle Costco Exclusive Wilds Unknown Sealed In Hand',
    photos: ['Lorcana_BestBuddiesBundle_01_front.jpg', 'Lorcana_BestBuddiesBundle_02_back.jpg'],
    pkg: { l: 14, w: 11, d: 4, lb: 3, oz: 0 },
    desc: '<p>Disney Lorcana TCG <strong>Best Buddies Bundle</strong>, factory sealed.</p>'
      + '<p>Warehouse-club exclusive, built around the <em>Wilds Unknown</em> set.</p>'
      + '<p>Contents, from the box:</p><ul>'
      + '<li>1 card portfolio, holds 252 cards</li>'
      + '<li>6 Wilds Unknown booster packs, 12 cards each</li>'
      + '<li>2 special edition promo cards: Glimmer foil Sulley &ndash; Protective Monster, and Violet Parr &ndash; Super Resilient</li>'
      + '<li>1 Mike Wazowski &ndash; Well-Rounded Entertainer pin</li></ul>'
      + '<p><strong>In hand, not a presale.</strong> Ships within 1 business day.</p>'
      + '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    specifics: [
      ['Game', 'Disney Lorcana TCG'], ['Set', 'Wilds Unknown'],
      ['Configuration', 'Bundle'], ['Language', 'English'],
      ['Manufacturer', 'Ravensburger'], ['Number of Packs', '6'],
      ['Features', 'Sealed'], ['Year Manufactured', '2026'],
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
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });
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
    if (job.title.length > 80) throw new Error('title ' + job.title.length + ' chars: ' + job.title);

    // never list more than the vault says is on hand
    const [h] = await sql`select coalesce(sum(p.quantity), 0)::int held from purchases p
      where p.catalog_item_id = ${job.catalogItemId} and p.deleted_at is null`;
    if (h.held < job.qty) throw new Error(job.key + ': listing ' + job.qty + ' but vault holds ' + h.held);

    const pics: string[] = [];
    for (const [i, f] of job.photos.entries()) {
      const u = await eps(tok, DIR + f, job.key + '_' + (i + 1));
      if (!u) throw new Error('EPS failed for ' + f);
      pics.push(u);
    }

    const item = '<Item><Title>' + esc(job.title) + '</Title>'
      + '<Description><![CDATA[' + job.desc + ']]></Description>'
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
      + (job.combined
        ? '<ShippingDetails><ApplyShippingDiscount>true</ApplyShippingDiscount>'
          + '<ShippingDiscountProfileID>1423939012</ShippingDiscountProfileID></ShippingDetails>'
        : '')
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
    console.log('\n' + (ok ? 'OK  ' : 'FAIL') + '  ' + job.key + '  $' + job.price + ' x' + job.qty
      + '  floor $' + job.floor + '  title ' + job.title.length + ' chars'
      + (job.combined ? '  [combined shipping]' : ''));
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 190));
    if (!APPLY || !ok) continue;

    const a = await call('AddFixedPriceItem', item);
    const id = a.match(/<ItemID>(\d+)</)?.[1];
    if (!id) {
      for (const m of a.matchAll(/<LongMessage>([^<]*)</g)) console.log('   ! ' + m[1].slice(0, 190));
      continue;
    }
    console.log('   -> https://www.ebay.com/itm/' + id);

    await sql`insert into ebay_listing_mappings (user_id, ebay_item_id, mappings, created_at, updated_at)
      values (${USER}, ${id}, ${sql.json([{ qty: 1, catalogItemId: job.catalogItemId }])}, now(), now())
      on conflict do nothing`;
    console.log('      mapped -> catalog#' + job.catalogItemId + ' at qty 1 per unit sold');
  }
  await sql.end();
})();
