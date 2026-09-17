/**
 * Comp the 2026 Bowman Chrome mega-box rip, box by box.
 *
 *   npx tsx scripts/comp-bow3box-0917.ts [1|2|3]
 *
 * Read only. Reads scripts/_bow3box_cards.json, which is built by reading every
 * front and resolving numbers against the Topps checklists.
 *
 * Michael confirmed the parallel calls off the photos: "those are obviously
 * mojo refractors. the first one is just base." Worth recording that I had them
 * right off the cards, then talked myself out of it by misreading the odds
 * sheet, where `MEGA Base Chrome Cards + Chrome Prospects 1:1` looked like the
 * mosaic foil was the standard mega finish. It is not. The 1:1 line is just
 * saying every mega card is a base card or a prospect.
 *
 * Per the card-intake skill, section 7:
 *   - never put the card number in the query, it throttles results to zero
 *   - query wide on year + set + player, filter on the number afterwards
 *   - a plain card needs a NOT-list or the median lands on an auto or a serial
 *   - a numbered/coloured parallel inverts it: REQUIRE the colour
 *   - report the ask count and flag anything under 4 live asks
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const BOX = Number(process.argv[2] ?? 1);

const AUTO = /\bautos?\b|autograph|signed|on.?card|\bCPA-|\bCRA-|\bBMA-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const GRADED = /\b(psa|bgs|sgc|cgc|cgs|csg|scg|pta|gma|hga)\s?\d|gem\s*(mt|mint)|\bgem\b|graded|slab/i;
const LOT = /lot of|\blot\b|bundle|you pick|choose|complete set|team set|break|random|repack|reprint|custom|proxy|digital|\bx\d+\b/i;
const OTHER_YEAR = /20(1\d|2[0-5])\b/;
const COLOURS = /(fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|rose gold|steel|sapphire|lazer|speckle|reptilian|geometric|pulsar|shimmer|wave)/i;

type Card = {
  i: number; box: number; player: string; card_number: string | null;
  kind: string; parallel: string; first_bowman?: boolean;
};

function spec(c: Card) {
  // chrome is required: without it the 2026 Bowman PAPER prospects and other
  // products flood in and the median collapses. Trout's Mojo first came back at
  // $1.50 off 161 "asks" for exactly that reason.
  const must: RegExp[] = [/2026/, /bowman/i, /chrome/i];
  const not: RegExp[] = [AUTO, GRADED, LOT, OTHER_YEAR];
  let q = '2026 Bowman Chrome ' + c.player;

  if (/Pink Mojo/i.test(c.parallel)) {
    must.push(/mojo/i, /pink/i);
    q += ' pink mojo refractor';
  } else if (/Mojo/i.test(c.parallel)) {
    must.push(/mojo/i);
    // a plain Mojo must not be a COLOURED Mojo
    not.push(/(fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|rose gold|steel)\s+mojo/i);
    not.push(SERIAL);
    q += ' mojo refractor';
  } else if (/Lazer/i.test(c.parallel)) {
    must.push(/lazer|laser/i);
    not.push(SERIAL);
    q += ' lazer refractor';
  } else if (c.kind.startsWith('insert')) {
    must.push(/2026/);
    not.push(SERIAL, COLOURS);
    q += (c.kind.includes('spring') ? ' spring breakout' : ' it came to the league');
  } else {
    // plain base chrome, prospect or base set
    not.push(SERIAL, COLOURS, /mojo|refractor|x-?fractor|prism|sapphire/i);
  }
  // The card number is REQUIRED on everything, base set and prospects alike.
  //
  // Base-set veterans need it because Trout, Tatis and Guerrero appear in every
  // product Topps makes.
  //
  // Prospects need it for a subtler reason Michael flagged: mega boxes have no
  // street date until 2026-09-23, so genuine mega-exclusive comps are almost
  // nonexistent right now. Any query that returns a healthy ask count for a
  // mega parallel is therefore comping the WRONG CARD. Ethan Holliday came back
  // at $8.40 off 95 asks, which is his MAY Bowman BCP-1 Lazer, a released card,
  // not the September BCP-209 in hand. The skill warns about exactly this: a
  // player can hold two prospect cards in one year across the two products.
  //
  // Escaping note: from a Python patch script this line once became '(#\s?|\b)'
  // inside a JS single-quoted string, where \b is a BACKSPACE rather than a
  // word boundary, and every base-set card returned 0 asks.
  let numRe: RegExp | null = null;
  if (c.card_number) {
    numRe = c.card_number.startsWith('BCP-')
      ? new RegExp('\\bBCP[- ]?' + c.card_number.slice(4) + '\\b', 'i')
      : c.card_number.startsWith('SB-') || c.card_number.startsWith('IT-')
        ? new RegExp('\\b' + c.card_number.replace('-', '[- ]?') + '\\b', 'i')
        : new RegExp('(#\\s?)?\\b' + c.card_number + '\\b');
  }
  return { q, must, not, numRe };
}

const pct = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const all: Card[] = JSON.parse(readFileSync('scripts/_bow3box_cards.json', 'utf8'));
  const cards = all.filter((c) => c.box === BOX);
  if (!cards.length) { console.log('no cards catalogued for box ' + BOX); return; }
  const tok = await browseToken();
  const out: any[] = [];

  for (const c of cards) {
    const s = spec(c);
    const r = await fetch('https://api.ebay.com/buy/browse/v1/item_summary/search?limit=200&q=' +
      encodeURIComponent(s.q) + '&filter=' + encodeURIComponent('buyingOptions:{FIXED_PRICE}'),
      { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j: any = await r.json();
    const surname = c.player.split(' ').slice(-1)[0].replace(/[^A-Za-z]/g, '');
    const kept = (j.itemSummaries ?? []).filter((it: any) => {
      const t = it.title ?? '';
      if (!new RegExp(surname, 'i').test(t)) return false;
      if (!s.must.every((m) => m.test(t))) return false;
      if (s.not.some((n) => n.test(t))) return false;
      if (s.numRe && !s.numRe.test(t)) return false;
      const p = Number(it.price?.value ?? 0);
      return p > 0.5 && p < 600;
    });
    const v = kept.map((it: any) => Number(it.price?.value ?? 0)).sort((a: number, b: number) => a - b);
    const med = v.length ? pct(v, 0.5) : null;
    out.push({ ...c, asks: v.length, low: v[0] ?? null, median: med, p75: v.length ? pct(v, 0.75) : null, query: s.q });
    const flag = v.length === 0 ? 'NO COMPS' : v.length < 4 ? 'THIN(' + v.length + ')' : '';
    console.log(
      String(c.i).padStart(3) + '  ' + String(c.card_number ?? '?').padEnd(9) +
      c.player.slice(0, 22).padEnd(23) + c.parallel.slice(0, 22).padEnd(23) +
      (med === null ? '     -  ' : ('$' + med.toFixed(2)).padStart(8)) +
      '  (' + String(v.length).padStart(3) + ' asks) ' + flag);
    await sleep(120);
  }

  writeFileSync('scripts/_bow3box_comps_' + BOX + '.json', JSON.stringify(out, null, 1));
  const priced = out.filter((o) => o.median !== null);
  const total = priced.reduce((a, o) => a + o.median, 0);
  console.log('\nbox ' + BOX + ': ' + priced.length + '/' + out.length + ' priced');
  console.log('sum of medians: $' + total.toFixed(2));
  console.log('thin (<4 asks): ' + out.filter((o) => o.asks > 0 && o.asks < 4).length +
    ',  no comps: ' + out.filter((o) => o.asks === 0).length);
  const top = [...priced].sort((a, b) => b.median - a.median).slice(0, 8);
  console.log('\ntop by median:');
  top.forEach((o) => console.log('   $' + o.median.toFixed(2).padStart(7) + '  ' + o.player + '  ' + o.parallel + '  (' + o.asks + ' asks)'));
})();
