/**
 * Bulk lot for the 28 unsold MTG Hobbit singles, and end the you-pick.
 *
 *   npx tsx scripts/build-hob-bulk-0830.ts            # dry run
 *   npx tsx scripts/build-hob-bulk-0830.ts --apply    # montage + eBay verify
 *   npx tsx scripts/build-hob-bulk-0830.ts --publish  # only on Michael's go-ahead
 *
 * WHY BULK, when the you-pick was the right call three weeks ago: it already
 * did its job. It sold Belladonna Took for $4.49 against a $4.42 market, which
 * was the one card in the rip worth listing on its own. What is left is 28
 * cards worth $5.63 TOTAL on Scryfall, $0.20 average, all sitting at the $1.49
 * floor -- roughly 7x market. That floor is fee arithmetic, not a price, and no
 * deck-builder pays 7x for a common they can get for a dime.
 *
 * So the tail will not clear at $1.49 no matter how long it sits, and each sale
 * that did clear would net about $1.16 for an envelope's worth of handling.
 *
 * Contents are itemised in full, per the lesson from the Naruto bulk lot: for a
 * lot, the contents ARE the product, and "28 cards" tells a buyer nothing.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, readdirSync, statSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const YOUPICK = '168636653046';
const CATEGORY = '183455'; // CCG Mixed Card Lots
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '272052757012' };
const PRICE = '8.99';
const TITLE = 'MTG The Hobbit Bulk Lot 28 Cards 3 Foils Rares Uncommons Commons LOTR Magic';

/** name, collector number, foil, Scryfall USD as of 2026-08-30 */
const CARDS: [string, number, boolean, number][] = [
  ['The Lonely Mountain', 187, false, 0.91], ['Desert Were-Worm', 92, false, 0.39],
  ['Key to the Side-Door', 175, false, 0.26], ['Silvan Reveler', 163, false, 0.25],
  ['Crude Bent Blade', 63, true, 0.23], ['Dwarven Shortsword', 10, true, 0.23],
  ["Old Fat Spider Can't See Me", 50, false, 0.23], ['Stony-Voiced Goblins', 85, false, 0.22],
  ['Ravenhill Flock', 52, false, 0.21], ['Attercop', 116, false, 0.19],
  ['Plains', 189, true, 0.19], ["The Mountain-king's Return", 22, false, 0.19],
  ['Confusticate and Bebother', 35, false, 0.17], ['Goblin Plate Mail', 157, false, 0.17],
  ['Ordinary Bear', 133, false, 0.17], ['Old Thrush', 2, false, 0.16],
  ["Elvenking's Halls", 182, false, 0.15], ['Goblin-town Flunkies', 100, false, 0.15],
  ["Galion, Elvenking's Butler", 125, false, 0.14], ['Lakeshore Apothecary', 43, false, 0.14],
  ['Dwarven Shortsword', 10, false, 0.13], ['Ragged Short Spear', 108, false, 0.13],
  ['Reverent Howl', 81, false, 0.13], ['Lake-town Lookout', 18, false, 0.12],
  ["Elvenking's Harper", 38, false, 0.10], ['Moment of Glory', 21, false, 0.10],
  ['Patient Instructor', 162, false, 0.09], ['Gundabad Opportunist', 101, false, 0.08],
];

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

async function main() {
  const total = CARDS.reduce((a, c) => a + c[3], 0);
  console.log(`${TITLE}\n  ${TITLE.length}/80 chars   $${PRICE}   category ${CATEGORY}`);
  console.log(`  ${CARDS.length} cards, Scryfall total $${total.toFixed(2)}, average $${(total / CARDS.length).toFixed(2)}`);
  console.log(`  currently listed at 28 x $1.49 = $41.72, which is ${(41.72 / total).toFixed(1)}x market`);
  if (TITLE.length > 80) { console.error('TITLE TOO LONG'); process.exit(1); }
  if (!APPLY && !PUBLISH) { console.log('\ndry run'); return; }

  // Photos: the 30 shots Michael sent on 2026-08-24, one card per frame.
  const INBOX = `${homedir()}/.claude/channels/discord/inbox`;
  const shots = readdirSync(INBOX).filter((f) => f.endsWith('.jpg'))
    .map((f) => ({ f: `${INBOX}/${f}`, t: statSync(`${INBOX}/${f}`).mtimeMs }))
    .filter((x) => x.t > Date.parse('2026-08-24T12:00:00') && x.t < Date.parse('2026-08-25T00:00:00'))
    .sort((a, b) => a.t - b.t).map((x) => x.f);
  console.log(`\n${shots.length} card photos from the 08-24 batch`);

  const cell = 380, cols = 6;
  const pick = shots.slice(0, 24);
  const rows = Math.ceil(pick.length / cols), h = Math.round(cell * 1.4);
  const tiles = await Promise.all(pick.map((p) =>
    sharp(readFileSync(p)).rotate().resize(cell, h, { fit: 'cover', position: 'centre' }).toBuffer()));
  const buf = await sharp({ create: { width: cols * cell, height: rows * h, channels: 3, background: '#14161a' } })
    .composite(tiles.map((input, i) => ({ input, left: (i % cols) * cell, top: Math.floor(i / cols) * h })))
    .jpeg({ quality: 86 }).toBuffer();
  const { error } = await supa.storage.from('ebay-listings').upload('mtg_hobbit_bulk_lot.jpg', buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  const url = supa.storage.from('ebay-listings').getPublicUrl('mtg_hobbit_bulk_lot.jpg').data.publicUrl;
  console.log(`montage ${(buf.length / 1024).toFixed(0)}KB from ${pick.length} cards`);

  const li = CARDS.map(([n, num, foil]) =>
    `<li>${esc(n)} &mdash; #${num}${foil ? ' <strong>FOIL</strong>' : ''}</li>`).join('');
  const desc = [
    `<p><strong>${CARDS.length} cards from Magic: the Gathering &mdash; The Hobbit (HOB), including 3 foils.</strong> English, opened from Play Boosters and sleeved straight away. Near mint.</p>`,
    `<p>Every card in the lot is listed below by name and collector number. Nothing is substituted.</p>`,
    `<h3>Contents</h3><ul>${li}</ul>`,
    `<p>Good starter material for a Hobbit set build or a commander deck. Ships in a sleeve and toploader or Card Saver I, protected, with tracking. Ships within 1 business day.</p>`,
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  const item = toXml({
    Title: TITLE,
    Description: `<![CDATA[${desc}]]>`,
    PrimaryCategory: { CategoryID: CATEGORY },
    ConditionID: 3000, // 183455 takes only 1000 or 3000, and no ConditionDescriptors
    Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
    ListingDuration: 'GTC', ListingType: 'FixedPriceItem', DispatchTimeMax: 1, Quantity: 1,
    StartPrice: PRICE,
    SellerProfiles: {
      SellerPaymentProfile: { PaymentProfileID: POLICIES.payment },
      SellerReturnProfile: { ReturnProfileID: POLICIES.ret },
      SellerShippingProfile: { ShippingProfileID: POLICIES.ship },
    },
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Game', Value: 'Magic: The Gathering' },
        { Name: 'Set', Value: 'The Hobbit' },
        { Name: 'Language', Value: 'English' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Number of Cards', Value: String(CARDS.length) },
        { Name: 'Finish', Value: 'Mixed' },
      ],
    },
    PictureDetails: { PictureURL: url },
  });
  const wrap = (call: string) => `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>${item}</Item></${call}Request>`;

  const tok = await userToken();
  const v = await trading(tok, 'VerifyAddFixedPriceItem', wrap('VerifyAddFixedPriceItem'));
  const ack = v.match(/<Ack>([^<]*)</)?.[1];
  console.log(`\nVerify: ${ack}`);
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`  ${m[1].slice(0, 200)}`);
  if (ack !== 'Success' && ack !== 'Warning') return;
  if (!PUBLISH) { console.log('\nVERIFIED but NOT listed. Rerun with --publish on the go-ahead.'); return; }

  const res = await trading(tok, 'AddFixedPriceItem', wrap('AddFixedPriceItem'));
  const id = res.match(/<ItemID>(\d+)</)?.[1];
  console.log(`AddFixedPriceItem ${res.match(/<Ack>([^<]*)</)?.[1]}  item ${id ?? '-'}`);
  if (id) console.log(`  https://www.ebay.com/itm/${id}`);

  // Only end the you-pick once the replacement is confirmed live, so the cards
  // are never unlisted in between.
  if (id) {
    const e = await trading(tok, 'EndFixedPriceItem',
      `<?xml version="1.0" encoding="utf-8"?><EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><ItemID>${YOUPICK}</ItemID><EndingReason>NotAvailable</EndingReason></EndFixedPriceItemRequest>`);
    console.log(`ended you-pick ${YOUPICK}: ${e.match(/<Ack>([^<]*)</)?.[1]}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
