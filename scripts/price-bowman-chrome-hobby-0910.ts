/**
 * Price the 60-card Bowman Chrome hobby rip off live eBay asks.
 *
 * Uses scripts/lib/card-comps.ts so the query/filter rules stay in one place.
 * Two things this reports that a bare median hides, both from memory:
 *   - the ask COUNT, because a median off fewer than 4 asks is one seller's
 *     opinion and gets flagged rather than quoted
 *   - the 1st-Bowman prospects are the same physical card as thousands of
 *     others, so a thin result there means a bad query, not a thin market
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { browseToken, comps, buildQuery, pct } from './lib/card-comps';
config({ path: '.env.local' });

const cards = JSON.parse(readFileSync('scripts/_bow_cards.json', 'utf8'));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  const tok = await browseToken();
  const out: any[] = [];
  for (const c of cards) {
    const p = await comps(tok, c);
    const med = p.length ? pct(p, 0.5) : null;
    out.push({ ...c, asks: p.length, median: med, low: p.length ? Math.min(...p) : null, q: buildQuery(c) });
    const flag = p.length === 0 ? 'NO COMPS' : p.length < 4 ? `THIN(${p.length})` : '';
    console.log(
      `#${String(c.i).padStart(2)} ${c.card_number.padEnd(8)} ${c.player.slice(0, 20).padEnd(20)} ` +
      `${(c.parallel === 'base' ? '' : c.parallel).slice(0, 30).padEnd(30)} ` +
      `${med === null ? '   -  ' : ('$' + med.toFixed(2)).padStart(7)} (${String(p.length).padStart(2)} asks) ${flag}`);
    await sleep(140);
  }
  writeFileSync('scripts/_bow_priced.json', JSON.stringify(out, null, 1));
  const none = out.filter(o => o.asks === 0), thin = out.filter(o => o.asks > 0 && o.asks < 4);
  console.log(`\npriced ${out.length - none.length}/${out.length}; ${thin.length} thin, ${none.length} no comps`);
})();
