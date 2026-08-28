/**
 * Rebuild the bulk lot listing (168645350776) so it actually says what is in it.
 *
 * Michael's complaint, and he is right: the first version said "41 SR + 76 R"
 * and showed 20 of 117 cards as a "representative sample". A buyer could not
 * tell whether they were getting 41 different SRs or four copies of ten, nor
 * which R numbers were present. For a lot whose whole pitch is set-building
 * progress, the contents ARE the product.
 *
 * This version:
 *   - itemises every card with its number, character and count
 *   - shows all 61 DISTINCT cards across three montages, not a sample
 *   - keeps the price; the fix is disclosure, not discount
 *
 *   npx tsx scripts/fix-naruto-bulk-0828.ts            # preview
 *   npx tsx scripts/fix-naruto-bulk-0828.ts --apply    # host photos + ReviseItem
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { listCardsInSet } from './lib/narutodb';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const ITEM = '168645350776';
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
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok, 'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

async function montage(photos: number[], cols: number, cell = 340): Promise<Buffer> {
  const rows = Math.ceil(photos.length / cols);
  const h = Math.round(cell * 1.33);
  const tiles = await Promise.all(photos.map((n) =>
    sharp(readFileSync(`${PHOTOS}/IMG_${n}.JPEG`)).rotate()
      .resize(cell, h, { fit: 'cover', position: 'centre' }).toBuffer()));
  return sharp({ create: { width: cols * cell, height: rows * h, channels: 3, background: '#111111' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * h })))
    .jpeg({ quality: 84 }).toBuffer();
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
  const name = new Map(cards.map((c) => [c.card_number.toUpperCase(), c.character_name ?? '?']));
  const num = (c: string) => c.split('-')[2].replace(/L\d$/, '');

  // SR entries here are the SPARES: one copy of each stays with the complete set.
  const SR = cards.filter((c) => c.rarity_code === 'SR').map((c) => c.card_number.toUpperCase());
  const R = cards.filter((c) => c.rarity_code === 'R').map((c) => c.card_number.toUpperCase());
  const srSpare = SR.map((c) => ({ c, n: (byCode.get(c)?.length ?? 0) - 1 })).filter((x) => x.n > 0);
  const rHave = R.map((c) => ({ c, n: byCode.get(c)?.length ?? 0 })).filter((x) => x.n > 0);
  const srTotal = srSpare.reduce((a, x) => a + x.n, 0);
  const rTotal = rHave.reduce((a, x) => a + x.n, 0);

  const li = (x: { c: string; n: number }) =>
    `<li>SR-${num(x.c)} ${name.get(x.c)}${x.n > 1 ? ` <strong>x${x.n}</strong>` : ''}</li>`;
  const liR = (x: { c: string; n: number }) =>
    `<li>R-${num(x.c)} ${name.get(x.c)}${x.n > 1 ? ` <strong>x${x.n}</strong>` : ''}</li>`;

  const desc = [
    `<p><strong>${srTotal + rTotal} Kayou Naruto Earth Scroll Series 2 cards: ${srTotal} SR and ${rTotal} R.</strong> English NA release, pulled from sealed Kayou collector boxes.</p>`,
    `<p>The R cards cover <strong>${rHave.length} of the 50</strong> in the base set, so this is a genuine head start rather than a stack of the same few. Every card in the lot is listed below and every distinct card is photographed.</p>`,
    `<h3>SR included (${srSpare.length} different, ${srTotal} cards)</h3><ul>${srSpare.map(li).join('')}</ul>`,
    `<h3>R included (${rHave.length} different, ${rTotal} cards)</h3><ul>${rHave.map(liR).join('')}</ul>`,
    `<p><strong>Not included:</strong> R-002, R-007, R-012, R-013, R-014, R-018, R-021, R-031 and R-036 are the nine base-set cards missing from this lot.</p>`,
    '<p>Near mint or better. These were sorted card by card, not shuffled loose in a box.</p>',
    '<p>Ships bundled and protected with tracking. Ships within 1 business day.</p>',
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  console.log(`bulk lot ${ITEM}`);
  console.log(`  ${srSpare.length} distinct SR / ${srTotal} cards`);
  console.log(`  ${rHave.length} distinct R  / ${rTotal} cards`);
  console.log(`  ${srTotal + rTotal} cards total, ${srSpare.length + rHave.length} distinct photographed`);
  console.log(`  description ${desc.length} chars, itemised`);
  if (!APPLY) { console.log('\npreview only'); return; }

  const sheets: [string, number[], number][] = [
    ['naruto_lot_bulk.jpg', rHave.slice(0, 21).map((x) => byCode.get(x.c)![0]), 7],
    ['naruto_lot_bulk_r2.jpg', rHave.slice(21).map((x) => byCode.get(x.c)![0]), 5],
    ['naruto_lot_bulk_sr.jpg', srSpare.map((x) => byCode.get(x.c)![0]), 5],
  ];
  const urls: string[] = [];
  for (const [file, photos, cols] of sheets) {
    const buf = await montage(photos, cols);
    const { error } = await supa.storage.from('ebay-listings').upload(file, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${file}: ${error.message}`);
    urls.push(supa.storage.from('ebay-listings').getPublicUrl(file).data.publicUrl);
    console.log(`  ${file}: ${photos.length} cards, ${(buf.length / 1024).toFixed(0)}KB`);
  }

  // New filenames for the two extra sheets; the first reuses its name, so bump
  // it with a query string. eBay caches by URL and would otherwise keep serving
  // the old 20-card sample.
  urls[0] = `${urls[0]}?v=2`;

  const tok = await userToken();
  const xml = `<?xml version="1.0" encoding="utf-8"?><ReviseItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${ITEM}</ItemID>` +
    `<Description><![CDATA[${desc}]]></Description>` +
    `<PictureDetails>${urls.map((u) => `<PictureURL>${u}</PictureURL>`).join('')}</PictureDetails>` +
    `</Item></ReviseItemRequest>`;
  const res = await trading(tok, 'ReviseItem', xml);
  console.log(`\nReviseItem: ${res.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  ${m[1].slice(0, 200)}`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
