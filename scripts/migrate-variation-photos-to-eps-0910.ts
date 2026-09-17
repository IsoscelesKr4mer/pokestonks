/**
 * Move the you-pick listings' photos onto eBay's own picture service, including
 * every per-variation picture.
 *
 *   npx tsx scripts/migrate-variation-photos-to-eps-0910.ts               # plan
 *   npx tsx scripts/migrate-variation-photos-to-eps-0910.ts --item <id>   # one listing
 *   npx tsx scripts/migrate-variation-photos-to-eps-0910.ts --all
 *
 * These are the listings the main-photo pass could not touch: eBay rejects
 * "a mixture of Self Hosted and EPS pictures", so the gallery photo cannot move
 * to EPS while the variation pictures are still external. It is all or nothing
 * per listing.
 *
 * SOURCE IS eBAY'S OWN COPY, NOT THE LOCAL ORIGINAL. On a you-pick, a picture is
 * bound to a specific dropdown value, so resolving 254 filenames back to local
 * files risks binding the wrong card photo to the wrong card. eBay already holds
 * a 1600px master of every one of these ($_57), so mirroring is exact by
 * construction and cannot mismatch.
 *
 * TWO THINGS THAT MUST NOT HAPPEN, both from [[reference_ebay_variation_revise_rules]]:
 *   - Never send <Variation> nodes. Quantity on a revise is AVAILABLE, not total,
 *     so including them refills sold-out cards. Only <Variations><Pictures> goes up.
 *   - VariationSpecificValue strings must round-trip byte for byte, or eBay
 *     treats it as a new value and orphans the picture.
 */
import sharp from 'sharp';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { homedir } from 'os';

/** Variation pictures were NEVER copied to eBay: GetItem hands back the raw
 *  Supabase URL, so those dropdown images are dead for buyers right now. Only
 *  the local original can restore them. The bbcard_drop_NNNN -> IMG_NNNN rule is
 *  deterministic, so this cannot bind the wrong photo to the wrong card. */
const DIRS = [
  'eBay_assets', 'eBay_assets/card drop', 'eBay_assets/_originals',
  'eBay_assets/_originals/baseball_0816', 'eBay_assets/_originals/naruto_earthscroll2_0827',
  'eBay_assets/v2_photos', 'eBay_assets/Baseball Cards', 'eBay_assets/iCloud Photos',
];
const INDEX = new Map<string, string>();
for (const d of DIRS) {
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    const k = f.toLowerCase();
    if (!INDEX.has(k)) INDEX.set(k, `${d}/${f}`);
  }
}
/** seed-baseball-cards.ts minted bbcard_<i>_<slug>_<n>.jpg from
 *  data/baseball_cards_seed.json against eBay_assets/baseball cards/.
 *  Regenerating that mapping resolves the curated names the plain filename
 *  index cannot see. */
const SEEDED = new Map<string, string>();
try {
  const seed = JSON.parse(readFileSync('data/baseball_cards_seed.json', 'utf8')) as any[];
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  seed.forEach((c, i) => {
    (c.files ?? []).forEach((f: string, n: number) => {
      const name = `bbcard_${String(i).padStart(2, '0')}_${slug(c.player)}_${n + 1}.jpg`;
      const src = `eBay_assets/baseball cards/${f}`;
      if (existsSync(src)) SEEDED.set(name, src);
    });
  });
} catch { /* seed file absent, fall through to the filename index */ }

/** build-naruto-pyp-0828.ts minted naruto_<slug(code)>.jpg from
 *  data/naruto_cards_0828.tsv, which maps a photo number to a card code. The
 *  source IMG files have since been archived under _originals. */
const NARUTO = new Map<string, string>();
try {
  const nslug = (c: string) => c.replace(/◇/g, 'D').replace(/[^A-Za-z0-9]/g, '');
  const lines = readFileSync('data/naruto_cards_0828.tsv', 'utf8').trim()
    .split(String.fromCharCode(10)).map((x) => x.replace(String.fromCharCode(13), ''))
    .filter((l) => !l.startsWith('#')).slice(1);
  const seen = new Map<string, number>();
  for (const l of lines) {
    const [photo, raw] = l.split('	');
    if (!raw || raw === '?') continue;
    const code = raw.replace('-DUR-', '-◇UR-').toUpperCase();
    if (!seen.has(code)) seen.set(code, Number(photo));
  }
  for (const [code, photo] of seen) {
    for (const c of [
      `eBay_assets/_originals/naruto_earthscroll2_0827/IMG_${photo}.JPEG`,
      `eBay_assets/card drop/IMG_${photo}.JPEG`,
    ]) if (existsSync(c)) { NARUTO.set(`naruto_${nslug(code)}.jpg`.toLowerCase(), c); break; }
  }
} catch { /* tsv absent */ }

/** fix-card-mismap.ts re-uploaded three corrected shots under _v2 names. */
const V2: Record<string, string> = {
  'bbcard_mcgonigle_16_back_v2.jpg': 'eBay_assets/baseball cards/IMG_0410.JPEG',
  'bbcard_roman_anthony_front_v2.jpg': 'eBay_assets/baseball cards/IMG_0408.JPEG',
  'bbcard_chase_burns_chrome_front_v2.jpg': 'eBay_assets/baseball cards/IMG_0409.JPEG',
};

function localFor(url: string): string | null {
  const fn = decodeURIComponent(url.split('/').pop() ?? '').toLowerCase();
  if (INDEX.has(fn)) return INDEX.get(fn)!;
  if (SEEDED.has(fn)) return SEEDED.get(fn)!;
  if (NARUTO.has(fn)) return NARUTO.get(fn)!;
  if (V2[fn] && existsSync(V2[fn])) return V2[fn];
  const m = fn.match(/^bbcard_drop_(\d+)\./);
  if (m) for (const c of [`img_${m[1]}.jpeg`, `img_${Number(m[1])}.jpeg`, `img_${m[1]}.jpg`]) {
    if (INDEX.has(c)) return INDEX.get(c)!;
  }
  return null;
}

const ALL = process.argv.includes('--all');
const ONE = process.argv.includes('--item') ? process.argv[process.argv.indexOf('--item') + 1] : '';

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = fk(o[kk], k); if (r) return r;
  }
  return undefined;
}
let TOK = '';
const trading = async (call: string, body: string) => (await fetch('https://api.ebay.com/ws/api.dll', {
  method: 'POST',
  headers: {
    'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
    'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': TOK, 'Content-Type': 'text/xml',
  },
  body,
})).text();

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** eBay hands back XML-escaped values; they must go back out identically. */
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The supersize master of whatever eBay is already hosting. */
const master = (u: string) => u.replace(/\$_\d+\.JPE?G.*$/i, '$_57.JPG');

async function fetchImage(url: string): Promise<Buffer | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 1000 && b[0] === 0xff && b[1] === 0xd8) return b;
      }
    } catch { /* retry */ }
  }
  return null;
}

async function eps(jpeg: Buffer, name: string): Promise<string | null> {
  const B = '----eps' + Date.now() + Math.random().toString(36).slice(2);
  const xml = '<?xml version="1.0" encoding="utf-8"?><UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + `<PictureName>${name}</PictureName><PictureSet>Supersize</PictureSet></UploadSiteHostedPicturesRequest>`;
  const head = Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml;charset=utf-8\r\n\r\n${xml}\r\n`
    + `--${B}\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: application/octet-stream\r\nContent-Transfer-Encoding: binary\r\n\r\n`, 'utf8');
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': TOK,
      'Content-Type': `multipart/form-data; boundary=${B}`,
    },
    body: Buffer.concat([head, jpeg, Buffer.from(`\r\n--${B}--\r\n`, 'utf8')]),
  });
  return (await r.text()).match(/<FullURL>([^<]*)</)?.[1] ?? null;
}

type Set_ = { value: string; pics: string[] };
type Listing = { id: string; title: string; main: string[]; specName: string; sets: Set_[] };

function parse(x: string, id: string): Listing {
  const title = (x.match(/<Title>([^<]*)</)?.[1] ?? '').slice(0, 46);
  // Variation pictures live inside <Variations><Pictures>; strip that block out
  // first so the gallery pictures can be read without swallowing them.
  const picsBlock = x.match(/<Pictures>([\s\S]*?)<\/Pictures>/)?.[1] ?? '';
  const outside = x.replace(/<Pictures>[\s\S]*?<\/Pictures>/, '');
  const main = [...outside.matchAll(/<PictureURL>([^<]*)</g)].map((m) => m[1]);
  const specName = unesc(picsBlock.match(/<VariationSpecificName>([^<]*)</)?.[1] ?? 'Card');
  const sets: Set_[] = [];
  for (const m of picsBlock.matchAll(/<VariationSpecificPictureSet>([\s\S]*?)<\/VariationSpecificPictureSet>/g)) {
    const b = m[1];
    sets.push({
      value: unesc(b.match(/<VariationSpecificValue>([^<]*)</)?.[1] ?? ''),
      pics: [...b.matchAll(/<PictureURL>([^<]*)</g)].map((p) => p[1]),
    });
  }
  return { id, title, main, specName, sets };
}

async function migrate(l: Listing) {
  const total = l.main.length + l.sets.reduce((s, v) => s + v.pics.length, 0);
  console.log(`\n${l.id}  ${l.title}`);
  console.log(`   ${l.main.length} gallery + ${l.sets.length} variation sets = ${total} photos`);

  const cache = new Map<string, string>();
  let uploaded = 0, reused = 0, failed = 0;
  const move = async (u: string, tag: string): Promise<string | null> => {
    if (!u.includes('supabase') && u.includes('i.ebayimg.com')) {
      // Already eBay-hosted, but a self-hosted URL cannot sit beside EPS ones,
      // so it still has to be re-uploaded through EPS.
    }
    if (cache.has(u)) { reused++; return cache.get(u)!; }
    const loc = localFor(u);
    const raw = loc ? readFileSync(loc)
      : (u.includes('i.ebayimg.com') ? await fetchImage(master(u)) : null);
    if (!raw) { failed++; console.log(`      no source: ${u.split('/').pop()}`); return null; }
    const bytes = await sharp(raw).rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    const got = await eps(bytes, `${l.id}_${tag}`);
    if (!got) { failed++; return null; }
    cache.set(u, got);
    uploaded++;
    return got;
  };

  const mainEps: string[] = [];
  for (const [i, u] of l.main.entries()) {
    const got = await move(u, `g${i}`);
    if (got) mainEps.push(got);
  }
  const setEps: { value: string; pics: string[] }[] = [];
  for (const [i, s] of l.sets.entries()) {
    const pics: string[] = [];
    for (const [k, u] of s.pics.entries()) {
      const got = await move(u, `v${i}_${k}`);
      if (got) pics.push(got);
    }
    if (pics.length !== s.pics.length) {
      console.log(`   >>> set "${s.value.slice(0, 40)}" ${pics.length}/${s.pics.length}, ABORTING listing`);
      return false;
    }
    setEps.push({ value: s.value, pics });
  }
  if (mainEps.length !== l.main.length) {
    console.log(`   >>> gallery ${mainEps.length}/${l.main.length}, ABORTING listing`);
    return false;
  }
  console.log(`   uploaded ${uploaded}, deduped ${reused}, failed ${failed}`);

  // Only PictureDetails and Variations>Pictures. No <Variation> nodes, so no
  // quantity is touched.
  const body = '<?xml version="1.0" encoding="utf-8"?>'
    + '<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>'
    + `<ItemID>${l.id}</ItemID>`
    + `<PictureDetails>${mainEps.map((u) => `<PictureURL>${u}</PictureURL>`).join('')}</PictureDetails>`
    + (setEps.length
      ? '<Variations><Pictures>'
        + `<VariationSpecificName>${esc(l.specName)}</VariationSpecificName>`
        + setEps.map((s) => '<VariationSpecificPictureSet>'
          + `<VariationSpecificValue>${esc(s.value)}</VariationSpecificValue>`
          + s.pics.map((u) => `<PictureURL>${u}</PictureURL>`).join('')
          + '</VariationSpecificPictureSet>').join('')
        + '</Pictures></Variations>'
      : '')
    + '</Item></ReviseFixedPriceItemRequest>';

  const res = await trading('ReviseFixedPriceItem', body);
  const ack = res.match(/<Ack>([^<]*)</)?.[1];
  console.log(`   Revise: ${ack}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) {
    const t = m[1];
    if (!/business policies/i.test(t)) console.log(`      ${t.slice(0, 180)}`);
  }
  return ack === 'Success' || ack === 'Warning';
}

async function main() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  TOK = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(fk(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json()).access_token;

  const list = await trading('GetMyeBaySelling',
    '<?xml version="1.0" encoding="utf-8"?><GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">'
    + '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>1</PageNumber></Pagination></ActiveList>'
    + '</GetMyeBaySellingRequest>');
  const ids = [...list.matchAll(/<ItemID>(\d+)</g)].map((m) => m[1]);

  const todo: Listing[] = [];
  for (const id of ids) {
    if (ONE && id !== ONE) continue;
    const x = await trading('GetItem',
      `<?xml version="1.0" encoding="utf-8"?><GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${id}</ItemID><IncludeVariations>true</IncludeVariations><DetailLevel>ReturnAll</DetailLevel></GetItemRequest>`);
    const l = parse(x, id);
    const all = [...l.main, ...l.sets.flatMap((s) => s.pics)];
    if (!all.some((u) => u.includes('supabase'))) continue;
    todo.push(l);
  }
  todo.sort((a, b) => (a.main.length + a.sets.length) - (b.main.length + b.sets.length));

  console.log(`${todo.length} listings to migrate`);
  for (const l of todo) {
    const n = l.main.length + l.sets.reduce((s, v) => s + v.pics.length, 0);
    console.log(`   ${l.id}  ${String(n).padStart(3)} photos, ${String(l.sets.length).padStart(3)} sets   ${l.title}`);
  }
  if (!ALL && !ONE) { console.log('\nplan only. --item <id> for one, --all for everything'); return; }

  let ok = 0, bad = 0;
  for (const l of todo) { (await migrate(l)) ? ok++ : bad++; }
  console.log(`\n${ok} migrated, ${bad} failed`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
