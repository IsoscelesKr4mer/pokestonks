/**
 * Michael wants front AND back of every card on the complete-SR-set listing
 * (168645350740), on top of the collage.
 *
 * 20 fronts + 20 backs is 40 images and eBay caps a listing at 24, so each card
 * gets ONE image with its front and back side by side. 20 of those plus the
 * collage is 21, and a buyer checking card 12 sees both faces in one picture
 * instead of hunting for its partner.
 *
 * The back is asserted, not assumed: photos run front-then-back, but the R
 * batches broke that parity elsewhere in this drop, so each candidate back is
 * brightness-checked (Kayou backs are pale, fronts are dark art) and the script
 * refuses rather than pairing a card with another card's front.
 *
 *   npx tsx scripts/fix-naruto-srset-photos-0828.ts            # check pairing
 *   npx tsx scripts/fix-naruto-srset-photos-0828.ts --apply    # host + revise
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { listCardsInSet } from './lib/narutodb';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168645350740';
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PHOTOS = 'eBay_assets/card drop';

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function userToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(findKey(cfg, 'EBAY_USER_REFRESH_TOKEN')!) +
      '&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope/sell.inventory'),
  })).json();
  return j.access_token as string;
}

/** Mean brightness of the card area. Kayou backs are pale; fronts are dark art. */
async function brightness(n: number): Promise<number> {
  const { data, info } = await sharp(readFileSync(`${PHOTOS}/IMG_${n}.JPEG`))
    .rotate().extract({ left: 230, top: 300, width: 1070, height: 1120 })
    .greyscale().resize(48, 48).raw().toBuffer({ resolveWithObject: true });
  let s = 0; for (let i = 0; i < data.length; i++) s += data[i];
  return s / data.length / 255;
}

async function main() {
  const lines = readFileSync('data/naruto_cards_0828.tsv', 'utf8').trim().split(/\r?\n/)
    .filter((l) => !l.startsWith('#')).slice(1);
  const byCode = new Map<string, number[]>();
  for (const l of lines) {
    const [photo, raw] = l.split('\t');
    if (!raw || raw === '?') continue;
    const code = raw.replace('-DUR-', '-◇UR-').toUpperCase();
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(Number(photo));
  }
  const cards = await listCardsInSet('NREA02');
  const SR = cards.filter((c) => c.rarity_code === 'SR');

  const pairs: { code: string; name: string; front: number; back: number }[] = [];
  const bad: string[] = [];
  for (const c of SR) {
    const code = c.card_number.toUpperCase();
    const fronts = byCode.get(code) ?? [];
    let picked: { f: number; b: number } | null = null;
    for (const f of fronts) {
      const b = f + 1;
      if (!existsSync(`${PHOTOS}/IMG_${b}.JPEG`)) continue;
      const [bf, bb] = [await brightness(f), await brightness(b)];
      if (bb > 0.66 && bb > bf) { picked = { f, b }; break; }
    }
    if (!picked) { bad.push(`${code} (fronts ${fronts.join(',')})`); continue; }
    pairs.push({ code, name: c.character_name ?? '?', front: picked.f, back: picked.b });
  }

  console.log(`${pairs.length}/20 SR cards paired front+back`);
  for (const p of pairs) console.log(`  ${p.code}  ${String(p.name).padEnd(20)} front ${p.front} / back ${p.back}`);
  if (bad.length) { console.log(`\nNO CONFIRMED BACK for: ${bad.join('; ')}`); }
  if (!APPLY) { console.log('\ncheck only'); return; }
  if (bad.length) { console.error('\nrefusing to publish a partial set of pairs'); process.exit(1); }

  const urls: string[] = [supa.storage.from('ebay-listings').getPublicUrl('naruto_lot_srset.jpg').data.publicUrl];
  for (const p of pairs) {
    const [f, b] = await Promise.all([p.front, p.back].map((n) =>
      sharp(readFileSync(`${PHOTOS}/IMG_${n}.JPEG`)).rotate().resize(760, 1010, { fit: 'cover' }).toBuffer()));
    const buf = await sharp({ create: { width: 1540, height: 1010, channels: 3, background: '#111111' } })
      .composite([{ input: f, left: 0, top: 0 }, { input: b, left: 780, top: 0 }])
      .jpeg({ quality: 88 }).toBuffer();
    const file = `naruto_sr_${p.code.replace(/[^A-Za-z0-9]/g, '')}_fb.jpg`;
    const { error } = await supa.storage.from('ebay-listings').upload(file, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${file}: ${error.message}`);
    urls.push(supa.storage.from('ebay-listings').getPublicUrl(file).data.publicUrl);
  }
  console.log(`\nhosted ${urls.length} images (collage + ${pairs.length} front/back pairs)`);

  const tok = await userToken();
  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
    `<PictureDetails>${urls.map((u) => `<PictureURL>${u}</PictureURL>`).join('')}</PictureDetails>` +
    `</Item></ReviseItemRequest>`;
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'ReviseItem', 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body: xml,
  });
  const t = await r.text();
  console.log(`ReviseItem: ${t.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of t.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  ${m[1].slice(0, 180)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
