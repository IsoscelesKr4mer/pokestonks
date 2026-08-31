/**
 * Rebuild the price layer on the 08-31 review page from the current comp JSON.
 *
 * Idempotent on purpose. The first pass at this appended price chips, so
 * re-running it after the comps were corrected would have stacked a second
 * chip on every card rather than replacing the first. This strips the price
 * chips, the money row and the earlier-drop table before writing them again,
 * so it can be run as many times as the comps change.
 *
 *   npx tsx scripts/rebuild-chrome-review-0831.ts
 */
import { readFileSync, writeFileSync } from 'fs';

type Comp = { num: string; player: string; par?: string; n: number; med: number | null; n_comps: number; lo: number | null; hi: number | null };

const nonBase: Comp[] = JSON.parse(readFileSync('data/chrome_drop_0831_comps.json', 'utf8'));
const base: Comp[] = JSON.parse(readFileSync('data/chrome_drop_0831_base_comps.json', 'utf8'));
const px = new Map<string, Comp>();
for (const c of nonBase) px.set(`${c.num}|${c.par}`, c);
for (const c of base) px.set(`${c.num}|base`, c);

// The 08-30 batch, re-run with the same corrected filters.
const EARLIER: [string, string, string, number, number, number, number][] = [
  ['#3',      'Yordan Alvarez',    'RayWave Refractor',         35.00, 16,  28.99,  40.00],
  ['#1',      'Shohei Ohtani',     'base',                      10.25, 159,  4.25, 150.00],
  ['91CB-21', 'Sal Stewart',       '1991 Topps Baseball',        3.00, 187,  1.00,  28.49],
  ['#99',     'Ketel Marte',       'Red White & Blue Refractor', 2.79, 19,   1.09,   5.99],
  ['#296',    'Chris Sale',        'Baseball Seams Refractor',   2.50, 12,   1.49,  10.00],
  ['WC-1',    'Aaron Judge',       'Wrecking Crew',              2.39, 173,  0.99,  34.99],
  ['#164',    'Jeff McNeil',       'RayWave Refractor',          2.35, 14,   1.00,  19.99],
  ['#272',    'Daniel Schneemann', 'Red White & Blue Refractor', 2.00, 18,   0.99,   7.00],
  ['#62',     'Luis Castillo',     'Baseball Seams Refractor',   1.99, 11,   0.99,   5.00],
  ['RVA-8',   'David Wright',      'Chrome Rivals',              1.99, 183,  0.99,  24.49],
  ['BTP-5',   'Elly De La Cruz',   'Big Ticket Players',         1.99, 167,  0.99, 325.00],
  ['91CB-3',  'Bryce Harper',      '1991 Topps Baseball',        1.79, 176,  0.99,  30.00],
  ['RVA-20',  'Jarren Duran',      'Chrome Rivals',              1.78, 169,  0.99,  19.99],
  ['FS-4',    'Samuel Basallo',    'Future Stars',               1.75, 170,  0.99,  33.00],
  ['WC-8',    'Giancarlo Stanton', 'Wrecking Crew',              1.75, 163,  0.99,  28.00],
  ['BTP-11',  'Juan Soto',         'Big Ticket Players',         1.69, 141,  0.99, 250.00],
  ['91CB-4',  'Cal Raleigh',       '1991 Topps Baseball',        1.68, 179,  0.99,  10.00],
];
const THIN = 4; // fewer live asks than this and the median is one seller's opinion

let html = readFileSync('eBay_assets/chrome_drop_0831_review.html', 'utf8');

// --- strip anything a previous run wrote ---------------------------------
html = html.replace(/<span class="px[^"]*">[^<]*(?:<i>[^<]*<\/i>)?<\/span>/g, '');
html = html.replace(/\n?\s*<div class="money">[\s\S]*?<\/div>/, '');
html = html.replace(/<section id="earlier">[\s\S]*?<\/section>\n?/, '');
html = html.replace(/<p><strong>What the prices are\.<\/strong>[\s\S]*?<\/p>\n\s*/, '');

// --- price chip on every card -------------------------------------------
let hit = 0; const miss: string[] = [];
html = html.replace(
  /<b>([^<]+)<\/b> ([^<]+?)<span class="tm">([^<]*)<\/span><span class="pl">([^<]*)<\/span>/g,
  (m, num, player, _team, par) => {
    const c = px.get(`${num}|${par}`);
    if (!c || c.med == null) { miss.push(`${num} ${player} (${par})`); return m; }
    hit++;
    const thin = c.n_comps < THIN;
    const cls = thin ? ' thin' : c.med >= 10 ? ' hi' : '';
    return m + `<span class="px${cls}">$${c.med.toFixed(2)}` +
      `<i>${thin ? `only ${c.n_comps} ask${c.n_comps === 1 ? '' : 's'}` : `${c.n_comps} asks`}` +
      ` &middot; $${c.lo!.toFixed(2)}&ndash;$${c.hi!.toFixed(2)}</i></span>`;
  },
);

// --- totals ---------------------------------------------------------------
const rows = readFileSync('data/chrome_drop_0831.tsv', 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && !l.startsWith('back\t')).map((l) => l.split('\t'));
const tot = (rs: string[][]) => rs.reduce((a, r) => a + (px.get(`${r[1]}|${r[4]}`)?.med ?? 0), 0);
const tBase = tot(rows.filter((r) => r[4] === 'base'));
const tPar = tot(rows.filter((r) => r[4] !== 'base'));
const tEarly = EARLIER.reduce((a, r) => a + r[3], 0);
const thinCards = [...px.values()].filter((c) => c.med != null && c.n_comps < THIN);

// --- styles, written once -------------------------------------------------
if (!html.includes('.px{')) {
  html = html.replace('</style>', `  .px{font-family:"JetBrains Mono",monospace;font-size:.86rem;font-weight:600;
    color:var(--ink);margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--rule);
    display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap}
  .px.hi{color:var(--accent)}
  .px.hi::before{content:"";width:5px;height:5px;border-radius:50%;
    background:var(--accent);flex:none;align-self:center}
  .px.thin{color:var(--soft)}
  .px.thin::before{content:"?";font-size:.7rem;font-weight:700;color:var(--soft);flex:none}
  .px i{font-style:normal;font-size:.58rem;font-weight:400;color:var(--faint);letter-spacing:.01em}
  .money{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.7rem;
    font-family:"JetBrains Mono",monospace;font-size:.74rem}
  .money span{background:var(--wash);border:1px solid var(--rule);border-radius:100px;
    padding:.3rem .7rem;color:var(--soft)}
  .money b{color:var(--accent)}
  .tw{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:.82rem;min-width:520px}
  th{text-align:left;font-family:"JetBrains Mono",monospace;font-size:.62rem;
    letter-spacing:.12em;text-transform:uppercase;color:var(--faint);
    padding:0 .7rem .5rem 0;border-bottom:1px solid var(--rule);white-space:nowrap}
  td{padding:.5rem .7rem .5rem 0;border-bottom:1px solid var(--rule);vertical-align:baseline}
  td.k{font-family:"JetBrains Mono",monospace;font-size:.74rem;color:var(--accent);white-space:nowrap}
  td.q{color:var(--soft)}
  td.v{font-family:"JetBrains Mono",monospace;font-weight:600;text-align:right;
    white-space:nowrap;font-variant-numeric:tabular-nums}
  td.v.hi{color:var(--accent)}
  td.s{font-family:"JetBrains Mono",monospace;font-size:.6rem;color:var(--faint);white-space:nowrap}
  tfoot td{border-bottom:none;border-top:2px solid var(--ink);font-weight:600;padding-top:.6rem}
</style>`);
}

// --- money row ------------------------------------------------------------
html = html.replace('</div>\n  </header>', `</div>
    <div class="money">
      <span>parallels <b>$${tPar.toFixed(2)}</b></span>
      <span>base <b>$${tBase.toFixed(2)}</b></span>
      <span>08-30 batch <b>$${tEarly.toFixed(2)}</b></span>
      <span>all 130 <b>$${(tBase + tPar + tEarly).toFixed(2)}</b></span>
      <span>median active ask</span>
    </div>
  </header>`);

html = html.replace('<p>The <strong>base</strong> section',
  `<p><strong>What the prices are.</strong> Each card carries the median asking price of the live raw listings for that exact player and parallel, with the spread and the ask count under it. Autographs, serial-numbered colour parallels and graded copies are excluded, so a plain Logofractor is never priced off its own /25 auto. Asks sit above sales, so read these as the top of the range. Cards over $10 are dotted; a <strong>?</strong> means fewer than ${THIN} live asks, which is one seller's opinion rather than a market.</p>
    <p>The <strong>base</strong> section`);

// --- earlier batch table --------------------------------------------------
const tr = EARLIER.map(([id, pl, par, med, n, lo, hi]) =>
  `<tr><td class="k">${id}</td><td>${pl}</td><td class="q">${par}</td>` +
  `<td class="v${med >= 10 ? ' hi' : ''}">$${med.toFixed(2)}</td>` +
  `<td class="s">${n} asks &middot; $${lo.toFixed(2)}&ndash;$${hi.toFixed(2)}</td></tr>`).join('');
html = html.replace('<footer>', `<section id="earlier">
<h2>Earlier rip<span class="n">17</span><span class="lab">08-30 batch</span></h2>
<p class="sub">The batch photographed the night before, priced the same way. Cova is PC and is not here. No thumbnails &mdash; you have already checked these calls; this is the pricing.</p>
<div class="tw"><table>
<thead><tr><th>Card</th><th>Player</th><th>Parallel</th><th>Ask</th><th>Asks seen</th></tr></thead>
<tbody>${tr}</tbody>
<tfoot><tr><td colspan="3">17 cards</td><td class="v">$${tEarly.toFixed(2)}</td><td></td></tr></tfoot>
</table></div>
</section>
<footer>`);

html = html.replace(/<span>(?:priced [\d/]+|130 cards priced)[^<]*<\/span>/,
  `<span>${hit}/113 priced &middot; data/chrome_drop_0831.tsv</span>`);

writeFileSync('eBay_assets/chrome_drop_0831_review.html', html);
console.log(`priced ${hit}/113`);
if (miss.length) console.log('NO PRICE:', miss.join(', '));
if (thinCards.length) console.log('thin:', thinCards.map((c) => `${c.num} ${c.player} (${c.n_comps})`).join(', '));
console.log(`parallels $${tPar.toFixed(2)} + base $${tBase.toFixed(2)} + earlier $${tEarly.toFixed(2)} = $${(tBase + tPar + tEarly).toFixed(2)}`);
