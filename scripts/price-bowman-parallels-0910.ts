/**
 * Comps for the 10 non-base cards out of the 2026 Bowman Chrome hobby box.
 *
 * The shared card-comps path cannot price these and returned 0 asks for six of
 * them. Three reasons, all specific to this product:
 *
 *   1. It requires the card number in the title. Sellers almost never put
 *      BCP-174 on a /25, they put "Aiva Arquette True Orange /25". Requiring
 *      the number threw away every real comp.
 *   2. 2026 Bowman brands the plain colour parallels "True <Colour>", and it
 *      also prints Wave / Reptilian / Geometric / Shimmer / Pulsar versions of
 *      the SAME colour at the SAME serial. "Orange /25" alone matches four
 *      different cards at very different prices, so the pattern words have to
 *      be excluded explicitly.
 *   3. A plain "Refractor" search on a base card is swamped by the INSERT
 *      refractors, which are different, cheaper cards. Stars of the Future,
 *      Travel Tags and It Came to the League all carry the word Refractor and
 *      all three outnumbered the real base Refractor for Murakami.
 *
 * Colour words are only excluded after team names are stripped, because
 * "White Sox", "Red Sox", "Blue Jays" and "Reds" are teams, not parallels.
 * Autograph cards are matched on the CPA-/RA- code as well as the word "auto",
 * because a /499 auto listed as "#CPA-AS REFRACTOR /499" says neither.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { browseToken, GRADED, pct } from './lib/card-comps';
config({ path: '.env.local' });

type Spec = { i: number; colour: string | null; run: string | null; auto: boolean; pattern: string | null; qs: string[] };
const P = '2026 Bowman Chrome Prospects';
const B = '2026 Bowman Chrome';
const SPECS: Spec[] = [
  { i: 1, colour: null, run: null, auto: false, pattern: null,
    qs: [B + ' Munetaka Murakami refractor #76', B + ' Murakami refractor rookie white sox'] },
  { i: 2, colour: null, run: null, auto: false, pattern: null,
    qs: [B + ' Parker Messick refractor #3', B + ' Parker Messick refractor rookie guardians'] },
  { i: 3, colour: 'orange', run: '/25', auto: false, pattern: null,
    qs: [P + ' Aiva Arquette true orange', '2026 Bowman Aiva Arquette orange refractor'] },
  { i: 4, colour: 'orange', run: '/25', auto: false, pattern: null,
    qs: [B + ' Josh Naylor WBC orange', '2026 Bowman Chrome Josh Naylor orange refractor'] },
  { i: 5, colour: null, run: '/499', auto: false, pattern: null,
    qs: [P + ' Angel Salio refractor', '2026 Bowman Angel Salio 1st refractor'] },
  { i: 6, colour: 'blue', run: '/150', auto: false, pattern: null,
    qs: [B + ' Bryan Woo true blue', '2026 Bowman Chrome Bryan Woo blue refractor'] },
  { i: 7, colour: 'purple', run: '/250', auto: false, pattern: null,
    qs: [P + ' Caleb Bonemer purple refractor', '2026 Bowman Caleb Bonemer purple'] },
  { i: 9, colour: 'purple', run: '/250', auto: true, pattern: null,
    qs: [P + ' Wilder Dalis auto purple', '2026 Bowman Wilder Dalis autograph refractor'] },
  { i: 10, colour: null, run: null, auto: true, pattern: null,
    qs: [P + ' Ricky Moneys auto', '2026 Bowman Ricky Moneys 1st autograph'] },
  { i: 27, colour: null, run: null, auto: false, pattern: 'x-fractor',
    qs: [P + ' Johenssy Colome x-fractor', '2026 Bowman Johenssy Colome xfractor'] },
];

const COLOURS = ['orange', 'purple', 'blue', 'green', 'yellow', 'gold', 'aqua', 'fuchsia', 'magenta', 'pink', 'black', 'red', 'teal', 'sepia'];
const PATTERNS = ['wave', 'reptilian', 'geometric', 'shimmer', 'pulsar', 'speckle', 'mojo', 'popcorn', 'crystal', 'lazer', 'laser', 'atomic', 'superfractor', 'super fractor', 'sapphire', 'prism', 'raywave', 'ray wave', 'retrofractor', 'packfractor', 'logofractor', 'x-fractor', 'xfractor', 'mini diamond', 'printing plate', 'negative'];
const TEAMS = ['white sox', 'red sox', 'blue jays', 'reds', 'redbirds', 'big red', 'red wings'];
/** Insert sets that carry their own Refractors and are NOT the base card. */
const INSERTS = ['stars of the future', 'travel tags', 'it came to the league', 'big break', 'spring breakout', 'top 100', 'sf-', 'tt-', 'it-', 'bb-', 'sb-', 'btp-', 'bowman spotlights', 'final draft', 'crystalized', 'across the seams', 'gpk'];
const AUTOCODES = ['cpa-', 'ra-', 'is-', 'bcpa-'];

const deteam = (t: string) => TEAMS.reduce((s, x) => s.split(x).join(' '), t);

function accept(title: string, s: Spec, surname: string) {
  const raw = title.toLowerCase();
  if (GRADED.test(title)) return false;
  if (!raw.includes(surname)) return false;
  if (!raw.includes('bowman') || !raw.includes('2026')) return false;
  if (/you pick|choose|lot of|break/.test(raw)) return false;
  if (INSERTS.some(x => raw.includes(x))) return false;

  const t = deteam(raw);
  const hasAuto = /\bauto|autograph|signed/.test(t) || AUTOCODES.some(c => t.includes(c));
  if (s.auto !== hasAuto) return false;

  const anySerial = /\d{1,4}\s?\/\s?\d{1,4}|\/\s?\d{1,4}\b/.test(t);
  if (s.run) {
    if (!t.replace(/\s/g, '').includes(s.run)) return false;
  } else if (anySerial) return false;

  for (const p of PATTERNS) if (t.includes(p) !== (s.pattern === p)) return false;
  for (const c of COLOURS) if (t.includes(c) !== (s.colour === c)) return false;
  if (!s.colour && !s.pattern && !s.auto && !t.includes('refractor')) return false;
  return true;
}

(async () => {
  const cards = JSON.parse(readFileSync('scripts/_bow_cards.json', 'utf8'));
  const tok = await browseToken();
  const out: any[] = [];
  for (const s of SPECS) {
    const c = cards.find((x: any) => x.i === s.i);
    const surname = c.player.split(' ').pop().toLowerCase();
    const seen = new Map<string, number>();
    for (const q of s.qs) {
      const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' +
        encodeURIComponent(q) + '&category_ids=261328&limit=100';
      const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
      const j: any = await r.json();
      for (const it of j.itemSummaries || []) {
        if (!accept(it.title || '', s, surname)) continue;
        const v = Number(it.price?.value);
        if (v > 0 && v < 100000) seen.set(it.title, v);
      }
      await new Promise(res => setTimeout(res, 150));
    }
    const prices = [...seen.values()];
    const med = prices.length ? pct(prices, 0.5) : null;
    out.push({ i: c.i, player: c.player, card_number: c.card_number, parallel: c.parallel, asks: prices.length, median: med, low: prices.length ? Math.min(...prices) : null });
    console.log('\n#' + c.i + ' ' + c.player + ' ' + c.card_number + ' [' + c.parallel + ']');
    console.log('   ' + prices.length + ' asks  median ' + (med === null ? '-' : '$' + med.toFixed(2)) + '  low ' + (prices.length ? '$' + Math.min(...prices).toFixed(2) : '-'));
    [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10)
      .forEach(([t, v]) => console.log('      $' + String(v).padStart(8) + '  ' + t.slice(0, 90)));
  }
  writeFileSync('scripts/_bow_parallel_prices.json', JSON.stringify(out, null, 1));
})();
