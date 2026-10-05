/**
 * Comp the 2026 Bowman Chrome mega-box rip, box by box.
 *
 *   npx tsx scripts/comp-bow3box-0917.ts [1|2|3]
 *   npx tsx scripts/comp-bow3box-0917.ts --box 1 --file <cards.json> --tag <out>
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

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : null;
};
const BOX = Number(arg('--box') ?? (process.argv[2]?.startsWith('--') ? 1 : process.argv[2]) ?? 1);
/** --file lets a later rip reuse this filter logic without forking it */
const FILE = arg('--file') ?? 'scripts/_bow3box_cards.json';
const TAG = arg('--tag') ?? '_bow3box_comps_' + BOX;

const AUTO = /\bautos?\b|autograph|signed|on.?card|\bCPA-|\bCRA-|\bBMA-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const GRADED = /\b(psa|bgs|sgc|cgc|cgs|csg|scg|pta|gma|hga)\s?\d|gem\s*(mt|mint)|\bgem\b|graded|slab/i;
// `break` must be \b-bounded on BOTH sides or it matches "Spring BREAKout" and
// silently deletes every Spring Breakout insert from its own comps. James Tibbs
// III had 200 live listings and returned zero asks; SB cards in the earlier
// boxes all came back "thin" for the same reason.
const LOT = /lot of|\blot\b|bundle|you pick|choose|complete set|team set|\bbreaks?\b|random|repack|reprint|custom|proxy|digital|\bx\d+\b/i;
const OTHER_YEAR = /20(1\d|2[0-5])\b/;
// Michael caught this: "you're looking at bowman sterling and non rookie
// prospects purple mojos". A base-set card must exclude every SUBSET, because
// the same player holds a prospect card, a Sterling card, an insert and an
// auto, all of which match on player + colour + parallel. His Konnor Griffin
// base-set #1 rookie Purple Mojo /250 came back at a $20.00 median off 33 hits
// that were BCP-92 prospects, Bowman Sterling BST-7, Electric Sluggers ES-17
// and BMA-KG autos. Not one was his card. Filtered properly it is ~$36 on 2
// asks. The bare card number was no help either: requiring \b1\b matches any
// "1" anywhere in a title.
const SUBSET = /\bBCP[- ]?\d|prospect|\bBST[- ]?\d|sterling|electric slugger|\bES[- ]?\d|\bBMA[- ]?|\bCPA[- ]?|\bBDC[- ]?\d|redemption|\bWBC[- ]?\d|travel tag|big break|stars of|crystalized|final draft|spotlight|packfractor|retrofractor/i;
// A BARE colour word eats TEAM NAMES. "Reds", "Red Sox", "Blue Jays" all matched
// the old bare list, so a Reds or Blue Jays player's own base card excluded itself
// by its team name: Alfredo Duno (Reds) has 154 live BCP-235 listings and came
// back with ZERO comps. The card-intake skill records this exact trap and the
// script had it anyway.
//
// So: a colour only counts when it is BOUND to a parallel word. Pattern names that
// are never teams (sapphire, lazer, pulsar...) can still stand alone. Red White &
// Blue is deliberately NOT here - it is a real parallel and bounding it this way
// keeps it from nuking its own comps.
const COLOUR_WORD = 'fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|rose gold|steel';
const PATTERN_WORD = 'refractor|mojo|fractor|shimmer|speckle|reptilian|pulsar|wave|ink|prism';
const COLOURS = new RegExp(
  `(${COLOUR_WORD})\\s*(${PATTERN_WORD})|(${PATTERN_WORD})\\s*(${COLOUR_WORD})`
  + `|sapphire|lazer|laser|speckle|reptilian|geometric|pulsar|shimmer|\\bwave\\b`, 'i');

type Card = {
  i: number; box: number; player: string; card_number: string | null;
  kind: string; parallel: string; first_bowman?: boolean; rc?: boolean;
};

function spec(c: Card) {
  // chrome is required: without it the 2026 Bowman PAPER prospects and other
  // products flood in and the median collapses. Trout's Mojo first came back at
  // $1.50 off 161 "asks" for exactly that reason.
  const must: RegExp[] = [/2026/, /bowman/i, /chrome/i];
  // AUTO sits in the default not-list, which is right for every card EXCEPT an
  // autograph. For a CPA- card that exclusion deletes exactly the comps you want:
  // Angel Salio's on-card CPA-AS auto came back at $2.99 off 9 asks (the plain
  // Mojo of the same player) when the vault's other CPA autos ask $125. If the
  // card IS an auto, require the auto wording instead of excluding it.
  const isAuto = /^(CPA|CRA|BBA|BGP|RA|IS|FMA|JCAR)-/i.test(c.card_number ?? '')
    || /autograph|\bauto\b/i.test(c.parallel);
  const not: RegExp[] = isAuto ? [GRADED, LOT, OTHER_YEAR] : [AUTO, GRADED, LOT, OTHER_YEAR];
  if (isAuto) {
    must.push(/\bautos?\b|autograph|signed|on.?card/i);
    // An UNNUMBERED auto is the cheapest tier of its own card by a wide margin.
    // Angel Salio's plain CPA-AS sits around $15 on ~18 asks while his numbered
    // colour autos run $350-$1300, so leaving the colours in puts the median an
    // order of magnitude high. Comp the tier, not the ladder.
    if (!/\/\s?\d{2,4}/.test(c.parallel)) {
      not.push(SERIAL, /gold ink|shimmer|speckle|reptilian|pulsar|popcorn|\bwave\b|lazer|laser/i,
        /(fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|steel|sapphire)\s*(refractor|mojo|ink|auto)/i);
    }
  }
  // rc flag is needed by spec(); declared on Card below
  let q = '2026 Bowman Chrome ' + flat(c.player);

  // A COLOURED Mojo must REQUIRE its colour and its run size. Getting this
  // backwards is what kept Konnor Griffin's base-set #1 rookie Purple Mojo /250
  // pinned at $20: the plain-Mojo branch swallowed it and then excluded every
  // title containing "purple mojo", i.e. excluded the actual card.
  const colourMojo = c.parallel.match(/(fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|rose gold|steel)\s+mojo/i);
  const runSize = c.parallel.match(/\/\s?(\d{2,4})/);

  if (colourMojo) {
    const colour = colourMojo[1].toLowerCase();
    // Do NOT require the word "mojo". The market writes the same card as
    // "Aqua Refractor /125" or "True Aqua Refractor /125" as often as
    // "Aqua Mojo Refractor /125", and requiring it left the Guerrero Aqua on a
    // single ask. The colour plus the run size already pin the card down; what
    // has to be excluded is the OTHER patterns at that same colour and serial,
    // which are different cards at different prices (skill: True vs Shimmer).
    must.push(new RegExp(colour, 'i'));
    if (runSize) must.push(new RegExp('\\/\\s?' + runSize[1] + '\\b'));
    not.push(/pulsar|shimmer|reptilian|geometric|speckle|\bwave\b|lazer|laser/i);
    q += ' ' + colour + ' refractor';
  } else if (/Red RC Variation/i.test(c.parallel)) {
    // The Red RC is neither a Refractor nor base. It is identified by the red
    // MLB shield, sellers title it "Red RC Variation" or "Red Rookie", and it
    // has no serial. Do not strip the word red here.
    // Requiring "red" and "RC" as two LOOSE words matched every plain rookie whose
    // title happened to carry the word red, and pinned Caglianone's Red RC at $8.30
    // off 101 "asks" when the real field is ~$20-$35. Require the PHRASE.
    must.push(/red\s*(rc|rookie)|rookie\s*red|red\s*rc\s*variation/i);
    not.push(SERIAL, /mojo|lazer|sapphire|fuchsia|purple|blue|aqua|green|yellow|gold|orange/i);
    q = '2026 Bowman Chrome ' + flat(c.player) + ' red RC variation';
  } else if (/Mojo/i.test(c.parallel)) {
    must.push(/mojo/i);
    // a PLAIN Mojo must not be a coloured one
    not.push(/(fuchsia|purple|pink|blue|aqua|green|yellow|gold|orange|black|red|rose gold|steel)\s+mojo/i);
    not.push(SERIAL);
    q += ' mojo refractor';
  } else if (/^Refractor$/i.test(c.parallel)) {
    must.push(/refractor/i);
    not.push(SERIAL, COLOURS, /mojo|x-?fractor|prism/i);
    q += ' refractor';
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
    // "Logofractor" contains "fractor" but NOT "refractor", so /refractor/ let it
    // straight through and a $17.99 JoJo Parker Logofractor became the median for
    // his ~$2 base card. /fractor/ covers Re-, X- and Logo- in one.
    not.push(SERIAL, COLOURS, /mojo|fractor|prism|sapphire/i);
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
    if (isAuto && /^[A-Z]+-[A-Z]+$/i.test(c.card_number)) {
      // An auto code like CPA-AS must NOT fall through to the base-set branch:
      // that pushes SUBSET, which itself excludes /\bCPA[- ]?/ - the filter would
      // throw away every copy of the card it is trying to price - and then
      // requires a literal "#CPA-AS" that most titles do not write with a hash.
      // Match the code loosely and skip SUBSET entirely.
      const [pre, suf] = c.card_number.split('-');
      numRe = new RegExp('\\b' + pre + '[- ]?' + suf + '\\b', 'i');
    } else if (c.card_number.startsWith('BCP-')) {
      numRe = new RegExp('\\bBCP[- ]?' + c.card_number.slice(4) + '\\b', 'i');
    } else if (c.card_number.startsWith('SB-') || c.card_number.startsWith('IT-')) {
      numRe = new RegExp('\\b' + c.card_number.replace('-', '[- ]?') + '\\b', 'i');
    } else {
      // BASE SET. Every subset is a different card, so exclude them all rather
      // than lean on a bare number that may be a single digit.
      not.push(SUBSET);
      // A one or two digit number is too weak to require on its own, so only
      // require it when the title actually carries a #-prefixed number; and for
      // a rookie, require the RC wording instead.
      numRe = new RegExp('#\\s?' + c.card_number + '\\b');
      if (c.rc) {
        must.push(/\bRC\b|rookie/i);
        numRe = null;   // RC wording plus the SUBSET exclusion is the better filter
      } else if (Number(c.card_number) < 10) {
        numRe = new RegExp('#\\s?' + c.card_number + '\\b');
      } else {
        numRe = null;
      }
    }
  }
  // The parallel branches above build a query like "... mojo refractor", which for
  // an auto is far too narrow - it returned ONE ask for a card with a deep market.
  // Query on the auto wording instead; the filters still do the narrowing.
  if (isAuto) q = '2026 Bowman Chrome ' + flat(c.player) + ' auto';
  return { q, must, not, numRe };
}

/**
 * Strip diacritics. Elmer Rodriguez returned ONE ask because the surname filter
 * did `'Rodríguez'.replace(/[^A-Za-z]/g,'')` -> "Rodrguez", which matches no
 * title on earth, and because the accented query only reaches accented titles
 * (152 hits accented vs 200 unaccented, on the same card). Deaccent the query
 * AND both sides of every title comparison.
 */
const flat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

const pct = (v: number[], p: number) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const all: Card[] = JSON.parse(readFileSync(FILE, 'utf8'));
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
    // Drop a generational suffix before taking the surname. "James Tibbs III"
    // yielded a surname of "III", so a card with 200 live listings returned ZERO
    // comps. "Wilton Guerrero Jr." yielded "jr" and only worked by accident.
    const parts = flat(c.player).split(' ').map((w) => w.replace(/[^A-Za-z]/g, ''))
      .filter((w) => w && !/^(jr|sr|i{1,3}|iv|v)$/i.test(w));
    const surname = parts[parts.length - 1] ?? '';
    const kept = (j.itemSummaries ?? []).filter((it: any) => {
      const t = flat(it.title ?? '');
      // The surname has had its punctuation stripped, so strip the title's too
      // before comparing. Avery Owusu-Asiedu became "OwusuAsiedu" and matched
      // nothing, because every real title writes it hyphenated. Same family of
      // bug as the accent one above: normalise BOTH sides, never just one.
      if (!new RegExp(surname, 'i').test(t.replace(/[^A-Za-z0-9]/g, ''))) return false;
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

  writeFileSync('scripts/' + TAG + '.json', JSON.stringify(out, null, 1));
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
