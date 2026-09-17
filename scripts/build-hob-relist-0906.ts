/**
 * Hobbit recovery plan, 2026-09-06. Michael opened two $70 Collector Boosters
 * and got $25.42 of cards back; he wants the money out reliably, not maximally.
 *
 *   npx tsx scripts/build-hob-relist-0906.ts            # dry run, prints the plan
 *   npx tsx scripts/build-hob-relist-0906.ts --apply    # montages + eBay verify
 *   npx tsx scripts/build-hob-relist-0906.ts --publish  # revise + list for real
 *
 * Same rule as the 2026-08-30 bulk (build-hob-bulk-0830.ts): list individually
 * only the cards actually worth a listing, bulk everything else. Last time that
 * threshold was Belladonna Took at $4.42. This time two cards clear it:
 *
 *   Wizard's Staff #294 extended art   $6.07
 *   The Eagles Are Coming! #205 FOIL   $6.71
 *
 * Everything else averages $0.45. An individual listing on a $0.45 card nets
 * pennies after the $0.40 fee, so those 28 join the existing lot.
 *
 * WHY THE EXISTING LOT HAS NOT SOLD: #168651323986 asks $8.99 for 28 cards worth
 * $5.63 on Scryfall, which is 160% of sum-of-parts. Seven days live, zero
 * watchers. Merging the new foils in and repricing fixes both problems at once:
 * the lot becomes 56 cards / 28 foils worth $18.27, asking $12.99, i.e. 71% of
 * parts instead of 160%.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const LOT_ONLY = process.argv.includes('--lot-only'); // revise the lot, leave the singles alone
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const LOT_ITEM = '168651323986';
const CAT_LOT = '183455';      // CCG Mixed Card Lots
const CAT_SINGLE = '183454';   // CCG Individual Cards
const POL = { pay: '269110704012', ret: '269110705012', ese: '272052757012', ground: '269110723012' };
const DROP = 'eBay_assets/card drop';

type C = { name: string; num: string; foil: boolean; usd: number; set?: string; note?: string };

/** The 28 already inside lot #168651323986, from build-hob-bulk-0830.ts. */
const OLD: C[] = [
  { name: 'The Lonely Mountain', num: '187', foil: false, usd: 0.91 },
  { name: 'Desert Were-Worm', num: '92', foil: false, usd: 0.39 },
  { name: 'Key to the Side-Door', num: '175', foil: false, usd: 0.26 },
  { name: 'Silvan Reveler', num: '163', foil: false, usd: 0.25 },
  { name: 'Crude Bent Blade', num: '63', foil: true, usd: 0.23 },
  { name: 'Dwarven Shortsword', num: '10', foil: true, usd: 0.23 },
  { name: "Old Fat Spider Can't See Me", num: '50', foil: false, usd: 0.23 },
  { name: 'Stony-Voiced Goblins', num: '85', foil: false, usd: 0.22 },
  { name: 'Ravenhill Flock', num: '52', foil: false, usd: 0.21 },
  { name: 'Attercop', num: '116', foil: false, usd: 0.19 },
  { name: 'Plains', num: '189', foil: true, usd: 0.19 },
  { name: "The Mountain-king's Return", num: '22', foil: false, usd: 0.19 },
  { name: 'Confusticate and Bebother', num: '35', foil: false, usd: 0.17 },
  { name: 'Goblin Plate Mail', num: '157', foil: false, usd: 0.17 },
  { name: 'Ordinary Bear', num: '133', foil: false, usd: 0.17 },
  { name: 'Old Thrush', num: '2', foil: false, usd: 0.16 },
  { name: "Elvenking's Halls", num: '182', foil: false, usd: 0.15 },
  { name: 'Goblin-town Flunkies', num: '100', foil: false, usd: 0.15 },
  { name: "Galion, Elvenking's Butler", num: '125', foil: false, usd: 0.14 },
  { name: 'Lakeshore Apothecary', num: '43', foil: false, usd: 0.14 },
  { name: 'Dwarven Shortsword', num: '10', foil: false, usd: 0.13 },
  { name: 'Ragged Short Spear', num: '108', foil: false, usd: 0.13 },
  { name: 'Reverent Howl', num: '81', foil: false, usd: 0.13 },
  { name: 'Lake-town Lookout', num: '18', foil: false, usd: 0.12 },
  { name: "Elvenking's Harper", num: '38', foil: false, usd: 0.10 },
  { name: 'Moment of Glory', num: '21', foil: false, usd: 0.10 },
  { name: 'Patient Instructor', num: '162', foil: false, usd: 0.09 },
  { name: 'Gundabad Opportunist', num: '101', foil: false, usd: 0.08 },
];

/** The two 2026-09-06 Collector Boosters. Collector numbers read off each card,
 *  foil taken from the star vs dot in the HOB*EN / HOB.EN line. img = photo. */
const NEW: (C & { img: number })[] = [
  { img: 2773, name: "Last Light of Durin's Day", num: '103', foil: true, usd: 0.35 },
  { img: 2774, name: 'Bejeweled Warg', num: '117', foil: true, usd: 0.34 },
  { img: 2775, name: 'Dwalin, Weaponmaster', num: '311', foil: false, usd: 1.30, note: 'extended art' },
  { img: 2776, name: 'Most Decrepit Old Bird // Speak Secrets', num: '221', foil: true, usd: 0.85, note: 'showcase borderless' },
  { img: 2777, name: 'Plains', num: '194', foil: true, usd: 0.44 },
  { img: 2778, name: 'Troop of Ponies', num: '199', foil: true, usd: 0.50, note: 'borderless' },
  { img: 2779, name: 'Misty Mountains Raider', num: '105', foil: true, usd: 0.30 },
  { img: 2780, name: 'Down, Down to Goblin-town', num: '65', foil: true, usd: 0.29 },
  { img: 2781, name: 'Bothersome Noisemaker', num: '89', foil: true, usd: 0.35 },
  { img: 2782, name: "Thorin's Last Stand", num: '209', foil: true, usd: 0.30, note: 'borderless' },
  { img: 2783, name: 'Patient Instructor', num: '162', foil: true, usd: 0.16 },
  { img: 2784, name: 'Dwarven Provisioner', num: '9', foil: true, usd: 0.12 },
  { img: 2785, name: 'Goblin-town Flunkies', num: '100', foil: true, usd: 0.29 },
  { img: 2786, name: 'Guardian of the Halls', num: '127', foil: true, usd: 0.18 },
  { img: 2789, name: 'Goblin-town Flunkies', num: '100', foil: true, usd: 0.29 },
  { img: 2790, name: 'Dwarven Provisioner', num: '9', foil: true, usd: 0.12 },
  { img: 2791, name: 'Patient Instructor', num: '162', foil: true, usd: 0.16 },
  { img: 2792, name: "Thorin's Last Stand", num: '28', foil: true, usd: 0.18 },
  { img: 2793, name: 'Front Porch Sentries', num: '67', foil: true, usd: 0.19 },
  { img: 2794, name: 'Troll Negotiations', num: '138', foil: true, usd: 0.21 },
  { img: 2795, name: 'Gandalf, Spark Starter', num: '97', foil: true, usd: 0.26 },
  { img: 2796, name: 'Elven Raft-Steerer', num: '37', foil: true, usd: 0.37 },
  { img: 2797, name: 'Great Ugly-Looking Goblin // Clap! Snap!', num: '259', foil: true, usd: 1.40, note: 'SURGE FOIL' },
  { img: 2798, name: 'Swamp', num: '196', foil: true, usd: 0.48 },
  { img: 2799, name: 'Head of the Hunt', num: '75', foil: true, usd: 0.42 },
  { img: 2800, name: 'Rhovanion Rampager', num: '82', foil: true, usd: 0.33 },
  { img: 2801, name: 'The Eagles Are Coming!', num: '205', foil: false, usd: 1.95, note: 'borderless' },
  { img: 2802, name: "Bilbo's Burglaring", num: '10', foil: false, usd: 0.51, set: 'HOC', note: 'Hobbit Eternal, borderless' },
];

/** Pulled out of the lot and listed on their own. */
const SINGLES = [
  {
    img: 2787, sku: 'MTG-HOB-294',
    name: "Wizard's Staff", num: '294', foil: false, usd: 6.07, price: '5.49',
    title: "MTG The Hobbit Wizard's Staff #294 Extended Art Rare LOTR Magic Near Mint",
    treat: 'Extended Art', rarity: 'Rare',
    blurb: 'Extended-art Equipment from The Hobbit. Non-foil.',
  },
  {
    img: 2803, sku: 'MTG-HOB-205F',
    name: 'The Eagles Are Coming!', num: '205', foil: true, usd: 6.71, price: '5.99',
    title: 'MTG The Hobbit The Eagles Are Coming #205 Borderless FOIL Rare LOTR Magic',
    treat: 'Borderless', rarity: 'Rare',
    blurb: 'Borderless foil instant from The Hobbit.',
  },
];

const LOT_PRICE = '12.99';
const LOT_TITLE = 'MTG The Hobbit Bulk Lot 56 Cards 28 Foils Surge Foil Borderless LOTR Magic';

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
function shot(img: number) {
  const f = readdirSync(DROP).find((x) => x.startsWith(`IMG_${img}`) && x.endsWith('.JPEG'));
  if (!f) throw new Error(`no photo for IMG_${img}`);
  return `${DROP}/${f}`;
}
/** Cards are shot 90 degrees counter-clockwise; EXIF does not cover it. */
const upright = (p: string) => sharp(readFileSync(p)).rotate(90);

async function main() {
  const oldTotal = OLD.reduce((a, c) => a + c.usd, 0);
  const newTotal = NEW.reduce((a, c) => a + c.usd, 0);
  const foils = OLD.filter((c) => c.foil).length + NEW.filter((c) => c.foil).length;
  const singlesTotal = SINGLES.reduce((a, s) => a + s.usd, 0);

  console.log(`LOT   ${LOT_TITLE}`);
  console.log(`      ${LOT_TITLE.length}/80 chars   $${LOT_PRICE}`);
  console.log(`      ${OLD.length} old ($${oldTotal.toFixed(2)}) + ${NEW.length} new ($${newTotal.toFixed(2)}) = ${OLD.length + NEW.length} cards, ${foils} foils, $${(oldTotal + newTotal).toFixed(2)} Scryfall`);
  console.log(`      asking ${((+LOT_PRICE / (oldTotal + newTotal)) * 100).toFixed(0)}% of parts (was 160% at $8.99 for the old 28 alone)`);
  for (const s of SINGLES) {
    console.log(`SINGLE ${s.title}`);
    console.log(`      ${s.title.length}/80 chars   $${s.price} vs $${s.usd.toFixed(2)} market (${((+s.price / s.usd) * 100).toFixed(0)}%)`);
  }
  console.log(`\ntotal asked: $${(+LOT_PRICE + SINGLES.reduce((a, s) => a + +s.price, 0)).toFixed(2)} against $${(oldTotal + newTotal + singlesTotal).toFixed(2)} of cards`);
  for (const t of [LOT_TITLE, ...SINGLES.map((s) => s.title)]) {
    if (t.length > 80) { console.error(`TITLE TOO LONG: ${t}`); process.exit(1); }
  }
  if (!APPLY && !PUBLISH) { console.log('\ndry run'); return; }

  // ---- montage of the 28 new lot cards -------------------------------------
  const cell = 360, cols = 7;
  const rows = Math.ceil(NEW.length / cols), h = Math.round(cell * 1.4);
  const tiles = await Promise.all(NEW.map((c) =>
    upright(shot(c.img)).resize(cell, h, { fit: 'cover', position: 'centre' }).toBuffer()));
  const buf = await sharp({ create: { width: cols * cell, height: rows * h, channels: 3, background: '#14161a' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * h })))
    .jpeg({ quality: 86 }).toBuffer();
  writeFileSync('scripts/_hob_new_montage.jpg', buf);
  console.log(`\nmontage ${(buf.length / 1024).toFixed(0)}KB -> scripts/_hob_new_montage.jpg`);

  const singleBufs = await Promise.all(SINGLES.map((s) =>
    upright(shot(s.img)).resize(1600, 1600, { fit: 'inside' }).jpeg({ quality: 90 }).toBuffer()));
  SINGLES.forEach((s, i) => writeFileSync(`scripts/_hob_single_${s.num}.jpg`, singleBufs[i]));
  console.log(`single photos -> scripts/_hob_single_*.jpg`);

  const up = async (path: string, b: Buffer) => {
    const { error } = await supa.storage.from('ebay-listings').upload(path, b, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    return supa.storage.from('ebay-listings').getPublicUrl(path).data.publicUrl;
  };
  const montageUrl = await up('mtg_hobbit_bulk_lot_2.jpg', buf);
  const singleUrls = await Promise.all(SINGLES.map((s, i) => up(`mtg_hobbit_${s.num}${s.foil ? 'f' : ''}.jpg`, singleBufs[i])));
  const oldUrl = supa.storage.from('ebay-listings').getPublicUrl('mtg_hobbit_bulk_lot.jpg').data.publicUrl;
  console.log('uploaded to supabase');

  // ---- lot description ------------------------------------------------------
  const li = (c: C) => `<li>${esc(c.name)} &mdash; ${c.set === 'HOC' ? 'HOC ' : ''}#${c.num}${c.foil ? ' <strong>FOIL</strong>' : ''}${c.note ? ` <em>(${esc(c.note)})</em>` : ''}</li>`;
  const desc = [
    `<p><strong>${OLD.length + NEW.length} cards from Magic: the Gathering &mdash; The Hobbit, including ${foils} foils.</strong> English, near mint.</p>`,
    `<p>${NEW.length} of these came straight out of Collector Boosters, so the lot is mostly foil and carries borderless, showcase, extended-art and one <strong>surge foil</strong> treatment. Every card is listed below by name and collector number. Nothing is substituted.</p>`,
    `<h3>From Collector Boosters (${NEW.length})</h3><ul>${NEW.map(li).join('')}</ul>`,
    `<h3>From Play Boosters (${OLD.length})</h3><ul>${OLD.map(li).join('')}</ul>`,
    `<p>Two double-faced tokens are included as a bonus.</p>`,
    `<p><strong>These are loose, unsleeved cards.</strong> They ship together in a team bag, protected, with tracking. Ships within 1 business day.</p>`,
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  const lotItem = toXml({
    Title: LOT_TITLE,
    Description: `<![CDATA[${desc}]]>`,
    StartPrice: LOT_PRICE,
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Game', Value: 'Magic: The Gathering' },
        { Name: 'Set', Value: 'The Hobbit' },
        { Name: 'Language', Value: 'English' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Number of Cards', Value: String(OLD.length + NEW.length) },
        { Name: 'Finish', Value: 'Mixed' },
      ],
    },
    PictureDetails: { PictureURL: [montageUrl, oldUrl] },
  });

  const tok = await userToken();

  // ---- singles --------------------------------------------------------------
  const singleItem = (s: (typeof SINGLES)[number], url: string) => toXml({
    Title: s.title,
    Description: `<![CDATA[<p><strong>${esc(s.name)} &mdash; #${s.num}, ${esc(s.treat)}${s.foil ? ', FOIL' : ''}.</strong> Magic: the Gathering, The Hobbit (HOB). English, near mint.</p><p>${esc(s.blurb)} Pulled from a Collector Booster and sleeved straight away. The photo is the exact card you receive.</p><p>Ships in a penny sleeve and a toploader or Card Saver I, protected between rigid cardboard, with tracking. Ships within 1 business day.</p><p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>]]>`,
    SKU: s.sku,
    PrimaryCategory: { CategoryID: CAT_SINGLE },
    ConditionID: 4000,
    // 183454 requires Card Condition (40001); 400010 is Near Mint or Better
    ConditionDescriptors: { ConditionDescriptor: { Name: 40001, Value: 400010 } },
    Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
    ListingDuration: 'GTC', ListingType: 'FixedPriceItem', DispatchTimeMax: 1, Quantity: 1,
    StartPrice: s.price,
    SellerProfiles: {
      SellerPaymentProfile: { PaymentProfileID: POL.pay },
      SellerReturnProfile: { ReturnProfileID: POL.ret },
      SellerShippingProfile: { ShippingProfileID: POL.ese },
    },
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Game', Value: 'Magic: The Gathering' },
        { Name: 'Set', Value: 'The Hobbit' },
        { Name: 'Card Name', Value: s.name },
        { Name: 'Card Number', Value: s.num },
        { Name: 'Rarity', Value: s.rarity },
        { Name: 'Finish', Value: s.foil ? 'Foil' : 'Regular' },
        { Name: 'Language', Value: 'English' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Features', Value: s.treat },
      ],
    },
    PictureDetails: { PictureURL: url },
  });

  for (const [i, s] of LOT_ONLY ? [] : SINGLES.entries()) {
    const body = `<?xml version="1.0" encoding="utf-8"?><VerifyAddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>${singleItem(s, singleUrls[i])}</Item></VerifyAddFixedPriceItemRequest>`;
    const v = await trading(tok, 'VerifyAddFixedPriceItem', body);
    const ack = v.match(/<Ack>([^<]*)</)?.[1];
    console.log(`\nVerify single ${s.num}: ${ack}`);
    for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`   ${m[1].slice(0, 220)}`);
    if (ack !== 'Success' && ack !== 'Warning') return;
  }

  const rBody = `<?xml version="1.0" encoding="utf-8"?><ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item><ItemID>${LOT_ITEM}</ItemID>${lotItem}</Item></ReviseFixedPriceItemRequest>`;
  if (!PUBLISH) {
    console.log(`\nlot revise body ready (${rBody.length} bytes). VERIFIED but nothing written. Rerun with --publish.`);
    return;
  }

  const rev = await trading(tok, 'ReviseFixedPriceItem', rBody);
  console.log(`\nRevise lot ${LOT_ITEM}: ${rev.match(/<Ack>([^<]*)</)?.[1]}`);
  for (const m of rev.matchAll(/<LongMessage>([^<]*)</g)) console.log(`   ${m[1].slice(0, 220)}`);

  for (const [i, s] of LOT_ONLY ? [] : SINGLES.entries()) {
    const body = `<?xml version="1.0" encoding="utf-8"?><AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>${singleItem(s, singleUrls[i])}</Item></AddFixedPriceItemRequest>`;
    const res = await trading(tok, 'AddFixedPriceItem', body);
    const id = res.match(/<ItemID>(\d+)</)?.[1];
    console.log(`Add ${s.name} #${s.num}: ${res.match(/<Ack>([^<]*)</)?.[1]}  item ${id ?? '-'}`);
    for (const m of res.matchAll(/<LongMessage>([^<]*)</g)) console.log(`   ${m[1].slice(0, 220)}`);
    if (id) console.log(`   https://www.ebay.com/itm/${id}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 900)); process.exit(1); });
