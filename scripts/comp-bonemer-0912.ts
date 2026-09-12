/**
 * What is the Bonemer Purple Wave /250 actually worth right now?
 *
 *   npx tsx scripts/comp-bonemer-0912.ts
 *
 * Read only. Michael: "Check comps and you decide. I want to actually sell
 * stuff and not have it sit forever especially while the set is still new."
 *
 * The vault says $13 after the Wave correction, the live listing says $18.
 * Prints the live asks so the choice is made off the market rather than off
 * whichever number is newer.
 */
import { config } from 'dotenv';
import { browseToken, comps, buildQuery, pct } from './lib/card-comps';
config({ path: '.env.local' });

const CARD = {
  player: 'Caleb Bonemer',
  set_name: '2026 Bowman Chrome',
  card_number: 'BCP-218',
  parallel: 'Purple Wave Refractor /250 (066/250)',
  year: 2026,
};

(async () => {
  const tok = await browseToken();
  console.log('query: ' + buildQuery(CARD as any));
  const p = await comps(tok, CARD as any);
  p.sort((a, b) => a - b);
  console.log('asks: ' + p.length);
  console.log(p.map((x) => '$' + x.toFixed(2)).join('  '));
  if (p.length) {
    console.log('\nlow    $' + Math.min(...p).toFixed(2));
    console.log('25th   $' + pct(p, 0.25).toFixed(2));
    console.log('median $' + pct(p, 0.5).toFixed(2));
    console.log('75th   $' + pct(p, 0.75).toFixed(2));
    for (const ask of [13, 18]) {
      const cheaper = p.filter((x) => x < ask).length;
      console.log('at $' + ask + ': ' + cheaper + ' of ' + p.length + ' live asks are cheaper');
    }
  }
})();
