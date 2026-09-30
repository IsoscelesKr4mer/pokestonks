/**
 * Show every front on the Mojo lot, corners intact.
 *
 *   npx tsx scripts/revise-mojolot-photos-0930.ts --apply
 *
 * "i like the collage but i hate the 3 random photos where you cant even see
 * the corners. Show all the photos of the fronts w/o cropping the corners"
 *
 * Fair. Three arbitrary closeups out of eleven cards is worse than none: a
 * buyer cannot tell which eight are missing and the tight crop hid exactly the
 * part they check for condition.
 *
 * The corners were being shaved because the crop finds the card by BRIGHTNESS,
 * which lands on the printed face; the white border and corners fall outside
 * that box. Padding is now 10% of the detected card width rather than a fixed
 * 10px, so every corner sits well inside the frame with background around it.
 *
 * Collage stays as the lead, then all 11 fronts in the same order as the
 * description's checklist.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168743403176';
const DIR = 'eBay_assets/iCloud Photos/';
const PHOTOS = ['Bowman26FB_MojoLot11_00_grid.jpg',
  ...['01_nabers','02_waddle','03_skattebo','04_tate','05_klubnik','06_randall',
      '07_hoover','08_surace','09_desir','10_minicucci','11_chudzinski']
    .map((n) => 'Bowman26FB_MojoFront_' + n + '.jpg')];

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
      .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
    const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
    const xml = '<?xml version="1.0" encoding="utf-8"?><UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<PictureName>mojolot_' + (i + 1) + '</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>';
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
  }
  console.log('uploaded ' + pics.length + ' photos (collage + 11 fronts)');
  if (!APPLY) return;

  const rev = await call('ReviseItem',
    '<Item><ItemID>' + ITEM + '</ItemID><PictureDetails>'
    + pics.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('')
    + '</PictureDetails></Item>');
  console.log('ack=' + (rev.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
  for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log('  - ' + m[1].slice(0, 140));
  const g = await call('GetItem', '<ItemID>' + ITEM + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
  const gg = (t: string) => g.match(new RegExp('<' + t + '[^>]*>([^<]*)<'))?.[1] ?? '-';
  console.log('now ' + (g.match(/<PictureURL>/g)?.length ?? 0) + ' photos   '
    + gg('ListingStatus') + '  opens $' + gg('StartPrice') + '  ends ' + gg('EndTime').slice(0, 16));
})();
