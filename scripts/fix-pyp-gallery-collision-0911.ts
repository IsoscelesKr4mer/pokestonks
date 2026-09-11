/**
 * Make every you-pick photo selectable again.
 *
 *   npx tsx scripts/fix-pyp-gallery-collision-0911.ts           # dry run
 *   npx tsx scripts/fix-pyp-gallery-collision-0911.ts --apply
 *
 * Michael: clicking Sal Stewart's photo on the Bowman you-pick does not move
 * the dropdown, clicking Kevin McGonigle's does.
 *
 * Cause, and it is not the missing back. Both cards carry a front and a back in
 * their VariationSpecificPictureSet. The difference is that Sal Stewart's FRONT
 * is also one of the six item level PictureDetails URLs. eBay shows a picture
 * once; when the same URL is both an item picture and a variation picture the
 * item picture wins, so clicking it selects nothing and the matching back never
 * appears beside it. McGonigle's front is only ever a variation picture, so it
 * behaves.
 *
 * The other you-pick listings are already right by accident: their item level
 * gallery was uploaded to EPS separately, so the same photo has two different
 * URLs and both copies work. 168654621768 is the reference, its Sal Stewart
 * front exists twice under different EPS ids.
 *
 * Fix: re-upload each colliding item level picture to EPS to get a fresh URL,
 * then revise PictureDetails only. Nothing visible changes, the gallery keeps
 * the same photos in the same order.
 *
 * No <Variations> node is sent. Per memory a revise carrying Variation nodes
 * treats Quantity as AVAILABLE rather than total and has previously refilled
 * sold-out cards; leaving the node out entirely cannot do that.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import sharp from 'sharp';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

// every live multi-variation listing whose gallery reuses variation picture URLs
const ITEMS = [
  { id: '168680135269', what: '2026 Bowman Chrome you pick' },
  { id: '168617438107', what: 'Topps Chrome Big Ticket Players you pick' },
  { id: '168645368919', what: 'Naruto Kayou Earth Scroll 2 you pick' },
];

const BACKUP = 'scripts/_pyp_gallery_backup_0911.json';

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
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(
        findKey(cfg, 'EBAY_CLIENT_ID') + ':' + findKey(cfg, 'EBAY_CLIENT_SECRET')).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' +
      encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}

async function trading(tok: string, call: string, inner: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: '<?xml version="1.0" encoding="utf-8"?><' + call + 'Request xmlns="urn:ebay:apis:eBLBaseComponents">' +
      inner + '</' + call + 'Request>',
  });
  return await r.text();
}

async function eps(tok: string, jpeg: Buffer, name: string) {
  const B = '----pypfix' + Date.now();
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

function parse(xml: string) {
  const pd = xml.match(/<PictureDetails>[\s\S]*?<\/PictureDetails>/)?.[0] ?? '';
  const gallery = [...pd.matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((m) => m[1]);
  const sets = [...xml.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)]
    .map((m) => ({
      val: m[1].match(/<VariationSpecificValue>([^<]*)<\/VariationSpecificValue>/)?.[1] ?? '?',
      pics: [...m[1].matchAll(/<PictureURL>([^<]*)<\/PictureURL>/g)].map((p) => p[1]),
    }));
  const owner = new Map<string, string>();
  for (const s of sets) for (const u of s.pics) owner.set(u, s.val);
  return { gallery, sets, owner };
}

(async () => {
  const tok = await userToken();
  const backup: Record<string, string[]> = existsSync(BACKUP) ? JSON.parse(readFileSync(BACKUP, 'utf8')) : {};

  for (const { id, what } of ITEMS) {
    const xml = await trading(tok, 'GetItem',
      '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>');
    const { gallery, sets, owner } = parse(xml);
    const clashes = gallery.filter((u) => owner.has(u));

    console.log('\n' + '='.repeat(70));
    console.log(id + '  ' + what);
    console.log('  gallery ' + gallery.length + ' | variations ' + sets.length +
      ' | colliding ' + clashes.length);
    clashes.forEach((u) => console.log('     blocks: ' + owner.get(u)));
    if (!clashes.length) { console.log('  nothing to do'); continue; }

    if (!backup[id]) { backup[id] = gallery; writeFileSync(BACKUP, JSON.stringify(backup, null, 2)); }

    if (!APPLY) continue;

    // fresh EPS copy of each colliding picture, so the gallery owns its own URLs
    const next: string[] = [];
    for (const [i, u] of gallery.entries()) {
      if (!owner.has(u)) { next.push(u); continue; }
      const src = Buffer.from(await (await fetch(u)).arrayBuffer());
      // re-encode so the bytes differ; EPS hands back the same URL for identical bytes
      const jpeg = await sharp(src).jpeg({ quality: 88 }).toBuffer();
      const fresh = await eps(tok, jpeg, 'pyp_' + id + '_g' + i);
      if (!fresh) throw new Error('EPS upload failed for gallery slot ' + i + ' on ' + id);
      if (owner.has(fresh)) throw new Error('EPS returned a URL that is still a variation picture: ' + fresh);
      next.push(fresh);
      console.log('     reuploaded slot ' + i + ' (' + owner.get(u) + ')');
    }

    const res = await trading(tok, 'ReviseFixedPriceItem',
      '<Item><ItemID>' + id + '</ItemID><PictureDetails>' +
      next.map((u) => '<PictureURL>' + u + '</PictureURL>').join('') +
      '</PictureDetails></Item>');
    const ack = res.match(/<Ack>(\w+)</)?.[1];
    console.log('  revise: ' + ack);
    for (const m of res.matchAll(/<LongMessage>([^<]*)<\/LongMessage>/g)) console.log('     ' + m[1]);
    if (ack === 'Failure') continue;

    // prove it took
    const after = parse(await trading(tok, 'GetItem',
      '<ItemID>' + id + '</ItemID><DetailLevel>ReturnAll</DetailLevel>'));
    const left = after.gallery.filter((u) => after.owner.has(u));
    console.log('  verify: gallery ' + after.gallery.length + ', variations ' + after.sets.length +
      ', still colliding ' + left.length);
    if (left.length) throw new Error('collision survived the revise on ' + id);
    if (after.sets.length !== sets.length) throw new Error('variation count changed on ' + id);
  }

  if (!APPLY) console.log('\nDRY RUN, pass --apply');
  else console.log('\nold gallery URLs saved to ' + BACKUP);
})();
