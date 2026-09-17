/**
 * Build the listing plan for the 2026 Bowman Chrome hobby rip.
 *
 *   npx tsx scripts/build-bowman-listings-0910.ts
 *
 * Writes two plans and PUBLISHES NOTHING:
 *   scripts/_bow_individual.json   15 single-card listings
 *   scripts/_bow_dropdown.json     one 45-card you-pick
 *
 * The split is by whether a buyer searches the card by name. Every non-base
 * card gets its own listing, plus the five base/insert cards at $10 or more.
 * The rest go in the dropdown, where the flat $0.40 order fee and the $0.97
 * label get amortised across a multi-card order: a $2 card nets $1.23 sold
 * alone and $1.63 as one of five, a third more on the same card.
 *
 * This is a NEW dropdown, not an addition to the existing Bowman Chrome
 * refractor you-pick (item 168622311437). That one holds 2026 Bowman MEGA BOX
 * mojo and lazer refractors, which use the 2026 Bowman numbering, where #6 is
 * Sal Stewart and #100 is Mike Trout. In this hobby set #6 is Kevin McGonigle
 * and #100 is Shohei Ohtani. Merging them would put two different #6s in one
 * dropdown.
 *
 * Parallels and prices come from the DATABASE, never from the priced-snapshot
 * json. That snapshot predates Michael's Shimmer and Red RC corrections, and
 * building from it produced a title saying "Orange Refractor /25" at $225 for
 * a card that is an Orange Shimmer worth $145.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, writeFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const snapshot = JSON.parse(readFileSync('scripts/_bow_final_prices.json', 'utf8'));
const rookie: Record<string, boolean> = JSON.parse(readFileSync('scripts/_bow_rookie.json', 'utf8'));
/**
 * 1ST BOWMAN read off each card FRONT, not inferred from the BCP- prefix.
 * The BCP subset holds both first-Bowman cards and repeat prospects, and only
 * the first carries the logo. Inferring it from the prefix put a false '1st
 * Bowman' in the title of the $145 Arquette. Michael caught it on Jesus Made.
 */
const FIRST_BOWMAN: Record<string, boolean> = JSON.parse(readFileSync('scripts/_bow_firstbowman.json', 'utf8'));
const isFirstBowman = (n: string) => FIRST_BOWMAN[n] === true;

const eps: Record<string, string> = existsSync('scripts/_bow_eps.json')
  ? JSON.parse(readFileSync('scripts/_bow_eps.json', 'utf8')) : {};

const ESE = '272052757012';   // eBay Standard Envelope, items <= $20
const GA = '269110723012';    // Ground Advantage, items > $20

const TEAM_SHORT: Record<string, string> = {
  'New York Yankees': 'Yankees', 'Cincinnati Reds': 'Reds', 'Boston Red Sox': 'Red Sox',
  'Chicago White Sox': 'White Sox', 'Atlanta Braves': 'Braves', 'Miami Marlins': 'Marlins',
  'New York Mets': 'Mets', 'Arizona Diamondbacks': 'Diamondbacks', 'Los Angeles Angels': 'Angels',
  'Kansas City Royals': 'Royals', 'Washington Nationals': 'Nationals', 'Toronto Blue Jays': 'Blue Jays',
  'Minnesota Twins': 'Twins', 'Baltimore Orioles': 'Orioles', 'San Diego Padres': 'Padres',
  'Athletics': 'Athletics', 'Colorado Rockies': 'Rockies', 'Cleveland Guardians': 'Guardians',
  'St. Louis Cardinals': 'Cardinals', 'Chicago Cubs': 'Cubs', 'Milwaukee Brewers': 'Brewers',
  'Seattle Mariners': 'Mariners', 'Detroit Tigers': 'Tigers', 'Texas Rangers': 'Rangers',
  'Tampa Bay Rays': 'Rays', 'Houston Astros': 'Astros', 'San Francisco Giants': 'Giants',
  'Los Angeles Dodgers': 'Dodgers', 'Philadelphia Phillies': 'Phillies', 'Pittsburgh Pirates': 'Pirates',
  'Canada': 'Canada',
};
const short = (t: string) => TEAM_SHORT[t] ?? t;

const isProspect = (n: string) => n.startsWith('BCP-') || n.startsWith('CPA-');
const isBase = (n: string) => /^\d+$/.test(n);
const insertOf = (s: string) => (s.match(/\(([^)]+?)\s*insert\)/) || [])[1] || null;

/** Strip the serial and the Autograph suffix; "base, Autograph" is an auto of
 *  the base card, so it must not leak the word "base" into a title. */
const parallelName = (p: string) => p
  .replace(/\s*\(\d+\/\d+\)/, '')
  .replace(/,?\s*Autograph$/, '')
  .replace(/^base,?\s*/, '')
  .trim();
const serialOf = (p: string) => (p.match(/\((\d+\/\d+)\)/) || [])[1] || null;

/**
 * Trim order matters. "Color Match" is a price justification and memory says a
 * premium that lives only in the description does not exist to a buyer
 * scrolling search results, so it is the LAST thing dropped, not the first.
 * The team name goes first because it is the least searched token here.
 */
/**
 * How a parallel is written in a TITLE, where the official name is either
 * redundant or wasteful. The DB keeps the official name; only search copy
 * changes here. "Chrome Rookie Red RC Variation" repeats the "Chrome" already
 * in "2026 Bowman Chrome" and then collides with the separate RC token, giving
 * "...Red RC Variation RC #76". Buyers search "red rookie" and "red RC", so
 * the short form keeps both and saves 8 characters.
 */
const TITLE_PARALLEL: Record<string, string> = {
  'Chrome Rookie Red RC Variation': 'Red Rookie RC Variation',
};

function title(c: any): string {
  const t = short(c.team);
  const ins = insertOf(c.set_name);
  const rawPar = c.parallel === 'base' ? '' : parallelName(c.parallel);
  const par = TITLE_PARALLEL[rawPar] ?? rawPar;
  // never print RC twice; the parallel may already carry it
  const rc = isBase(c.card_number) && rookie[c.card_number] && !par.includes("RC") ? "RC" : "";
  const first = isFirstBowman(c.card_number) ? '1st Bowman' : '';
  const auto = c.auto ? 'Auto' : '';
  const cm = c.colorMatch ? 'Color Match' : '';

  const build = (p: string) => [
    '2026 Bowman Chrome', ins || '', c.player, auto, p, first, rc,
    '#' + c.card_number, t, cm,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ');

  let s = build(par);
  // "True Purple Refractor /250" reads fine as "True Purple /250" and buys 10 chars
  if (s.length > 80 && /\w\s+Refractor/.test(par)) s = build(par.replace(/\s*Refractor/, ''));

  /**
   * "1st Bowman" is NEVER dropped. It is the single most valuable search token
   * in this product, and the first version of this trim quietly ate it off the
   * $125 Dalis auto to make room for the card number and Color Match. On a
   * prospect the code (#CPA-WD) goes before it, because a buyer hunting 1st
   * Bowman autos searches the phrase, not the code.
   */
  const droppable = [t, isProspect(c.card_number) ? '#' + c.card_number : '', rc, ins || '', cm];
  for (const d of droppable.filter(Boolean)) {
    if (s.length <= 80) break;
    s = s.replace(' ' + d, '').replace(/\s+/g, ' ');
  }
  if (s.length > 80 && first) {
    throw new Error('title still over 80 and only "1st Bowman" is left to cut: ' + s);
  }
  return s.slice(0, 80).trim();
}

function aspects(c: any) {
  const a: Record<string, string[]> = {
    Sport: ['Baseball'],
    League: ['Major League Baseball (MLB)'],
    Type: ['Sports Trading Card'],
    Set: ['2026 Bowman Chrome'],
    Season: ['2026'],
    Manufacturer: ['Bowman'],
    Player: [c.player],
    'Card Number': [c.card_number],
    Team: [short(c.team)],
    Grade: ['Ungraded'],
    Graded: ['No'],
    Vintage: ['No'],
    Autographed: [c.auto ? 'Yes' : 'No'],
    'Parallel/Variety': [c.parallel === 'base' ? 'Base' : (parallelName(c.parallel) || 'Base')],
  };
  const feat: string[] = [];
  if (/refractor|x-fractor/i.test(c.parallel)) feat.push('Refractor');
  if (serialOf(c.parallel)) feat.push('Serial Numbered');
  if (isFirstBowman(c.card_number)) feat.push('1st Bowman');
  if (isBase(c.card_number) && rookie[c.card_number]) feat.push('Rookie');
  if (c.auto) feat.push('Autograph');
  if (feat.length) a.Features = feat;
  const ins = insertOf(c.set_name);
  if (ins) a['Card Name'] = [ins];
  return a;
}

function description(c: any) {
  const ser = serialOf(c.parallel);
  const ins = insertOf(c.set_name);
  const par = c.parallel === 'base' ? '' : parallelName(c.parallel);
  const bits: string[] = [];
  bits.push('<p>' + ['2026 Bowman Chrome', ins || '', c.player, par, '#' + c.card_number + '.']
    .filter(Boolean).join(' ') + '</p>');
  if (c.auto) bits.push('<p>On-card autograph.</p>');
  if (ser) bits.push('<p>Serial numbered ' + ser + '.</p>');
  if (isFirstBowman(c.card_number)) bits.push('<p>1st Bowman card.</p>');
  else if (isBase(c.card_number) && rookie[c.card_number]) bits.push('<p>Rookie card.</p>');
  if (c.colorMatch) bits.push('<p>Rockies purple on a purple refractor, a team color match.</p>');
  bits.push('<p>Raw and ungraded, near mint or better. Ships in a penny sleeve and toploader protected between rigid cardboard, with tracking. Ships within 1 business day.</p>');
  bits.push('<p>Buying several? Add them all to your cart and they ship together.</p>');
  bits.push('<p>Smoke-free home. Thanks for looking.</p>');
  return bits.join('');
}

const photosOf = (c: any) => [eps[String(c.front)], eps[String(c.back)]].filter(Boolean);

(async () => {
  const rows: any[] = await sql`SELECT id, player, set_name, card_number, parallel,
      asking_price_cents cents FROM baseball_cards
    WHERE notes LIKE '%2026-09-10%' ORDER BY id`;

  // join the live row to the snapshot for the photo file numbers and team
  const byKey = new Map(snapshot.map((s: any) => [s.card_number + '|' + s.player, s]));
  const cards = rows.map((r) => {
    const s: any = byKey.get(r.card_number + '|' + r.player);
    if (!s) throw new Error('no snapshot row for ' + r.player + ' ' + r.card_number);
    return {
      i: s.i, id: r.id, player: r.player, team: s.team, set_name: r.set_name,
      card_number: r.card_number, parallel: r.parallel, cents: r.cents,
      front: s.front, back: s.back,
      auto: /Autograph/i.test(r.parallel),
      colorMatch: r.player === 'Wilder Dalis',
    };
  });
  if (cards.length !== 60) throw new Error('expected 60 rows, got ' + cards.length);

  // The split is by WHAT KIND OF CARD it is, not by price. The first version
  // used a $10 threshold, which put Renteria at $12.99 in his own listing and
  // Overn at $6 in the dropdown with no visible reason. Michael's call: hits
  // and inserts stand alone, base and prospects go in the dropdown.
  const individual = cards.filter((c) => c.parallel !== 'base' || insertOf(c.set_name) !== null);
  const dropdown = cards.filter((c) => !individual.includes(c));

  const indivPlan = individual.map((c) => {
    const t = title(c);
    return {
      i: c.i, id: c.id,
      sku: 'BOWCH-' + c.card_number.replace(/[^A-Za-z0-9]/g, '') + '-' + c.i,
      player: c.player, card_number: c.card_number, parallel: c.parallel,
      title: t, titleLen: t.length, priceCents: c.cents,
      fulfillmentPolicyId: (c.cents ?? 0) > 2000 ? GA : ESE,
      bestOffer: (c.cents ?? 0) >= 1000,
      aspects: aspects(c), description: description(c), photos: photosOf(c),
    };
  });

  const dropPlan = {
    title: '2026 Bowman Chrome You Pick Your Card Base Prospects Inserts RC 1st Bowman',
    varyBy: 'Card # / Player / Team',
    // Sorted the way a buyer scans a you-pick: base numbers ascending, then
    // the BCP prospects ascending, then the inserts grouped by set. The first
    // build left them in the order they came out of the packs, which reads as
    // random to anyone looking for a specific card.
    variations: [...dropdown].sort((a, b) => {
      const rank = (n: string) => (/^\d+$/.test(n) ? 0 : n.startsWith('BCP-') ? 1 : 2);
      const tail = (n: string) => Number((n.match(/(\d+)$/) || ['', '0'])[1]);
      const pre = (n: string) => (n.match(/^([A-Z]+)-/) || ['', ''])[1];
      return rank(a.card_number) - rank(b.card_number)
        || pre(a.card_number).localeCompare(pre(b.card_number))
        || tail(a.card_number) - tail(b.card_number);
    }).map((c) => {
      const ins = insertOf(c.set_name);
      const tag = ins ? ' (' + ins + ')'
        : isFirstBowman(c.card_number) ? ' (1st Bowman)'
        : rookie[c.card_number] ? ' (RC)' : '';
      // eBay caps a VariationSpecificValue at 50 chars. Drop the team first,
      // it is the least useful token in a dropdown row.
      let label = [c.card_number, c.player, short(c.team)].join(' - ') + tag;
      if (label.length > 50) label = [c.card_number, c.player].join(' - ') + tag;
      return {
        i: c.i, id: c.id,
        sku: 'BOWCH-YP-' + c.card_number.replace(/[^A-Za-z0-9]/g, '') + '-' + c.i,
        label,
        priceCents: c.cents ?? 199, priced: c.cents != null, qty: 1,
        photos: photosOf(c),
      };
    }),
  };

  writeFileSync('scripts/_bow_individual.json', JSON.stringify(indivPlan, null, 1));
  writeFileSync('scripts/_bow_dropdown.json', JSON.stringify(dropPlan, null, 1));

  console.log('=== INDIVIDUAL: ' + indivPlan.length + ' listings, $' +
    (indivPlan.reduce((s, x) => s + (x.priceCents ?? 0), 0) / 100).toFixed(2) + '\n');
  for (const x of indivPlan) {
    console.log(('$' + ((x.priceCents ?? 0) / 100).toFixed(2)).padStart(8) + '  ' +
      (x.fulfillmentPolicyId === GA ? 'GA ' : 'eSE') + (x.bestOffer ? ' BO' : '   ') +
      '  ' + String(x.titleLen).padStart(2) + 'ch  ' + x.title +
      (x.photos.length !== 2 ? '   >>> photos ' + x.photos.length : ''));
  }
  console.log('\n=== DROPDOWN: ' + dropPlan.variations.length + ' cards, $' +
    (dropPlan.variations.reduce((s, x) => s + x.priceCents, 0) / 100).toFixed(2));
  console.log('title (' + dropPlan.title.length + 'ch): ' + dropPlan.title + '\n');
  for (const v of dropPlan.variations) {
    console.log(('$' + (v.priceCents / 100).toFixed(2)).padStart(8) + '  ' + v.label +
      (v.priced ? '' : '   <- no comps, floor price') +
      (v.photos.length !== 2 ? '  >>> photos ' + v.photos.length : ''));
  }
  const bad = [...indivPlan, ...dropPlan.variations].filter((x: any) => x.photos.length !== 2).length;
  const longTitles = indivPlan.filter((x) => x.titleLen > 80).length;
  console.log('\nmissing photo pairs: ' + bad + ' | titles over 80: ' + longTitles);
  await sql.end();
})();
