/**
 * Put the spread shot in front on the football lot and cut the video stills back.
 *
 *   npx tsx scripts/revise-fb-lot30-photos-0930.ts --apply
 *
 * "those images are atrocious" -> [spread photo] -> "Crop the carpet out"
 *
 * He was right. The eight video stills proved the cards were read but they are
 * a card in a hand with motion blur and a couch behind it, which is not a
 * storefront image. A bulk lot needs the pile.
 *
 * The crop finds the card block rather than guessing at the carpet's edge:
 * marble is near-grey and card art is not, so thresholding on SATURATION and
 * keeping rows/columns above 4% coverage isolates the cards, and the carpet
 * band at the top and the dark wedge bottom-right fall away with it.
 *
 * Then padded sideways to square with the marble tone sampled from the crop's
 * own edge. **That is the part that matters for a lot listing**: eBay centre-
 * crops a non-square thumbnail, and this photo is 1867x2313, so the top and
 * bottom rows of cards would have been cut out of the search thumbnail - which
 * is exactly where Spencer Fano, Gibbs, Nabers and Parsons are.
 *
 * Three stills kept behind it, not eight. They are worth having as closeups of
 * the names that sell the lot, and worthless as the lead.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168743317632';
const DIR = 'eBay_assets/iCloud Photos/';
const PHOTOS = [
  'Bowman26FB_Lot30_00_spread.jpg',    // lead: all 30, square, carpet gone
  'Bowman26FB_Lot30_02_bowers.jpg',
  'Bowman26FB_Lot30_03_nabers.jpg',
  'Bowman26FB_Lot30_01_parsons.jpg',
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

(async () => {
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
  const tok = j.access_token;
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
    const jpeg = await sharp(readFileSync(DIR + f)).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 93 }).toBuffer();
    const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
    const xml = '<?xml version="1.0" encoding="utf-8"?><UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<PictureName>fblot30_' + (i + 1) + '</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>';
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
    const u = (await r.text()).match(/<FullURL>([^<]*)</)?.[1];
    if (!u) throw new Error('EPS failed for ' + f);
    pics.push(u);
    console.log('  uploaded ' + f);
  }

  const before = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  console.log('\nbefore: ' + (before.match(/<PictureURL>/g)?.length ?? 0) + ' photos');
  if (!APPLY) { console.log('  dry run'); return; }

  const rev = await call('ReviseFixedPriceItem',
    '<Item><ItemID>' + ITEM + '</ItemID><PictureDetails>'
    + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('')
    + '</PictureDetails></Item>');
  console.log('  ack=' + (rev.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
  for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 150));

  const after = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  const g = (t: string) => after.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('after:  ' + (after.match(/<PictureURL>/g)?.length ?? 0) + ' photos   '
    + g('ListingStatus') + '  $' + g('CurrentPrice'));
  console.log('  lead is now the 30-card spread');
})();
