/**
 * List Michael's 30th Celebration Elite Trainer Box.
 *
 *   npx tsx scripts/list-30th-etb-0917.ts
 *
 * He said "List it" with front and back photos, against the $159.99 I
 * recommended: 25th percentile of 127 live asks, nets ~$135, which still beats
 * TradePost's $138 less $11 shipping ($127 net) and should move in days rather
 * than weeks. He expects the set to soften, so speed is the point.
 *
 * Photos go to eBay EPS, not Supabase: the org is quota-restricted and every
 * Supabase HTTP endpoint is 402. EPS is where all 1,019 existing listing
 * pictures live anyway.
 *
 * UPC 196214158801, read off the box photo he sent. Printed as EAN-13
 * "0 196214 158801"; the leading zero is dropped for a US listing and the
 * check digit verifies. The box also carries product code 10-10447-110, which
 * is the retail ETB; the Pokemon Center exclusive is -111.
 *
 * Contents are taken from the back panel only, nothing inferred.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const SKU = 'P30TH-ETB';
const PRICE = '159.99';
const PHOTOS = [
  'eBay_assets/iCloud Photos/30thCelebration_ETB_01_front.JPEG',
  'eBay_assets/iCloud Photos/30thCelebration_ETB_02_back.JPEG',
];

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function tradingToken() {
  const cfg = JSON.parse(readFileSync(homedir() + '/.claude.json', 'utf8'));
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token as string;
}

async function eps(tok: string, jpeg: Buffer, name: string) {
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml = '<?xml version="1.0" encoding="utf-8"?>' +
    '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">' +
    '<PictureName>' + name + '</PictureName><PictureSet>Supersize</PictureSet>' +
    '</UploadSiteHostedPicturesRequest>';
  const head = Buffer.from(
    '--' + B + '\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n' + xml + '\r\n' +
    '--' + B + '\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
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
  const tok = await tradingToken();
  const urls: string[] = [];
  for (const [i, p] of PHOTOS.entries()) {
    const jpeg = await sharp(readFileSync(p)).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
    const u = await eps(tok, jpeg, '30th_etb_' + (i + 1));
    if (!u) throw new Error('EPS upload failed for ' + p);
    urls.push(u);
    console.log('  photo ' + (i + 1) + ' -> ' + u.slice(0, 70));
  }
  console.log(JSON.stringify(urls, null, 1));
})();
