/**
 * Replace the photos on the three 30th Celebration listings.
 *
 *   npx tsx scripts/revise-30th-singles-photos-0917.ts [--apply]
 *
 * Michael: "Crops way too aggressive on the pikachus people wants to see edges
 * corners and backs".
 *
 * Two things were wrong. The crop aspect-locked to 2.5x3.5 and padded 2%, which
 * trimmed exactly what a card buyer is buying, and the lot listing carried only
 * a montage, so no single card could be judged on its own. Now:
 *
 *   - 9% pad on every side, no aspect lock, so all four corners and the whole
 *     edge run sit inside the frame with backdrop around them
 *   - the lot gets the montage first and then all eight cards individually,
 *     nine photos, so a buyer can check any one of them
 *
 * Backs are still missing. He shot fronts only (the odd IMG numbers), so the
 * listings say fronts-only until he sends the evens; this script takes them
 * automatically once BACKS below is filled in.
 *
 * These were created with AddFixedPriceItem, so ReviseFixedPriceItem works on
 * them. The Inventory-API path that the sealed listings need does not apply.
 */
import { config } from 'dotenv';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
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

const LOT_CARDS = [
  'Pikachu_023_01of30', 'Pikachu_029_07of30', 'Pikachu_033_11of30', 'Pikachu_034_12of30',
  'Pikachu_042_20of30', 'Pikachu_046_24of30', 'Promo_AlolanExeggutor_094', 'Promo_Lucario_095',
];

// Backs arrived 2026-09-18. Pairing is by file sequence, because every Pokemon
// back is the same picture and cannot be matched by content. Fronts were the
// odd IMG numbers and backs the evens: every front n claims back n+1, exactly
// one back is left over (IMG_4578), and its front IMG_4577 is the single gap in
// his front sequence. Nothing is double-claimed and nothing else is orphaned,
// which is the parity assertion the card-intake skill asks for.
const BACKS: Record<string, string> = {
  Zapdos_133of128_IR: '30thCelebration_Zapdos_133of128_IR_back.JPEG',
  ArceusVSTAR_123of172: '30thCelebration_ArceusVSTAR_123of172_back.JPEG',
  Pikachu_023_01of30: '30thCelebration_Pikachu_023_01of30_back.JPEG',
  Pikachu_029_07of30: '30thCelebration_Pikachu_029_07of30_back.JPEG',
  Pikachu_033_11of30: '30thCelebration_Pikachu_033_11of30_back.JPEG',
  Pikachu_034_12of30: '30thCelebration_Pikachu_034_12of30_back.JPEG',
  Pikachu_042_20of30: '30thCelebration_Pikachu_042_20of30_back.JPEG',
  Pikachu_046_24of30: '30thCelebration_Pikachu_046_24of30_back.JPEG',
  Promo_AlolanExeggutor_094: '30thCelebration_Promo_AlolanExeggutor_094_back.JPEG',
  Promo_Lucario_095: '30thCelebration_Promo_Lucario_095_back.JPEG',
};

const JOBS: { id: string; label: string; files: string[] }[] = [
  {
    id: '168697072160', label: 'Zapdos',
    files: ['30thCelebration_Zapdos_133of128_IR.JPEG'],
  },
  {
    id: '168697072332', label: 'Arceus VSTAR',
    files: ['30thCelebration_ArceusVSTAR_123of172.JPEG'],
  },
  {
    id: '168697072540', label: '8-card lot',
    files: ['30thCelebration_PikachuLot_8cards.JPEG',
      ...LOT_CARDS.map((c) => '30thCelebration_' + c + '.JPEG')],
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
  const tok = await token();
  for (const job of JOBS) {
    // interleave: every card's back goes directly after its own front, so the
    // gallery reads front, back, front, back rather than all fronts then all
    // backs
    const files: string[] = [];
    for (const f of job.files) {
      files.push(f);
      const hit = Object.entries(BACKS).find(([k]) => f.includes(k));
      if (hit) files.push(hit[1]);
    }
    const urls: string[] = [];
    for (const [i, f] of files.entries()) {
      const p = DIR + f;
      if (!existsSync(p)) throw new Error('missing photo ' + p);
      const u = await eps(tok, p, job.label.replace(/\W+/g, '') + '_v2_' + (i + 1));
      if (!u) throw new Error('EPS failed for ' + p);
      urls.push(u);
    }
    console.log('\n== ' + job.label + '  ' + urls.length + ' photos');
    if (!APPLY) { console.log('   dry run'); continue; }
    const body = '<Item><ItemID>' + job.id + '</ItemID><PictureDetails>'
      + urls.map((u) => '<PictureURL>' + esc(u) + '</PictureURL>').join('')
      + '</PictureDetails></Item>';
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
      },
      body: '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
        + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>' + body + '</ReviseFixedPriceItemRequest>',
    });
    const x = await r.text();
    console.log('   Revise: ' + (x.match(/<Ack>([^<]*)</)?.[1] ?? '?'));
    for (const m of x.matchAll(/<LongMessage>([^<]*)</g)) console.log('   - ' + m[1].slice(0, 180));
  }
})();
