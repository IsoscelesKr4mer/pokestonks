/**
 * Live-ask comps for the 2026 Bowman Chrome Hobby Box, 2026-09-09 (release day).
 *
 *   npx tsx scripts/comps-bowman-chrome-hobby-0909.ts
 *
 * TCGCSV has no sports category, so there is no market snapshot for this the way
 * there is for Pokemon. eBay live asks are the only price signal available, and
 * per [[feedback_dont_price_to_active_median]] the number that matters is RANK,
 * not percentile: how many sellers a buyer sees before they reach his listing.
 *
 * The exclusion list is doing the real work. A wide "bowman chrome hobby" search
 * pulls in cases, breaks, team spots, blasters, Sapphire and Mini, all of which
 * price nothing like a hobby box.
 */
import { browseToken } from './lib/card-comps';

const MINE = 499.99;
const Q = '2026 Bowman Chrome Baseball Hobby Box';
const CATEGORY = '261332'; // Sealed Trading Card Boxes

// "bowman" + "chrome" as separate tokens matches 2026 BOWMAN HOBBY BOX (1 AUTO)
// w/Chrome, which is the flagship paper product with Chrome inserts, a different
// and cheaper box. The phrase has to be adjacent, and the 1-auto tell excluded.
const REQUIRE = ['bowman chrome', 'hobby'];
const EXCLUDE = [
  'case', 'lot of', ' lot ', 'break', 'random', 'spot', 'pyt', 'pick your',
  'blaster', 'mega', 'jumbo', 'hta', 'value box', 'hanger', 'cello',
  'sapphire', 'mini ', 'draft', 'sterling', 'university', 'platinum',
  '(1 auto)', '1 auto)', 'w/chrome', 'w/ chrome', 'with chrome',
  '2024', '2023', '2022', '2021', '2020', '2019',
];

const ok = (t: string) => {
  const s = t.toLowerCase();
  if (!REQUIRE.every((k) => s.includes(k))) return false;
  if (EXCLUDE.some((k) => s.includes(k))) return false;
  return s.includes('2026');
};

async function main() {
  const tok = await browseToken();
  const seen = new Map<string, { price: number; title: string; ship: number | null; loc: string }>();
  for (let off = 0; off < 200; off += 50) {
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search'
      + `?q=${encodeURIComponent(Q)}&category_ids=${CATEGORY}&limit=50&offset=${off}`
      + `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE},itemLocationCountry:US')}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
    });
    const j: any = await r.json();
    if (j.errors) { console.error(JSON.stringify(j.errors).slice(0, 300)); break; }
    for (const it of j.itemSummaries ?? []) {
      const title = it.title as string;
      if (!ok(title)) continue;
      const price = Number(it.price?.value ?? 0);
      if (!price) continue;
      const ship = it.shippingOptions?.[0]?.shippingCost?.value;
      seen.set(it.itemId, {
        price, title,
        ship: ship == null ? null : Number(ship),
        loc: it.itemLocation?.postalCode ?? '',
      });
    }
    if ((j.itemSummaries ?? []).length < 50) break;
  }

  const rows = [...seen.values()].sort((a, b) => a.price - b.price);
  console.log(`${rows.length} live single-box asks after filtering\n`);
  const cheaper = rows.filter((r) => r.price < MINE).length;
  rows.slice(0, 22).forEach((r, i) => {
    const total = r.ship == null ? r.price : r.price + r.ship;
    console.log(`${String(i + 1).padStart(3)}. $${r.price.toFixed(2).padStart(8)}` +
      `${r.ship != null ? ` +$${r.ship.toFixed(2)} ship = $${total.toFixed(2)}` : '  (calc ship)'}   ${r.title.slice(0, 62)}`);
  });

  // The decisive split now that his box is physically here: most of the cheaper
  // asks are still presale/preorder, which is not the same product to a buyer
  // who wants it today.
  const PRE = /pre-?\s?(sale|order)|preorder|pre order|ships? (on|after|9\/)|confirmed/i;
  const cheaperRows = rows.filter((r) => r.price < MINE);
  const cheaperPresale = cheaperRows.filter((r) => PRE.test(r.title));
  const inHandCheaper = cheaperRows.length - cheaperPresale.length;
  console.log(`
of the ${cheaperRows.length} cheaper asks: ${cheaperPresale.length} are presale/preorder, ${inHandCheaper} read as in hand`);
  const inHandTitled = rows.filter((r) => /in.?hand|ships today/i.test(r.title));
  console.log(`${inHandTitled.length} of ${rows.length} listings advertise IN HAND:`);
  inHandTitled.slice(0, 8).forEach((r) => console.log(`   $${r.price.toFixed(2).padStart(8)}  ${r.title.slice(0, 60)}`));

  const p = (q: number) => rows[Math.min(rows.length - 1, Math.floor(rows.length * q))]?.price ?? 0;
  console.log(`\nlow  $${rows[0]?.price.toFixed(2)}`);
  console.log(`25th $${p(0.25).toFixed(2)}`);
  console.log(`med  $${p(0.5).toFixed(2)}`);
  console.log(`75th $${p(0.75).toFixed(2)}`);
  console.log(`high $${rows[rows.length - 1]?.price.toFixed(2)}`);
  console.log(`\nHIS ASK $${MINE.toFixed(2)}  ->  ${cheaper} of ${rows.length} sellers are cheaper (rank ${cheaper + 1})`);

  const net = (ask: number) => 0.85352 * ask - 0.40; // buyer pays calculated shipping
  for (const ask of [499.99, 429.99, 399.99, 379.99, 359.99, 349.99, 329.99]) {
    const rank = rows.filter((r) => r.price < ask).length + 1;
    console.log(`  ask $${ask.toFixed(2)}  net $${net(ask).toFixed(2)}  vs $299.99 cost = $${(net(ask) - 299.99).toFixed(2)}  rank ${rank}/${rows.length + 1}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
