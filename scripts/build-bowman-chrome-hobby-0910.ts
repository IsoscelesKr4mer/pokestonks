/**
 * 2026 Bowman Chrome hobby box rip, 2026-09-10. 60 cards -> card records.
 *
 * Parallel calls, and how each was actually settled (card-intake skill s1/s2):
 *
 *   The Topps Chrome back marker DOES NOT EXIST on Bowman Chrome. Verified with
 *   a control: #3 (Orange /25) and #6 (Blue /150) are certainly Refractors and
 *   neither back carries the word REFRACTOR anywhere. So the back cannot settle
 *   base vs Refractor here and the call is made on the FRONT.
 *
 *   The control pair for the front test is cards 1 and 43, BOTH Murakami #76
 *   out of the same box. #1 shows a broad spectral sweep across the dark border;
 *   #43 is flat neutral chrome. Every one of the 60 was then checked with the
 *   same left-border crop against those two anchors plus #5 (Refractor /499) and
 *   #8 (flat). Only 1, 2 and 5 showed the sweep.
 *
 *   Serials were read off the fronts, not inferred from the odds sheet. All 60
 *   fronts were scanned for one; exactly six carry it.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
config({ path: '.env.local' });

const ros = JSON.parse(readFileSync('scripts/_bow_roster.json', 'utf8'));
const pairs = JSON.parse(readFileSync('scripts/_bow_pairs.json', 'utf8'));

/** i -> parallel string. Anything absent is plain base. */
const PARALLEL: Record<number, string> = {
  // NOT plain Refractors. Michael caught this: both are Red Rookie variations,
  // the rookie-of-the-year buyback-style short print, and they sell at a
  // premium over a Refractor. The tell is the MLB shield inside the RC badge,
  // RED on the variation and NAVY on every other rookie in the box. Checked all
  // 12 rookies: exactly these two are red. That is also why they refract while
  // the second copy of Murakami #76 out of the same box does not.
  1: 'Red Rookie Variation',
  2: 'Red Rookie Variation',
  3: 'Orange Refractor /25 (22/25)',
  4: 'Orange Refractor /25 (07/25)',
  5: 'Refractor /499 (460/499)',
  6: 'Blue Refractor /150 (094/150)',
  7: 'Purple Refractor /250 (066/250)',
  9: 'Purple Refractor /250 (241/250), Autograph',
  10: 'base, Autograph',
  27: 'X-Fractor',
};

const INSERT: Record<string, string> = {
  'SF-': 'Stars of the Future insert',
  'BB-': 'Big Break insert',
  'TT-': 'Travel Tags insert',
  'IT-': 'It Came to the League insert',
  'SB-': 'MLB Spring Breakout insert',
};

function setName(num: string) {
  for (const [p, name] of Object.entries(INSERT)) if (num.startsWith(p)) return `2026 Bowman Chrome (${name})`;
  if (num.startsWith('BCP-')) return '2026 Bowman Chrome Prospects';
  if (num.startsWith('CPA-')) return '2026 Bowman Chrome (Prospect Autographs)';
  if (num.startsWith('WBC-')) return '2026 Bowman Chrome (WBC Flag Variation)';
  return '2026 Bowman Chrome';
}

const cards = ros.map((r: any) => {
  const parallel = PARALLEL[r.i] || 'base';
  const firstBowman = r.num.startsWith('BCP-') || r.num.startsWith('CPA-');
  return {
    i: r.i,
    player: r.player,
    team: r.team,
    set_name: setName(r.num),
    year: 2026,
    card_number: r.num,
    parallel,
    front: pairs[r.i - 1][0],
    back: pairs[r.i - 1][1],
    firstBowman,
    auto: parallel.includes('Autograph'),
  };
});

writeFileSync('scripts/_bow_cards.json', JSON.stringify(cards, null, 1));
console.log(`${cards.length} cards built`);
const hits = cards.filter((c: any) => c.parallel !== 'base');
console.log(`\n${hits.length} non-base:`);
for (const c of hits) console.log(`  #${String(c.i).padStart(2)} ${c.card_number.padEnd(8)} ${c.player.padEnd(22)} ${c.parallel}`);
const bySet: Record<string, number> = {};
for (const c of cards) bySet[c.set_name] = (bySet[c.set_name] || 0) + 1;
console.log('\nby set:');
for (const [k, v] of Object.entries(bySet).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
