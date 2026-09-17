/**
 * Re-attach the photos the 2026-09-09 EPS migration dropped.
 *
 *   npx tsx scripts/restore-dropped-listing-photos.ts            # resolve + verify
 *   npx tsx scripts/restore-dropped-listing-photos.ts --apply    # rebuild and re-attach
 *
 * WHAT WENT WRONG: migrate-listing-photos-to-eps-0909.ts mirrored the FIRST
 * photo of each listing from eBay's own hosted copy when no local original
 * existed, but for photos 2..n it only looked in a short list of asset folders
 * and dropped anything it could not find. Six listings lost ten photos, all of
 * them backs or detail shots.
 *
 * Supabase is NOT needed for this. Every dropped photo traces back to a file
 * still on disk, found by reading the script that originally uploaded it:
 *
 *   seed-baseball-cards.ts     bbcard_<i>_<slug>_<n>.jpg  <- eBay_assets/baseball cards/
 *   fix-card-mismap.ts         bbcard_mcgonigle_16_back_v2.jpg
 *   upload-ohtani-rwb.ts       OhtaniRWB_03_toploader.jpg  <- Discord inbox
 *   upload-mcgonigle-tl.ts     McGonigle_RayWave_03_toploader.jpg  <- Discord inbox
 *   crop-mokin-photos-0827.ts  MOKiN_*_sq.jpg  <- Discord inbox, square-cropped
 *   split-lorcana-12pack.ts    Lorcana_..._02_stack.jpg  <- eBay_assets/v2_photos/
 *
 * The MOKiN shots were square-cropped before upload, so this reproduces that
 * transform rather than pushing the raw phone photo, or the listing would get
 * three differently-shaped images.
 */
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';

const APPLY = process.argv.includes('--apply');
const INBOX = `${homedir()}/.claude/channels/discord/inbox`;
const CARDS = 'eBay_assets/baseball cards';

type Shot = { src: string; sq?: { rot: number; anchor: number } };
type Job = { sku: string; item: string; label: string; shots: Shot[] };

const JOBS: Job[] = [
  { sku: 'OHTANI-RWB-REFRACTOR', item: '168555750100', label: 'Ohtani Red White & Blue Refractor ($99.99)',
    shots: [
      { src: `${CARDS}/IMG_0412.JPEG` },                                  // back
      { src: `${INBOX}/1784745305861-1529557385071431771.jpg` },          // toploader
    ] },
  { sku: 'MCGONIGLE-RAYWAVE', item: '168555697322', label: 'McGonigle RayWave Refractor ($39.99)',
    shots: [
      { src: `${CARDS}/IMG_0410.JPEG` },                                  // back (v2, the corrected one)
      { src: `${INBOX}/1784745095192-1529556477289693274.jpg` },          // toploader
    ] },
  { sku: 'MOKIN-MOTB0101-TB4', item: '168644337111', label: 'MOKiN Thunderbolt 4 Dock ($124.99)',
    shots: [
      { src: `${INBOX}/1787868768430-1542658126002655293.jpg`, sq: { rot: 270, anchor: 0.5 } }, // box front
      { src: `${INBOX}/1787868768698-1542658126363361341.jpg`, sq: { rot: 180, anchor: 0.5 } }, // spec label
      { src: `${INBOX}/1787868768152-1542658125507592322.jpg`, sq: { rot: 0, anchor: 0.5 } },   // contents
    ] },
  { sku: 'BBC-8', item: '168561671909', label: 'Finest Murakami #295 ($17.99)',
    shots: [{ src: `${CARDS}/IMG_0110.JPEG` }] },
  { sku: 'BBC-3', item: '168561671918', label: 'Bowman Sterling Bryan Woo /75 ($25.49)',
    shots: [{ src: `${CARDS}/IMG_0100.JPEG` }] },
  { sku: 'LOR-AOTV-SLEEVED-4A', item: '168621432361', label: 'Lorcana Attack of the Vine 4-pack ($37.99)',
    shots: [{ src: 'eBay_assets/v2_photos/Lorcana_AttackOfTheVine_Sleeved12_01_stack.JPEG' }] },
];

/** Square crop, matching crop-mokin-photos-0827.ts: measure the ROTATED buffer,
 *  because metadata() on the source reports pre-rotation width/height. */
async function build(shot: Shot): Promise<Buffer> {
  const raw = readFileSync(shot.src);
  if (!shot.sq) {
    return sharp(raw).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
  }
  const rotated = await sharp(raw).rotate().rotate(shot.sq.rot).toBuffer();
  const m = await sharp(rotated).metadata();
  const w = m.width!, h = m.height!;
  const side = Math.min(w, h);
  const left = Math.round((w - side) * (w > h ? shot.sq.anchor : 0.5));
  const top = Math.round((h - side) * (h > w ? shot.sq.anchor : 0.5));
  return sharp(rotated).extract({ left, top, width: side, height: side })
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
}

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const total = JOBS.reduce((s, j) => s + j.shots.length, 0);
  let missing = 0;
  console.log(`${JOBS.length} listings, ${total} photos to restore\n`);
  for (const j of JOBS) {
    console.log(`${j.item}  ${j.label}`);
    for (const s of j.shots) {
      const ok = existsSync(s.src);
      if (!ok) missing++;
      console.log(`   ${ok ? 'READY' : 'MISSING'}${s.sq ? ' (square crop)' : ''}  ${s.src.replace(homedir(), '~')}`);
    }
  }
  if (missing) { console.log(`\n${missing} source files missing, aborting`); return; }
  console.log(`\nall ${total} sources present`);
  if (!APPLY) { console.log('re-run with --apply to rebuild and re-attach'); return; }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  const eps = async (jpeg: Buffer, name: string) => {
    const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
    const xml = '<?xml version="1.0" encoding="utf-8"?><UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + `<PictureName>${name}</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>`;
    const head = Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n${xml}\r\n`
      + `--${B}\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n`, 'utf8');
    const r = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
        'Content-Type': `multipart/form-data; boundary=${B}`,
      },
      body: Buffer.concat([head, jpeg, Buffer.from(`\r\n--${B}--\r\n`, 'utf8')]),
    });
    const t = await r.text();
    return t.match(/<FullURL>([^<]*)</)?.[1] ?? null;
  };

  const H = { Authorization: `Bearer ${tok}`, Accept: 'application/json', 'Accept-Language': 'en-US', 'Content-Language': 'en-US' };
  for (const j of JOBS) {
    const got = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${j.sku}`, { headers: H });
    if (!got.ok) { console.log(`>>> ${j.sku} unreadable (${got.status})`); continue; }
    const item: any = await got.json();
    const urls: string[] = [...(item.product?.imageUrls ?? [])];
    const before = urls.length;

    for (const [i, s] of j.shots.entries()) {
      const jpeg = await build(s);
      const u = await eps(jpeg, `${j.item}_r${i + 1}`);
      if (u) urls.push(u); else console.log(`   EPS failed: ${s.src}`);
    }

    const body = JSON.parse(JSON.stringify(item));
    delete body.sku;
    body.product = { ...body.product, imageUrls: urls };
    if (body.packageWeightAndSize) delete body.packageWeightAndSize.packageType;
    const put = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${j.sku}`, {
      method: 'PUT',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(`${put.ok ? 'OK ' : '>>>'} ${j.sku}  ${before} -> ${urls.length} photos  ${j.label}`);
    if (!put.ok) console.log(`      ${(await put.text()).slice(0, 200)}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
