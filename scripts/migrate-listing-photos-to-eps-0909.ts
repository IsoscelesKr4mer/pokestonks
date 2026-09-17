/**
 * Move every active listing's main photo off Supabase and onto eBay's own
 * picture service (EPS), so the listings stop depending on Michael's bucket.
 *
 *   npx tsx scripts/migrate-listing-photos-to-eps-0909.ts            # plan only
 *   npx tsx scripts/migrate-listing-photos-to-eps-0909.ts --one      # do one, verify
 *   npx tsx scripts/migrate-listing-photos-to-eps-0909.ts --apply    # do them all
 *
 * WHY: Supabase returned 402 (exceed_egress_quota) on 2026-09-09, so every
 * ExternalPictureURL is dead at the source. eBay's cached copies still serve the
 * big listing photo, but eBay re-fetches the source periodically and drops its
 * thumbnail when that fails, which is why Seller Hub shows broken alt text on a
 * growing number of listings.
 *
 * Uploading to EPS makes eBay the host of record. It never re-fetches, so this
 * cannot happen again regardless of what the bucket does.
 *
 * Local originals resolve through two naming schemes:
 *   bbcard_drop_1374.jpg -> IMG_1374.JPEG   (phone drop, renamed on upload)
 *   anything else        -> same filename under eBay_assets/**
 *
 * Inventory-API listings (those with a SKU + offer) reject ReviseFixedPriceItem
 * with "Inventory-based listing management is not currently supported", so they
 * take the Sell Inventory path instead. The Bowman box is one of those.
 */
import sharp from 'sharp';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';

const ONE = process.argv.includes('--one');
const APPLY = process.argv.includes('--apply');

const DIRS = [
  'eBay_assets', 'eBay_assets/card drop', 'eBay_assets/_originals',
  'eBay_assets/_originals/baseball_0816', 'eBay_assets/_originals/naruto_earthscroll2_0827',
  'eBay_assets/v2_photos', 'eBay_assets/Baseball Cards', 'eBay_assets/iCloud Photos',
  'scripts',
];

/** Photos generated in this repo today, never archived under the uploaded name. */
const ALIAS: Record<string, string> = {
  'mtg_hobbit_294.jpg': 'scripts/_hob_single_294.jpg',
  'mtg_hobbit_205f.jpg': 'scripts/_hob_single_205.jpg',
  'mtg_hobbit_bulk_lot_2.jpg': 'scripts/_hob_new_montage.jpg',
};

/** filename (lowercased) -> path, across every asset folder */
const INDEX = new Map<string, string>();
for (const d of DIRS) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    const k = f.toLowerCase();
    if (!INDEX.has(k)) INDEX.set(k, `${d}/${f}`);
  }
}

function localFor(url: string): string | null {
  const fn = decodeURIComponent(url.split('/').pop() ?? '').toLowerCase();
  if (ALIAS[fn] && existsSync(ALIAS[fn])) return ALIAS[fn];
  if (INDEX.has(fn)) return INDEX.get(fn)!;
  // bbcard_drop_1374.jpg was IMG_1374.JPEG before the upload renamed it
  const m = fn.match(/^bbcard_drop_(\d+)\./);
  if (m) {
    const n = m[1];
    for (const cand of [`img_${n}.jpeg`, `img_${Number(n)}.jpeg`, `img_${n}.jpg`]) {
      if (INDEX.has(cand)) return INDEX.get(cand)!;
    }
  }
  return null;
}

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}
let TOK = '';
async function token() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  return j.access_token as string;
}
const trading = async (call: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
  method: 'POST',
  headers: {
    'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': TOK, 'Content-Type': 'text/xml',
  },
  body,
})).text();

/** Fetch bytes and prove they are actually an image. A stray HTML error page fed
 *  to sharp throws "unsupported image format" and killed the first batch run. */
async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 1000) return null;
    const jpg = b[0] === 0xff && b[1] === 0xd8;
    const png = b[0] === 0x89 && b[1] === 0x50;
    return jpg || png ? b : null;
  } catch { return null; }
}

/** UploadSiteHostedPictures is multipart: XML part, then the raw bytes. */
async function eps(jpeg: Buffer, name: string): Promise<string | null> {
  const B = '----ebayEPS' + Date.now();
  const xml = '<?xml version="1.0" encoding="utf-8"?>'
    + '<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + `<PictureName>${name}</PictureName>`
    + '<PictureSet>Supersize</PictureSet>'
    + '</UploadSiteHostedPicturesRequest>';
  const head = Buffer.from(
    `--${B}\r\nContent-Disposition: form-data; name="XML Payload"\r\n`
    + `Content-Type: text/xml;charset=utf-8\r\n\r\n${xml}\r\n`
    + `--${B}\r\nContent-Disposition: form-data; name="image"; filename="${name}.jpg"\r\n`
    + 'Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n', 'utf8');
  const tail = Buffer.from(`\r\n--${B}--\r\n`, 'utf8');
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': TOK,
      'Content-Type': `multipart/form-data; boundary=${B}`,
    },
    body: Buffer.concat([head, jpeg, tail]),
  });
  const t = await r.text();
  const full = t.match(/<FullURL>([^<]*)</)?.[1];
  if (!full) {
    console.log(`      EPS failed: ${t.match(/<ShortMessage>([^<]*)</)?.[1] ?? t.slice(0, 160)}`);
    return null;
  }
  return full;
}

/** Inventory-API listings need the image swapped on the inventory item itself. */
async function invGet(sku: string) {
  const r = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    headers: { Authorization: `Bearer ${TOK}`, Accept: 'application/json', 'Accept-Language': 'en-US', 'Content-Language': 'en-US' },
  });
  if (!r.ok) return null;
  return r.json() as Promise<any>;
}
async function invPutImage(sku: string, item: any, urls: string[]) {
  const body = JSON.parse(JSON.stringify(item));
  delete body.sku;
  body.product = { ...body.product, imageUrls: urls };
  // packageType on a PUT has broken publishes before; the rest of the size block
  // is what shipping needs, so keep those and drop only the type.
  if (body.packageWeightAndSize) delete body.packageWeightAndSize.packageType;
  const r = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json',
      'Content-Language': 'en-US', 'Accept-Language': 'en-US', Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  return { ok: r.status >= 200 && r.status < 300, status: r.status, txt: txt.slice(0, 220) };
}

async function main() {
  TOK = await token();
  const list = await trading('GetMyeBaySelling',
    '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList>'
    + '</GetMyeBaySellingRequest>');
  const ids = [...list.matchAll(/<ItemID>(\d+)</g)].map((m) => m[1]);
  console.log(`${ids.length} active listings\n`);

  const jobs: { id: string; title: string; ext: string; local: string; mirror?: string; sku: string; livePics: string[] }[] = [];
  const noSource: string[] = [];
  for (const id of ids) {
    const x = await trading('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const ext = x.match(/<ExternalPictureURL>([^<]*)</)?.[1] ?? '';
    const title = (x.match(/<Title>([^<]*)</)?.[1] ?? '').slice(0, 44);
    const sku = x.match(/<SKU>([^<]*)</)?.[1] ?? '';
    if (!ext || !ext.includes('supabase')) continue;  // already migrated
    const local = localFor(ext);
    // No local original, but eBay still hosts a full-size master of its own
    // ($_57 is the supersize variant). Re-uploading that through EPS still
    // severs the Supabase dependency, which is the whole point.
    const pic = x.match(/<PictureURL>([^<]*)</)?.[1] ?? '';
    const mirror = pic ? pic.replace(/\$_\d+\.JPE?G.*$/i, '$_57.JPG') : '';
    if (!local && !mirror) { noSource.push(`${id} ${ext.split('/').pop()}  ${title}`); continue; }
    const livePics = [...x.matchAll(/<PictureURL>([^<]*)</g)].map((m) => m[1]);
    jobs.push({ id, title, ext, local: local ?? '', mirror: local ? '' : mirror, sku, livePics });
  }
  console.log(`${jobs.length} listings ready (${jobs.filter((j) => j.local).length} from local originals, ${jobs.filter((j) => !j.local).length} mirrored from eBay's own copy)`);
  if (noSource.length) {
    console.log(`${noSource.length} have NO local source (left alone):`);
    noSource.forEach((n) => console.log(`   ${n}`));
  }
  if (!ONE && !APPLY) { console.log('\nplan only'); return; }

  const todo = ONE ? jobs.slice(0, 1) : jobs;
  let done = 0, failed = 0;
  for (const j of todo) {
   try {
    const src = j.local ? readFileSync(j.local) : await fetchImage(j.mirror!);
    if (!src) { failed++; console.log(`>>> ${j.id} no usable source image  ${j.title}`); continue; }
    const jpeg = await sharp(src).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 }).toBuffer();
    const name = `${j.id}_main`;
    const url = await eps(jpeg, name);
    if (!url) { failed++; console.log(`>>> ${j.id} EPS upload failed  ${j.title}`); continue; }

    // Trading revise first; inventory-based listings reject it and take the REST path.
    const rev = await trading('ReviseFixedPriceItem',
      '<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
      + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>'
      + `<ItemID>${j.id}</ItemID><PictureDetails><PictureURL>${url}</PictureURL></PictureDetails>`
      + '</Item></ReviseFixedPriceItemRequest>');
    const ack = rev.match(/<Ack>([^<]*)</)?.[1];
    const inventoryBased = /Inventory-based listing management/.test(rev);
    console.log(`${ack === 'Failure' && !inventoryBased ? '>>>' : 'OK '} ${j.id} ${ack}${inventoryBased ? ' (inventory-based, needs REST)' : ''}  ${(jpeg.length / 1024).toFixed(0)}KB  ${j.title}`);
    if (ack === 'Failure' && !inventoryBased) {
      for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log(`      ${m[1].slice(0, 150)}`);
      failed++;
    } else if (inventoryBased) {
      if (!j.sku) { console.log('      no SKU, cannot take the REST path'); failed++; continue; }
      const item = await invGet(j.sku);
      if (!item) { console.log(`      inventory item ${j.sku} not readable`); failed++; continue; }
      // The inventory item is the authority on how many photos the listing has;
      // cards are shot front AND back, so migrating only the first loses one.
      const srcUrls: string[] = item.product?.imageUrls ?? [];
      const epsUrls: string[] = [];
      for (const [i, su] of srcUrls.entries()) {
        if (!su.includes('supabase')) { epsUrls.push(su); continue; }
        if (i === 0) { epsUrls.push(url); continue; }   // already uploaded above
        const loc = localFor(su);
        const liveN = j.livePics[i] ? j.livePics[i].replace(/\$_\d+\.JPE?G.*$/i, '$_57.JPG') : '';
        const bytes = loc ? readFileSync(loc) : (liveN ? await fetchImage(liveN) : null);
        if (!bytes) {
          // Never silently shorten a live listing. Keep eBay's existing URL as-is
          // rather than dropping the photo entirely.
          if (j.livePics[i]) { epsUrls.push(j.livePics[i]); console.log(`      photo ${i + 1} kept as eBay's existing copy`); }
          else console.log(`      photo ${i + 1} unrecoverable, dropped: ${su.split('/').pop()}`);
          continue;
        }
        const buf = await sharp(bytes).rotate()
          .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
        const u2 = await eps(buf, `${j.id}_${i + 1}`);
        if (u2) epsUrls.push(u2);
      }
      const res = await invPutImage(j.sku, item, epsUrls);
      console.log(`      REST ${res.ok ? 'OK' : 'FAIL ' + res.status + ' ' + res.txt}  sku ${j.sku}  ${epsUrls.length}/${srcUrls.length} photos`);
      res.ok ? done++ : failed++;
    } else done++;
   } catch (err) {
    failed++;
    console.log(`>>> ${j.id} threw: ${String(err).slice(0, 120)}  ${j.title}`);
   }
  }
  console.log(`\n${done} migrated, ${failed} need another path`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
