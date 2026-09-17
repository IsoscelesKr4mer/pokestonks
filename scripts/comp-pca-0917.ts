/**
 * Comp Michael's four Pete Crow-Armstrong cards.
 *
 *   npx tsx scripts/comp-pca-0917.ts
 *
 * Read only. "Can you comp these PCAs for me?" plus 8 photos, which are four
 * cards front and back. PCA is the player, not a grading company.
 *
 * Read off the cards, both faces:
 *   1  2020 Bowman Draft BD-72          Mets, 1ST BOWMAN logo, paper
 *   2  2024 Bowman #85                  Cubs, RC, paper
 *   3  2024 Topps Series Two #407       Cubs, RC, paper base
 *   4  2024 Topps Series Two #371       "Cheerful in Chicago" GOLD, 0702/2024
 *
 * None are graded. #3 sits in a Beckett Shield, a semi-rigid holder, not a
 * grade, so all four comp as raw.
 *
 * Per the card-intake skill, the query stays wide on year + set + player and
 * the card number is applied as a FILTER, never in the query, where it
 * throttles results to near zero.
 *
 * THE FIRST PASS OF THIS SCRIPT WAS WRONG and is worth recording. It returned a
 * $10.00 median on the 2024 Bowman #85. The actual #85 asks were $1.69, $2.25
 * and $2.75; the median had been dragged up by Bowman's Best #17, Bowman
 * Sterling #BSR-27 and two graded copies, none of which are the card. Same
 * shape on the Topps base, where Stars of MLB, Summer Holiday, City to Rookie
 * and a Silver Crackle parallel were all inside the "base" set. The not-list
 * has to exclude sibling PRODUCTS and INSERT names, not just autos and
 * serials, and graded needs to catch "GEM 10", "CGS 10" and "PTA" as well as
 * PSA/BGS/SGC.
 */
import { config } from 'dotenv';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const AUTO = /\bautos?\b|autograph|signed|on.?card|\bRA-|\bIS-|\bCPA-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const COLOUR = /(purple|blue|green|orange|gold|red|aqua|pink|yellow|black|sepia|atomic|mojo|shimmer|wave|refractor|x-?fractor|prism|raywave|lazer|speckle|reptilian|geometric|pulsar|foilboard|vintage stock|sparkle|rainbow|crackle|holo|foil)/i;
const LOT = /lot of|\blot\b|\d+\s?card lot|bundle|you pick|choose|complete set|team set|break|random|repack|reprint|custom|proxy|digital|topps now/i;
// graded has to catch the vernacular, not just the TLAs
const GRADED = /\b(psa|bgs|sgc|cgc|cgs|pta|gma|hga|ace)\s?\d|gem\s*(mt|mint)|\bgem\s?10\b|graded|slab/i;
// sibling products that share the player and the year
const OTHER_PRODUCT = /bowman'?s best|sterling|chrome|sapphire|finest|stadium club|heritage|archives|allen|gypsy|update|big league|opening day|pro debut|inception|tribute|museum|definitive|dynasty|transcendent/i;
// named inserts that are not the base card
const INSERT = /stars of mlb|summer holiday|city to|20 in|home field|future stars|all.?star|rookie of|debut patch|silver pack|oversized|poster|sticker|relic|patch/i;

type Spec = {
  label: string;
  query: string;
  must: RegExp[];
  number: RegExp;
  not: RegExp[];
  lo: number; hi: number;
};

const SPECS: Spec[] = [
  {
    label: '1. 2020 Bowman Draft BD-72, Mets 1st Bowman, PAPER',
    query: '2020 Bowman Draft Pete Crow-Armstrong',
    must: [/2020/, /bowman/i],
    number: /BD-?72\b/i,
    not: [OTHER_PRODUCT, AUTO, SERIAL, COLOUR, LOT, GRADED, INSERT],
    lo: 0.5, hi: 200,
  },
  {
    label: '2. 2024 Bowman #85, Cubs RC, PAPER',
    query: '2024 Bowman Pete Crow-Armstrong rookie',
    must: [/2024/, /bowman/i],
    number: /#\s?85\b|\b85\b/,
    not: [OTHER_PRODUCT, /draft/i, AUTO, SERIAL, COLOUR, LOT, GRADED, INSERT],
    lo: 0.5, hi: 200,
  },
  {
    label: '3. 2024 Topps Series Two #407, Cubs RC, BASE',
    query: '2024 Topps Pete Crow-Armstrong rookie',
    must: [/2024/, /topps/i],
    number: /#\s?407\b|\b407\b/,
    not: [OTHER_PRODUCT, AUTO, SERIAL, COLOUR, LOT, GRADED, INSERT, /cheerful/i],
    lo: 0.5, hi: 200,
  },
  {
    label: '4. 2024 Topps S2 #371 Cheerful in Chicago GOLD /2024 (his is 0702/2024)',
    query: '2024 Topps Cheerful in Chicago Gold Crow-Armstrong',
    must: [/2024/, /cheerful/i, /gold/i],
    number: /./,
    not: [AUTO, LOT, GRADED, /chrome|bowman/i],
    lo: 0.5, hi: 300,
  },
];

const pct = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(v.length * p))];

(async () => {
  const tok = await browseToken();
  for (const s of SPECS) {
    const r = await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q=' +
      encodeURIComponent(s.query) + '&filter=' + encodeURIComponent('buyingOptions:{FIXED_PRICE}'),
      { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j: any = await r.json();
    const all = j.itemSummaries ?? [];
    const kept = all.filter((i: any) => {
      const t = i.title ?? '';
      if (!/crow.?armstrong/i.test(t)) return false;
      if (!s.must.every((m) => m.test(t))) return false;
      if (!s.number.test(t)) return false;
      if (s.not.some((n) => n.test(t))) return false;
      const p = Number(i.price?.value ?? 0);
      return p > s.lo && p < s.hi;
    });
    const v = kept.map((i: any) => Number(i.price?.value ?? 0)).sort((a: number, b: number) => a - b);
    console.log('\n===== ' + s.label);
    console.log('raw ' + (j.total ?? 0) + ' -> kept ' + v.length + ' after player, number and exclusions');
    if (!v.length) { console.log('NO COMPS'); continue; }
    console.log('low $' + v[0].toFixed(2) + '  25th $' + pct(v, 0.25).toFixed(2) +
      '  MEDIAN $' + pct(v, 0.5).toFixed(2) + '  75th $' + pct(v, 0.75).toFixed(2) +
      '  high $' + v[v.length - 1].toFixed(2));
    if (v.length < 4) console.log('*** THIN: only ' + v.length + ' asks, treat as indicative');
    kept.forEach((i: any) =>
      console.log('   $' + Number(i.price?.value ?? 0).toFixed(2).padStart(7) + '  ' + (i.title ?? '').slice(0, 74)));
  }
})();
