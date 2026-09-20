/**
 * Upload the 216 photos for the 3-mega Bowman Chrome rip to eBay EPS.
 *
 *   npx tsx scripts/eps-upload-bow3box-0919.ts
 *
 * Michael: "I just realized you never listed my bowman chrome mega box cards
 * and I'm losing my edge in the early release." Megas street 2026-09-23, so
 * there are about three days of being the only seller left.
 *
 * Supabase is still quota-restricted and irrelevant here anyway: listing photos
 * live on eBay's own servers. Reads the originals straight out of
 * "eBay_assets/card drop".
 *
 * Idempotent. Every URL is cached in scripts/_bow3box_eps.json keyed by IMG
 * number and an already-uploaded photo is skipped, so a rerun after a network
 * blip costs nothing and cannot duplicate.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const DIR = 'eBay_assets/card drop';
const CACHE = 'scripts/_bow3box_eps.json';

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
  const cards = JSON.parse(readFileSync('scripts/_bow3box_cards.json', 'utf8'));
  const cache: Record<string, string> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

  const missing = cards.flatMap((c: any) => [c.front, c.back]).filter((n: number) => !localPath(n));
  if (missing.length) { console.log('missing originals: ' + missing.join(', ')); return; }

  const tok = await token();
  let done = 0, skipped = 0, failed = 0;
  for (const c of cards) {
    for (const [side, n] of [['front', c.front], ['back', c.back]] as [string, number][]) {
      const key = String(n);
      if (cache[key]) { skipped++; continue; }
      try {
        // 9% pad is not applied here: these go out as the full phone frame,
        // same as the hobby-box listings, which is what buyers of the 0910 batch
        // already saw. The crop work was for the montages, not for listings.
        const jpeg = await sharp(readFileSync(localPath(n)!)).rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 90 }).toBuffer();
        const url = await eps(tok, jpeg, 'bow3_' + c.i + '_' + side);
        if (!url) { failed++; console.log('FAIL #' + c.i + ' ' + side + ' IMG_' + n); continue; }
        cache[key] = url;
        done++;
        if (done % 20 === 0) {
          writeFileSync(CACHE, JSON.stringify(cache, null, 1));
          console.log('  uploaded ' + done + '...');
        }
      } catch (e) {
        failed++;
        console.log('ERR #' + c.i + ' ' + side + ': ' + String(e).slice(0, 110));
      }
    }
  }
  writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  console.log('\nuploaded ' + done + ', cached ' + skipped + ', failed ' + failed);
  console.log('cache holds ' + Object.keys(cache).length + '/216 -> ' + CACHE);
})();
