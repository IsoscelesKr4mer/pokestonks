/**
 * Naruto Kayou Earth Scroll 2 you-pick: every SSR-and-up card in one dropdown.
 *
 *   npx tsx scripts/build-naruto-pyp-0828.ts             # dry run + eBay verify
 *   npx tsx scripts/build-naruto-pyp-0828.ts --apply     # host photos, VERIFY only
 *   npx tsx scripts/build-naruto-pyp-0828.ts --publish   # only after Michael says so
 *
 * SSR and up only. The 61 SRs are a COMPLETE 20/20 set and sell as a set, not
 * as dropdown rows; the 76 Rs are $0.50 bulk that would each lose money to the
 * $0.40 fee floor. Both get their own listing.
 *
 * Card identity comes from data/naruto_cards_0828.tsv, every code of which was
 * verified against the narutodb NREA02 checklist. Character names come from
 * narutodb too rather than from reading the card art, so the dropdown labels
 * cannot drift from the actual card.
 *
 * Prices are narutodb SOLD comps (130point-sourced where available) marked up
 * 15% and rounded to a .49/.99, with a $2.99 floor. The floor is not greed: at
 * eBay's 13.25% + $0.40 a $1.99 card nets about $1.33, and below that the
 * listing costs more attention than it returns.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { listCardsInSet, listAllPrices } from './lib/narutodb';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const CATEGORY = '183454'; // Toys & Hobbies > Collectible Card Games > CCG Individual Cards
const POLICIES = { payment: '269110704012', ret: '269110705012', ship: '272052757012' };
const TITLE = 'Naruto Kayou Earth Scroll 2 You Pick Card SSR UR Diamond MR Holo English NREA02';
const SRC = `${homedir()}/../..${''}`; // unused, kept explicit below
const PHOTOS = 'eBay_assets/card drop';
const TIERS = ['MR', '◇UR', 'UR', 'SSR'];

/** narutodb sold comp -> ask. Floor at $2.99; below that eBay's cut eats it. */
function ask(cents: number): number {
  const up = Math.ceil((cents * 1.15) / 50) * 50 - 1;
  return Math.max(299, up);
}

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
  if (!j.access_token) throw new Error('token refresh failed');
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

/**
 * Slug for SKUs and photo filenames.
 *
 * The diamond glyph MUST become a letter, not be stripped. Stripping it makes
 * NREA02-(diamond)UR-002L3 and NREA02-UR-002L3 collapse to the same string --
 * eBay rejected the whole listing with "Duplicate custom variation label" on
 * SKU npy-nrea02ur002l3, and the photo upload would have silently overwritten
 * the plain UR's picture with the Diamond's. Two different cards, one filename.
 */
const slug = (code: string) => code.replace(/◇/g, 'D').replace(/[^A-Za-z0-9]/g, '');

type Row = { code: string; qty: number; photo: number; name: string; tier: string; slot: number; comp: number; ask: number; label: string };

async function build(): Promise<Row[]> {
  const lines = readFileSync('data/naruto_cards_0828.tsv', 'utf8').trim().split(/\r?\n/)
    .filter((l) => !l.startsWith('#')).slice(1);
  const seen = new Map<string, { qty: number; photo: number }>();
  for (const l of lines) {
    const [photo, raw] = l.split('\t');
    if (!raw || raw === '?') continue;
    const code = raw.replace('-DUR-', '-◇UR-').toUpperCase();
    const e = seen.get(code);
    if (e) e.qty++;
    else seen.set(code, { qty: 1, photo: Number(photo) });
  }
  const [cards, prices] = await Promise.all([listCardsInSet('NREA02'), listAllPrices()]);
  const byNum = new Map(cards.map((c) => [c.card_number.toUpperCase(), c]));
  const priceBy = new Map(prices.map((p) => [p.card_number.toUpperCase(), p]));

  const rows: Row[] = [];
  for (const [code, { qty, photo }] of seen) {
    const card = byNum.get(code);
    if (!card) throw new Error(`code not in checklist, refusing to list: ${code}`);
    if (!TIERS.includes(card.rarity_code)) continue;
    const comp = priceBy.get(code)?.price_last_cents ?? 0;
    const slot = Number(code.match(/-(\d+)L\d$/)?.[1] ?? 0);
    const tierLabel = card.rarity_code === '◇UR' ? 'Diamond UR' : card.rarity_code;
    rows.push({
      code, qty, photo, name: card.character_name ?? '?', tier: card.rarity_code, slot,
      comp, ask: ask(comp),
      label: `${card.character_name ?? '?'} - ${tierLabel} ${String(slot).padStart(3, '0')}`,
    });
  }
  const rank = (t: string) => TIERS.indexOf(t);
  return rows.sort((a, b) => rank(a.tier) - rank(b.tier) || a.slot - b.slot);
}

async function main() {
  const rows = await build();
  const copies = rows.reduce((n, r) => n + r.qty, 0);
  const askTotal = rows.reduce((n, r) => n + r.ask * r.qty, 0);
  const compTotal = rows.reduce((n, r) => n + r.comp * r.qty, 0);

  console.log(`${TITLE}\n  ${TITLE.length}/80 chars   category ${CATEGORY}`);
  console.log(`  ${rows.length} dropdown rows / ${copies} cards`);
  console.log(`  narutodb comps $${(compTotal / 100).toFixed(2)}  ->  ask $${(askTotal / 100).toFixed(2)}\n`);
  for (const r of rows)
    console.log(`  ${String(r.qty)}x $${(r.ask / 100).toFixed(2).padStart(6)} (comp $${(r.comp / 100).toFixed(2).padStart(5)})  ${r.code.padEnd(18)} ${r.label}`);

  if (!APPLY && !PUBLISH) { console.log('\ndry run, nothing hosted'); return; }

  // photos: one front per distinct card, named by code so a re-run is idempotent
  const urls = new Map<string, string>();
  for (const r of rows) {
    const name = `naruto_${slug(r.code)}.jpg`;
    const buf = await sharp(readFileSync(`${PHOTOS}/IMG_${r.photo}.JPEG`))
      .rotate().resize(1200, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const { error } = await supa.storage.from('ebay-listings').upload(name, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`${name}: ${error.message}`);
    urls.set(r.code, supa.storage.from('ebay-listings').getPublicUrl(name).data.publicUrl);
  }
  console.log(`\nhosted ${urls.size} photos`);

  const desc = [
    '<p><strong>Kayou Naruto, Earth Scroll Series 2 (NREA02). Pick your card from the dropdown above.</strong> The photo changes with your selection, so you see the exact card you are buying.</p>',
    '<p>All cards are English NA release, pulled from sealed Kayou collector boxes and straight into sleeves. Near mint or better.</p>',
    '<p>Rarity runs <strong>MR and Diamond UR over UR over SSR</strong> in this set. Note that UR outranks SSR in Kayou, which is the opposite of most anime TCGs.</p>',
    '<p>Each card ships in a penny sleeve and a toploader or Card Saver I, with tracking. Ships within 1 business day.</p>',
    '<p>Buying several? Add them all to your cart and they ship together in one package.</p>',
    '<p>Smoke-free home. Buy with confidence, check my feedback. Thanks for looking.</p>',
  ].join('');

  const item = toXml({
    Title: TITLE,
    Description: `<![CDATA[${desc}]]>`,
    PrimaryCategory: { CategoryID: CATEGORY },
    ConditionID: 4000,
    ConditionDescriptors: { ConditionDescriptor: { Name: '40001', Value: '400010' } },
    Country: 'US', Currency: 'USD', Location: 'Edmonds, Washington', PostalCode: '98026',
    ListingDuration: 'GTC', ListingType: 'FixedPriceItem', DispatchTimeMax: 1,
    SellerProfiles: {
      SellerPaymentProfile: { PaymentProfileID: POLICIES.payment },
      SellerReturnProfile: { ReturnProfileID: POLICIES.ret },
      SellerShippingProfile: { ShippingProfileID: POLICIES.ship },
    },
    ItemSpecifics: {
      NameValueList: [
        { Name: 'Game', Value: 'Naruto' },
        { Name: 'Manufacturer', Value: 'Kayou' },
        { Name: 'Set', Value: 'Earth Scroll Series 2' },
        { Name: 'Language', Value: 'English' },
        { Name: 'Card Type', Value: 'Character' },
        { Name: 'Features', Value: 'Holo' },
        { Name: 'Graded', Value: 'No' },
        { Name: 'Autographed', Value: 'No' },
      ],
    },
    PictureDetails: { PictureURL: rows.slice(0, 12).map((r) => urls.get(r.code)!) },
    Variations: {
      VariationSpecificsSet: { NameValueList: { Name: 'Card', Value: rows.map((r) => r.label) } },
      Variation: rows.map((r) => ({
        SKU: `NPY-${slug(r.code)}`,
        StartPrice: (r.ask / 100).toFixed(2),
        Quantity: r.qty,
        VariationSpecifics: { NameValueList: { Name: 'Card', Value: r.label } },
      })),
      Pictures: {
        VariationSpecificName: 'Card',
        VariationSpecificPictureSet: rows.map((r) => ({ VariationSpecificValue: r.label, PictureURL: urls.get(r.code)! })),
      },
    },
  });

  const tok = await userToken();
  const wrap = (call: string) => `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents"><ErrorLanguage>en_US</ErrorLanguage><WarningLevel>High</WarningLevel><Item>${item}</Item></${call}Request>`;

  // Verify first, always. A rejection after creating 32 variations is far more
  // expensive to unpick than one that costs nothing.
  const v = await trading(tok, 'VerifyAddFixedPriceItem', wrap('VerifyAddFixedPriceItem'));
  const ack = v.match(/<Ack>([^<]*)</)?.[1];
  console.log(`\nVerifyAddFixedPriceItem: ${ack}`);
  for (const m of v.matchAll(/<LongMessage>([^<]*)</g)) console.log(`   ${m[1].slice(0, 200)}`);
  if (process.env.DUMP) { writeFileSync('verify.xml', v); writeFileSync('item.xml', item); }
  if (ack !== 'Success' && ack !== 'Warning') { console.log('\nnot listable yet'); return; }
  const fees = v.match(/<Fee><Name>InsertionFee<\/Name><Fee currencyID="USD">([\d.]+)/)?.[1];
  if (fees) console.log(`   insertion fee $${fees}`);

  if (!PUBLISH) { console.log('\nVERIFIED but NOT listed. Rerun with --publish once Michael says go.'); return; }
  const r = await trading(tok, 'AddFixedPriceItem', wrap('AddFixedPriceItem'));
  const id = r.match(/<ItemID>(\d+)</)?.[1];
  console.log(`AddFixedPriceItem: ${r.match(/<Ack>([^<]*)</)?.[1]}  item ${id ?? '-'}`);
  if (id) console.log(`  https://www.ebay.com/itm/${id}`);
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
