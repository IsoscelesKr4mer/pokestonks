/**
 * Build the MTG The Hobbit "you pick" listing from the 2026-08-24 rip.
 *
 *   npx tsx scripts/build-hob-pyp.ts            # dry run + VerifyAddFixedPriceItem
 *   npx tsx scripts/build-hob-pyp.ts --apply    # upload photos, create the listing
 *
 * WHY TRADING API. Same reason as build-pyp-group.ts: the Inventory API has no
 * per-variation picture field, and on a you-pick the changing photo IS the
 * product. AddFixedPriceItem + VariationSpecificPictureSet.
 *
 * ADDING LATER. Michael wants to grow this. New variations CAN be appended to a
 * live multi-variation listing with ReviseFixedPriceItem. What cannot change is
 * the ORDER of the existing ones, so new cards land at the bottom rather than
 * slotting into collector-number order. Accepted deliberately.
 *
 * PRICING. Floor $1.49, matching his baseball you-picks. Scryfall comps for this
 * pile run $0.08-$4.11, so almost everything sits at the floor; only Belladonna
 * Took ($4.11 comp) prices above it. The floor is the point: a you-pick sells
 * convenience and selection, and below ~$1.49 the $0.40 fee floor eats the card.
 *
 * Category 183454 CCG Individual Cards, the singles sibling of the 183456 he
 * already uses for sealed packs.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = 'ebay-listings';
const CATEGORY = '183454';
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '272052757012' };
const TITLE = 'MTG The Hobbit You Pick Your Card Singles Magic the Gathering LOTR Foil Rare';
const FLOOR = 149;

/** photo index (1-based, in the order Michael sent them) -> card */
type Card = { i: number; n: number; name: string; rar: 'R' | 'U' | 'C' | 'T'; foil?: boolean; comp: number; price?: number };
const CARDS: Card[] = [
  { i: 1,  n: 182, name: "Elvenking's Halls",           rar: 'C', comp: 15 },
  { i: 2,  n: 10,  name: 'Dwarven Shortsword',          rar: 'C', comp: 30, foil: true },
  { i: 3,  n: 92,  name: 'Desert Were-Worm',            rar: 'R', comp: 37 },
  { i: 4,  n: 125, name: "Galion, Elvenking's Butler",  rar: 'U', comp: 12 },
  { i: 5,  n: 22,  name: "The Mountain-king's Return",  rar: 'U', comp: 17 },
  { i: 6,  n: 52,  name: 'Ravenhill Flock',             rar: 'U', comp: 22 },
  { i: 7,  n: 38,  name: "Elvenking's Harper",          rar: 'C', comp: 11 },
  { i: 8,  n: 10,  name: 'Dwarven Shortsword',          rar: 'C', comp: 13 },
  { i: 9,  n: 116, name: 'Attercop',                    rar: 'C', comp: 22 },
  { i: 10, n: 157, name: 'Goblin Plate Mail',           rar: 'C', comp: 18 },
  { i: 11, n: 21,  name: 'Moment of Glory',             rar: 'C', comp: 8 },
  { i: 12, n: 43,  name: 'Lakeshore Apothecary',        rar: 'C', comp: 8 },
  { i: 13, n: 85,  name: 'Stony-Voiced Goblins',        rar: 'C', comp: 15 },
  { i: 14, n: 108, name: 'Ragged Short Spear',          rar: 'C', comp: 10 },
  { i: 15, n: 2,   name: 'Human Soldier Token',         rar: 'T', comp: 0 },
  { i: 16, n: 163, name: 'Silvan Reveler',              rar: 'U', comp: 22 },
  { i: 17, n: 50,  name: "Old Fat Spider Can't See Me", rar: 'U', comp: 19 },
  { i: 18, n: 175, name: 'Key to the Side-Door',        rar: 'U', comp: 20 },
  { i: 19, n: 162, name: 'Patient Instructor',          rar: 'C', comp: 9 },
  { i: 20, n: 101, name: 'Gundabad Opportunist',        rar: 'C', comp: 13 },
  { i: 21, n: 100, name: 'Goblin-town Flunkies',        rar: 'C', comp: 20 },
  { i: 22, n: 133, name: 'Ordinary Bear',               rar: 'C', comp: 18 },
  { i: 23, n: 18,  name: 'Lake-town Lookout',           rar: 'C', comp: 14 },
  { i: 24, n: 35,  name: 'Confusticate and Bebother',   rar: 'C', comp: 25 },
  { i: 25, n: 81,  name: 'Reverent Howl',               rar: 'C', comp: 10 },
  { i: 26, n: 7,   name: 'Bear Token',                  rar: 'T', comp: 0 },
  { i: 27, n: 189, name: 'Plains',                      rar: 'C', comp: 26, foil: true },
  { i: 28, n: 63,  name: 'Crude Bent Blade',            rar: 'C', comp: 27, foil: true },
  { i: 29, n: 4,   name: 'Belladonna Took',             rar: 'R', comp: 411 },
  { i: 30, n: 187, name: 'The Lonely Mountain',         rar: 'R', comp: 68 },
];

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const pad = (n: number) => String(n).padStart(4, '0');

function label(c: Card): string {
  const rar = c.rar === 'T' ? 'Token' : c.rar;
  let l = `${pad(c.n)} - ${c.name} - ${rar}${c.foil ? ' Foil' : ''}`;
  if (l.length > 50) l = l.slice(0, 50).trim();
  return l;
}
function price(c: Card): number {
  // Comp when it clears the floor, else the floor. Round up to a .49/.99 point.
  if (c.comp <= FLOOR) return FLOOR;
  const dollars = Math.ceil(c.comp / 100);
  return dollars * 100 - 51; // 4.11 -> 449
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function toXml(node: any, name?: string): string {
  if (Array.isArray(node)) return node.map((n) => toXml(n, name)).join('');
  if (node !== null && typeof node === 'object') {
    const inner = Object.entries(node).map(([k, v]) => toXml(v, k)).join('');
    return name ? `<${name}>${inner}</${name}>` : inner;
  }
  const text = typeof node === 'string' ? esc(node) : String(node);
  return name ? `<${name}>${text}</${name}>` : text;
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
  if (!j.access_token) throw new Error('token refresh failed');
  return j.access_token as string;
}
async function trading(tok: string, call: string, body: string) {
  const r = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': call, 'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193', 'X-EBAY-API-IAF-TOKEN': tok,
      'Content-Type': 'text/xml',
    },
    body,
  });
  return r.text();
}

async function main() {
  const files: string[] = JSON.parse(readFileSync(
    'C:/Users/Michael/AppData/Local/Temp/claude/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/8f5be84b-2585-4211-a731-c00cf48257a5/scratchpad/mtg_files.json', 'utf8'));
  if (files.length !== 30) throw new Error(`expected 30 photos, got ${files.length}`);

  const seen = new Set<string>();
  for (const c of CARDS) {
    c.price = price(c);
    const l = label(c);
    if (seen.has(l)) throw new Error(`duplicate variation label: ${l}`);
    seen.add(l);
  }
  const ask = CARDS.reduce((s, c) => s + c.price!, 0);
  const comp = CARDS.reduce((s, c) => s + c.comp, 0);
  console.log(`${TITLE}\n  ${TITLE.length} chars, category ${CATEGORY}`);
  console.log(`  ${CARDS.length} variations | ask $${(ask / 100).toFixed(2)} | comp $${(comp / 100).toFixed(2)}`);
  for (const c of CARDS) console.log(`   $${(c.price! / 100).toFixed(2).padStart(5)}  (comp $${(c.comp / 100).toFixed(2).padStart(5)})  ${label(c)}`);

  // Upload photos, one per variation.
  const urls: Record<number, string> = {};
  for (const c of CARDS) {
    const name = `HOB_${pad(c.n)}_${slug(c.name)}${c.foil ? '_foil' : ''}.jpg`;
    if (APPLY) {
      const { error } = await supa.storage.from(BUCKET).upload(name, readFileSync(files[c.i - 1]), { contentType: 'image/jpeg', upsert: true });
      if (error) throw new Error(`${name}: ${error.message}`);
    }
    urls[c.i] = supa.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
  }
  console.log(`\n${APPLY ? 'uploaded' : 'would upload'} ${CARDS.length} photos`);

  const gallery = [...CARDS].sort((a, b) => b.comp - a.comp).slice(0, 12).map((c) => urls[c.i]);
  const item = {
    Title: TITLE,
    Description: `<![CDATA[${[
      '<p>Magic: The Gathering <strong>The Hobbit</strong> singles. <strong>Pick your card from the dropdown above.</strong> The photo changes with your selection, so you see the exact card you are buying.</p>',
      '<p>All cards pulled from Play Boosters and sleeved straight away. Near Mint or better. Foils are marked "Foil" in the dropdown.</p>',
      '<p>Each card ships in a penny sleeve and toploader, with tracking. Ships within 1 business day.</p>',
      '<p>Buying several? Add them all to your cart and they ship together in one package.</p>',
      '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
    ].join('')}]]>`,
    PrimaryCategory: { CategoryID: CATEGORY },
    ConditionID: 4000,
    // 183454 requires Card Condition the same way 261328 does; VerifyAddFixedPriceItem
    // rejected the whole listing without it. 40001 = Card Condition,
    // 400010 = Near Mint or Better. An ItemSpecific of the same name is NOT enough.
    ConditionDescriptors: { ConditionDescriptor: { Name: '40001', Value: '400010' } },
    Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
    ListingDuration: 'GTC', ListingType: 'FixedPriceItem',
    DispatchTimeMax: 1,
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
        { Name: 'Finish', Value: 'Mixed' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Card Type', Value: 'Magic: The Gathering' },
      ],
    },
    PictureDetails: { PictureURL: gallery },
    Variations: {
      VariationSpecificsSet: { NameValueList: { Name: 'Card', Value: CARDS.map(label) } },
      Variation: CARDS.map((c) => ({
        SKU: `PYP-HOB-${pad(c.n)}${c.foil ? 'F' : ''}`,
        StartPrice: (c.price! / 100).toFixed(2),
        Quantity: 1,
        VariationSpecifics: { NameValueList: { Name: 'Card', Value: label(c) } },
      })),
      Pictures: {
        VariationSpecificName: 'Card',
        VariationSpecificPictureSet: CARDS.map((c) => ({ VariationSpecificValue: label(c), PictureURL: urls[c.i] })),
      },
    },
  };

  const tok = await userToken();
  const wrap = (call: string) => `<?xml version="1.0" encoding="utf-8"?>` +
    `<${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel>` +
    toXml(item, 'Item') + `</${call}Request>`;

  const vres = await trading(tok, 'VerifyAddFixedPriceItem', wrap('VerifyAddFixedPriceItem'));
  const vack = vres.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  console.log(`\nverify: ${vack}`);
  for (const m of vres.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log('  ', m[1] + ':', m[2].slice(0, 200));
  if (vack !== 'Success' && vack !== 'Warning') { console.error('VERIFY FAILED, nothing created'); process.exit(1); }
  if (!APPLY) { writeFileSync('scripts/_hob_pyp.json', JSON.stringify(item, null, 1)); console.log('\ndry run, payload written to scripts/_hob_pyp.json'); return; }

  const res = await trading(tok, 'AddFixedPriceItem', wrap('AddFixedPriceItem'));
  const ack = res.match(/<Ack>(\w+)<\/Ack>/)?.[1];
  const itemId = res.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  console.log(`\nack: ${ack} | itemId: ${itemId}`);
  for (const m of res.matchAll(/<(ShortMessage|LongMessage)>([^<]*)<\/\1>/g)) console.log('  ', m[1] + ':', m[2].slice(0, 200));
  if (itemId) console.log(`\nhttps://www.ebay.com/itm/${itemId}`);
  else console.log(res.slice(0, 1500));
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
