/**
 * Upload the 120 photos for the 2026 Bowman Chrome hobby rip to eBay EPS.
 *
 *   npx tsx scripts/eps-upload-bowman-0910.ts
 *
 * Supabase is over quota and irrelevant here: listing photos live on eBay's own
 * servers, which is where all 1,019 existing listing pictures already are. This
 * reads the local originals straight out of "eBay_assets/card drop".
 *
 * Idempotent. Every URL is cached in scripts/_bow_eps.json and an already
 * uploaded card is skipped, so a rerun after a network blip costs nothing and
 * cannot produce duplicate uploads.
 *
 * Photos are rotated upright and capped at 1600px, matching what the listing
 * migration used. The raw phone files are ~3.2 MB each and EPS does not need
 * that.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const DIR = 'eBay_assets/card drop';
const CACHE = 'scripts/_bow_eps.json';

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

async function userToken() {
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

const localPath = (n: number) => {
  for (const e of ['.JPG', '.JPEG', '.jpg', '.jpeg']) {
    const p = DIR + '/IMG_' + n + e;
    if (existsSync(p)) return p;
  }
  return null;
};

async function eps(tok: string, jpeg: Buffer, name: string): Promise<string | null> {
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
  const t = await r.text();
  return t.match(/<FullURL>([^<]*)</)?.[1] ?? null;
}

(async () => {
  const cards = JSON.parse(readFileSync('scripts/_bow_final_prices.json', 'utf8'));
  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

  const missing = cards.flatMap((c: any) => [c.front, c.back]).filter((n: number) => !localPath(n));
  if (missing.length) { console.log('missing originals: ' + missing.join(', ')); return; }

  const tok = await userToken();
  let done = 0, skipped = 0, failed = 0;
  for (const c of cards) {
    for (const [side, n] of [['front', c.front], ['back', c.back]] as [string, number][]) {
      const key = String(n);
      if (cache[key]) { skipped++; continue; }
      try {
        const jpeg = await sharp(readFileSync(localPath(n)!))
          .rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 }).toBuffer();
        const url = await eps(tok, jpeg, 'bow_' + c.i + '_' + side);
        if (!url) { failed++; console.log('FAIL #' + c.i + ' ' + side + ' IMG_' + n); continue; }
        cache[key] = url;
        done++;
        if (done % 10 === 0) {
          writeFileSync(CACHE, JSON.stringify(cache, null, 1));
          console.log('  uploaded ' + done + '...');
        }
      } catch (e) {
        failed++;
        console.log('ERR #' + c.i + ' ' + side + ': ' + String(e).slice(0, 120));
      }
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log('\nuploaded ' + done + ', already cached ' + skipped + ', failed ' + failed);
  console.log('cache now holds ' + Object.keys(cache).length + '/120 photos -> ' + CACHE);
})();
