/**
 * Pull the whole live parallel ladder for each hit player, so a card with no
 * direct comp can be priced off the tiers either side of it instead of guessed.
 *
 * Half of these cards have zero listings of the exact parallel, which is normal
 * for a /25 out of a product that released today. Memory (a serial is a
 * multiplier, not a floor) says: price the player first, then apply scarcity.
 * This prints the player's own ladder so that multiplier is measured off his
 * own cards rather than assumed.
 *
 * Tier is read off the title's serial, which is the only field sellers write
 * consistently. Autos are kept in a separate bucket because an auto of a /250
 * is a different card from a /250.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { browseToken, GRADED } from './lib/card-comps';
config({ path: '.env.local' });

const TARGETS = [
  { i: 3, player: 'Aiva Arquette', q: '2026 Bowman Chrome Aiva Arquette' },
  { i: 4, player: 'Josh Naylor', q: '2026 Bowman Chrome Josh Naylor WBC' },
  { i: 5, player: 'Angel Salio', q: '2026 Bowman Chrome Angel Salio' },
  { i: 6, player: 'Bryan Woo', q: '2026 Bowman Chrome Bryan Woo' },
  { i: 7, player: 'Caleb Bonemer', q: '2026 Bowman Chrome Caleb Bonemer' },
  { i: 9, player: 'Wilder Dalis', q: '2026 Bowman Chrome Wilder Dalis' },
  { i: 10, player: 'Ricky Moneys', q: '2026 Bowman Chrome Ricky Moneys' },
  { i: 27, player: 'Johenssy Colome', q: '2026 Bowman Chrome Johenssy Colome' },
  { i: 1, player: 'Munetaka Murakami', q: '2026 Bowman Chrome Munetaka Murakami #76' },
  { i: 2, player: 'Parker Messick', q: '2026 Bowman Chrome Parker Messick #3' },
];

/** Other insert sets that also print colour parallels at the same serials. */
const OTHER_INSERTS = ['electric sluggers', 'power chords', 'stars of the future', 'travel tags',
  'it came to the league', 'big break', 'spring breakout', 'top 100', 'bowman spotlights',
  'final draft', 'crystalized', 'across the seams', 'gpk', 'es-', 'pc-', 'sf-', 'tt-', 'bb-', 'sb-', 'btp-'];

const AUTOCODES = ['cpa-', 'ra-', 'is-', 'bcpa-'];

(async () => {
  const tok = await browseToken();
  const report: any[] = [];
  for (const t of TARGETS) {
    const surname = t.player.split(' ').pop()!.toLowerCase();
    const rows: any[] = [];
    const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search?q=' +
      encodeURIComponent(t.q) + '&category_ids=261328&limit=200';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j: any = await r.json();
    for (const it of j.itemSummaries || []) {
      const title = it.title || '';
      const low = title.toLowerCase();
      if (GRADED.test(title)) continue;
      if (!low.includes(surname) || !low.includes('bowman') || !low.includes('2026')) continue;
      if (/you pick|choose|lot of|break|minimum/.test(low)) continue;
      if (OTHER_INSERTS.some(x => low.includes(x))) continue;
      const v = Number(it.price?.value);
      if (!(v > 0 && v < 100000)) continue;
      const ser = low.match(/\/\s?(\d{1,4})\b/);
      const auto = /\bauto|autograph|signed/.test(low) || AUTOCODES.some(c => low.includes(c));
      rows.push({ run: ser ? Number(ser[1]) : null, auto, price: v, title: title.slice(0, 88) });
    }
    rows.sort((a, b) => (a.auto === b.auto ? (b.run || 99999) - (a.run || 99999) : (a.auto ? 1 : -1)));
    console.log('\n================ #' + t.i + ' ' + t.player + '  (' + rows.length + ' usable listings)');
    let bucket = '';
    for (const x of rows) {
      const b = (x.auto ? 'AUTO ' : 'RAW  ') + (x.run ? '/' + x.run : 'unnumbered');
      if (b !== bucket) { bucket = b; console.log('  --- ' + b); }
      console.log('      $' + String(x.price).padStart(8) + '  ' + x.title);
    }
    report.push({ ...t, rows });
    await new Promise(res => setTimeout(res, 200));
  }
  writeFileSync('scripts/_bow_ladder.json', JSON.stringify(report, null, 1));
})();
