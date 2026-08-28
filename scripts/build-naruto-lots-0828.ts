/**
 * The two Naruto listings that are NOT the you-pick:
 *
 *   1. the COMPLETE 20/20 SR set, sold as one lot
 *   2. the leftovers, 41 spare SRs + 76 Rs = 117 cards, as a bulk lot
 *
 *   npx tsx scripts/build-naruto-lots-0828.ts            # dry run
 *   npx tsx scripts/build-naruto-lots-0828.ts --apply    # montages + eBay verify
 *   npx tsx scripts/build-naruto-lots-0828.ts --publish  # only on Michael's go-ahead
 *
 * Selling the SR set whole rather than as dropdown rows is the whole point:
 * he has exactly ONE complete set (three cards sit at a single copy), complete
 * sets list at $24-27, and the same 20 cards scattered through a you-pick would
 * each net about a dollar after the $0.40 fee floor.
 *
 * Photos are montages built from the card photos already taken. A grid of the
 * actual 20 fronts proves the set is complete far better than a photo of a
 * stack, and it needs nothing new from Michael.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { listCardsInSet, listAllPrices } from './lib/narutodb';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const PHOTOS = 'eBay_assets/card drop';
const CATEGORY = '183455'; // CCG Mixed Card Lots
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '272052757012' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  return name ? `<${name}>${typeof node === 'string' ? esc(node) : String(node)}</${name}>` : String(node);
}
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

/** Grid of card fronts. Cards are shot on black, so the montage sits on black too. */
async function montage(photos: number[], cols: number, cell = 420): Promise<Buffer> {
  const rows = Math.ceil(photos.length / cols);
  const tiles = await Promise.all(photos.map(async (n) =>
    sharp(readFileSync(`${PHOTOS}/IMG_${n}.JPEG`)).rotate()
      .resize(cell, Math.round(cell * 1.33), { fit: 'cover', position: 'centre' }).toBuffer()));
  const h = Math.round(cell * 1.33);
  return sharp({ create: { width: cols * cell, height: rows * h, channels: 3, background: '#111111' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * h })))
    .jpeg({ quality: 86 }).toBuffer();
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
  const [cards, prices] = await Promise.all([listCardsInSet('NREA02'), listAllPrices()]);
  const priceBy = new Map(prices.map((p) => [p.card_number.toUpperCase(), p]));
  const tierCodes = (t: string) => cards.filter((c) => c.rarity_code === t).map((c) => c.card_number.toUpperCase());

  const SR = tierCodes('SR'), R = tierCodes('R');
  const srSetPhotos = SR.map((c) => byCode.get(c)![0]);
  const srComp = SR.reduce((a, c) => a + (priceBy.get(c)?.price_last_cents ?? 0), 0);
  const spareSR = SR.reduce((a, c) => a + (byCode.get(c)!.length - 1), 0);
  const rCopies = R.reduce((a, c) => a + (byCode.get(c)?.length ?? 0), 0);
  const rDistinct = R.filter((c) => byCode.has(c)).length;

  const SET_PRICE = '24.99';
  const BULK_PRICE = '29.99';

  const listings = [
    {
      key: 'srset',
      title: 'Naruto Kayou Earth Scroll 2 COMPLETE SR Set 20 Cards NREA02 English Near Mint',
      price: SET_PRICE,
      photos: srSetPhotos, cols: 5,
      oz: 5,
      desc: [
        `<p><strong>Complete SR set from Kayou Naruto Earth Scroll Series 2 (NREA02). All 20 SR cards, SR-001 through SR-020.</strong></p>`,
        '<p>English NA release. Every card pulled from a sealed Kayou collector box and sleeved straight away. Near mint or better.</p>',
        '<p>The photo shows all 20 actual cards in this lot, in card-number order. Nothing is substituted and nothing is missing.</p>',
        '<p>Ships in penny sleeves and a toploader or Card Saver I, protected between rigid cardboard, with tracking. Ships within 1 business day.</p>',
        '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
      ].join(''),
      specifics: [
        { Name: 'Game', Value: 'Naruto' }, { Name: 'Manufacturer', Value: 'Kayou' },
        { Name: 'Set', Value: 'Earth Scroll Series 2' }, { Name: 'Language', Value: 'English' },
        { Name: 'Rarity', Value: 'SR' }, { Name: 'Graded', Value: 'No' },
        { Name: 'Number of Cards', Value: '20' },
      ],
      note: `20 cards, narutodb comps $${(srComp / 100).toFixed(2)}`,
    },
    {
      key: 'bulk',
      title: `Naruto Kayou Earth Scroll 2 Bulk Lot ${spareSR + rCopies} Cards ${spareSR} SR + ${rCopies} R English`,
      price: BULK_PRICE,
      photos: R.filter((c) => byCode.has(c)).slice(0, 20).map((c) => byCode.get(c)![0]), cols: 5,
      oz: 10,
      desc: [
        `<p><strong>Bulk lot of ${spareSR + rCopies} Kayou Naruto Earth Scroll Series 2 cards: ${spareSR} SR and ${rCopies} R.</strong></p>`,
        `<p>The R cards cover <strong>${rDistinct} of the 50</strong> in the set, so this is a real head start on the base set rather than ${rCopies} copies of the same handful.</p>`,
        '<p>English NA release, pulled from sealed Kayou collector boxes. Near mint or better; these were sorted, not shuffled around.</p>',
        '<p>The photo shows a representative sample of the R cards included, not the entire lot.</p>',
        '<p>Ships bundled and protected with tracking. Ships within 1 business day.</p>',
        '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
      ].join(''),
      specifics: [
        { Name: 'Game', Value: 'Naruto' }, { Name: 'Manufacturer', Value: 'Kayou' },
        { Name: 'Set', Value: 'Earth Scroll Series 2' }, { Name: 'Language', Value: 'English' },
        { Name: 'Graded', Value: 'No' }, { Name: 'Number of Cards', Value: String(spareSR + rCopies) },
      ],
      note: `${spareSR} spare SR + ${rCopies} R across ${rDistinct}/50 distinct`,
    },
  ];

  for (const l of listings) {
    console.log(`\n${l.title}\n  ${l.title.length}/80 chars  $${l.price}  ${l.note}`);
    if (l.title.length > 80) { console.error('  TITLE TOO LONG'); process.exit(1); }
  }
  if (!APPLY && !PUBLISH) { console.log('\ndry run'); return; }

  const tok = await userToken();
  for (const l of listings) {
    const buf = await montage(l.photos, l.cols);
    const name = `naruto_lot_${l.key}.jpg`;
    const { error } = await supa.storage.from('ebay-listings').upload(name, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    const url = supa.storage.from('ebay-listings').getPublicUrl(name).data.publicUrl;
    console.log(`\n${l.key}: montage ${(buf.length / 1024).toFixed(0)}KB from ${l.photos.length} card photos`);

    const item = toXml({
      Title: l.title,
      Description: `<![CDATA[${l.desc}]]>`,
      PrimaryCategory: { CategoryID: CATEGORY },
      // 183455 (CCG Mixed Card Lots) accepts ONLY 1000 New or 3000 Used, and
      // takes no ConditionDescriptors -- those belong to the graded-card
      // categories. 3000 is also the honest call: these came out of the packs.
      ConditionID: 3000,
      Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
      ListingDuration: 'GTC', ListingType: 'FixedPriceItem', DispatchTimeMax: 1, Quantity: 1,
      StartPrice: l.price,
      SellerProfiles: {
        SellerPaymentProfile: { PaymentProfileID: POLICIES.payment },
        SellerReturnProfile: { ReturnProfileID: POLICIES.ret },
        SellerShippingProfile: { ShippingProfileID: POLICIES.ship },
      },
      ItemSpecifics: { NameValueList: l.specifics },
      PictureDetails: { PictureURL: url },
    });
    const wrap = (call: string) => `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>${item}</Item></${call}Request>`;

    const v = await trading(tok, 'VerifyAddFixedPriceItem', wrap('VerifyAddFixedPriceItem'));
    const ack = v.match(/<Ack>([^<]*)</)?.[1];
    console.log(`  Verify: ${ack}`);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`    ${m[1].slice(0, 180)}`);
    if (ack !== 'Success' && ack !== 'Warning') continue;
    if (!PUBLISH) { console.log('  verified, NOT listed'); continue; }
    const res = await trading(tok, 'AddFixedPriceItem', wrap('AddFixedPriceItem'));
    const id = res.match(/<ItemID>(\d+)</)?.[1];
    console.log(`  AddFixedPriceItem ${res.match(/<Ack>([^<]*)</)?.[1]}  item ${id ?? '-'}`);
    if (id) console.log(`    https://www.ebay.com/itm/${id}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
