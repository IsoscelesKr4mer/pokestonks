/**
 * Comp the second batch of four Pete Crow-Armstrong cards.
 *
 *   npx tsx scripts/comp-pca-batch2-0917.ts
 *
 * Read only. IMG_3374 to 3381, four cards front and back.
 *
 *   5  2020 Bowman Draft Chrome BD-72  Mets 1st Bowman, REFRACTOR
 *   6  2024 Bowman Chrome #45          Cubs RC, base chrome
 *   7  2024 Bowman #85 Mojo Refractor  Cubs RC, chrome stock
 *   8  2024 Topps Chrome 89CB-19       1989 35th Anniversary insert, Refractor
 *
 * Two calls worth recording, both made off the card rather than guessed.
 *
 * Card 5 gave us the control pair section 0 of the skill asks for. Its back
 * prints REFRACTOR directly under BD-72, and the paper BD-72 from the first
 * batch does not, same number, same player, same year. So the back marker does
 * exist on 2020 Bowman Draft Chrome. I had nearly called this a Mojo off the
 * front, because the repeating "Bowman Chrome 20" wordmark in the foil looks
 * like a pattern parallel; it is part of the base design and the back settled
 * it.
 *
 * Card 6 is base chrome, not a Refractor. No REFRACTOR on the back, and a
 * border crop upscaled with NEAREST shows flat halftone dots with no spectral
 * sweep, against card 5's obvious orange-green-blue banding as the anchor.
 *
 * On the numbering: PCA is #85 in 2024 Bowman and #45 in 2024 Bowman Chrome.
 * Both were read at 4x on the card-number corner after the full-frame read
 * disagreed with itself. The Mojo carries #85 and a BOWMAN CHROME trademark
 * line, so it is the chrome-stock parallel of the Bowman base card, not a
 * Bowman Chrome product card.
 */
import { config } from 'dotenv';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const AUTO = /\bautos?\b|autograph|signed|on.?card|\bRA-|\bIS-|\bCPA-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const GRADED = /\b(psa|bgs|sgc|cgc|cgs|csg|pta|gma|hga|ace)\s?\d|gem\s*(mt|mint)|\bgem\b|graded|slab/i;
const LOT = /lot of|\blot\b|bundle|you pick|choose|complete set|team set|break|random|repack|reprint|custom|proxy|digital/i;
const NAMED_COLOUR = /(purple|blue|green|orange|gold|red|aqua|pink|yellow|black|sepia|atomic|shimmer|wave|x-?fractor|prism|raywave|lazer|speckle|reptilian|geometric|pulsar|sapphire|sky|lava|magenta)/i;

type Spec = { label: string; query: string; must: RegExp[]; not: RegExp[]; lo: number; hi: number };

const SPECS: Spec[] = [
  {
    label: '5. 2020 Bowman Draft CHROME BD-72 REFRACTOR, Mets 1st Bowman',
    query: '2020 Bowman Draft Chrome Pete Crow-Armstrong refractor',
    must: [/2020/, /chrome/i, /refractor/i, /BD-?72\b/i],
    not: [AUTO, SERIAL, GRADED, LOT, NAMED_COLOUR, /mojo/i],
    lo: 1, hi: 400,
  },
  {
    label: '6. 2024 Bowman Chrome #45, Cubs RC, BASE chrome',
    query: '2024 Bowman Chrome Pete Crow-Armstrong rookie',
    must: [/2024/, /chrome/i, /\b45\b/],
    not: [AUTO, SERIAL, GRADED, LOT, NAMED_COLOUR, /mojo|refractor|draft/i],
    lo: 0.5, hi: 200,
  },
  {
    label: '7. 2024 Bowman #85 MOJO REFRACTOR, Cubs RC',
    query: '2024 Bowman Pete Crow-Armstrong mojo refractor',
    must: [/2024/, /mojo/i],
    not: [AUTO, SERIAL, GRADED, LOT, NAMED_COLOUR, /draft/i],
    lo: 1, hi: 400,
  },
  {
    label: '8. 2024 Topps Chrome 89CB-19, 1989 35th Anniversary, Refractor',
    query: '2024 Topps Chrome 1989 Pete Crow-Armstrong refractor',
    must: [/2024/, /(1989|89CB)/i],
    not: [AUTO, SERIAL, GRADED, LOT, NAMED_COLOUR, /mojo|bowman/i],
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
    const kept = (j.itemSummaries ?? []).filter((i: any) => {
      const t = i.title ?? '';
      if (!/crow.?armstrong/i.test(t)) return false;
      if (!s.must.every((m) => m.test(t))) return false;
      if (s.not.some((n) => n.test(t))) return false;
      const p = Number(i.price?.value ?? 0);
      return p > s.lo && p < s.hi;
    });
    const v = kept.map((i: any) => Number(i.price?.value ?? 0)).sort((a: number, b: number) => a - b);
    console.log('\n===== ' + s.label);
    console.log('raw ' + (j.total ?? 0) + ' -> kept ' + v.length);
    if (!v.length) { console.log('NO COMPS after filtering'); continue; }
    console.log('low $' + v[0].toFixed(2) + '  25th $' + pct(v, 0.25).toFixed(2) +
      '  MEDIAN $' + pct(v, 0.5).toFixed(2) + '  75th $' + pct(v, 0.75).toFixed(2) +
      '  high $' + v[v.length - 1].toFixed(2));
    if (v.length < 4) console.log('*** THIN: only ' + v.length + ' asks, indicative only');
    kept.slice(0, 10).forEach((i: any) =>
      console.log('   $' + Number(i.price?.value ?? 0).toFixed(2).padStart(7) + '  ' + (i.title ?? '').slice(0, 74)));
  }
})();
