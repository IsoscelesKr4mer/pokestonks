/**
 * Add the 08-30 batch to the 08-31 review page, so both rips live on one page.
 *
 * No thumbnails for these: their frames are in the earlier drop folder, and
 * embedding 34 more data URIs would push the page past 2MB for a batch Michael
 * has already eyeballed. The comps are the point here, not the re-check.
 *
 * Cova is PC and deliberately absent.
 */
import { readFileSync, writeFileSync } from 'fs';

const ROWS: [string, string, string, number, number, number, number][] = [
  // id, player, parallel, median, comps, lo, hi
  ['#3',       'Yordan Alvarez',    'RayWave Refractor',        37.99, 27,  19.89, 350.00],
  ['#1',       'Shohei Ohtani',     'base',                     10.50, 160,  4.99, 150.00],
  ['91CB-21',  'Sal Stewart',       '1991 Topps Baseball',       3.00, 195,  1.00, 199.00],
  ['#164',     'Jeff McNeil',       'RayWave Refractor',         2.99, 21,   1.00,  19.99],
  ['#99',      'Ketel Marte',       'Red White & Blue Refractor',2.79, 19,   1.09,   5.99],
  ['#296',     'Chris Sale',        'Baseball Seams Refractor',  2.50, 12,   1.49,  10.00],
  ['WC-1',     'Aaron Judge',       'Wrecking Crew',             2.50, 188,  0.99, 325.00],
  ['BTP-5',    'Elly De La Cruz',   'Big Ticket Players',        2.00, 189,  0.99, 489.98],
  ['#272',     'Daniel Schneemann', 'Red White & Blue Refractor',2.00, 18,   0.99,   7.00],
  ['#62',      'Luis Castillo',     'Baseball Seams Refractor',  1.99, 11,   0.99,   5.00],
  ['RVA-8',    'David Wright',      'Chrome Rivals',             1.99, 189,  0.99,  24.49],
  ['BTP-11',   'Juan Soto',         'Big Ticket Players',        1.99, 173,  0.99, 250.00],
  ['FS-4',     'Samuel Basallo',    'Future Stars',              1.95, 186,  0.99, 400.00],
  ['91CB-3',   'Bryce Harper',      '1991 Topps Baseball',       1.93, 187,  0.99, 499.99],
  ['RVA-20',   'Jarren Duran',      'Chrome Rivals',             1.79, 182,  0.99, 250.00],
  ['91CB-4',   'Cal Raleigh',       '1991 Topps Baseball',       1.78, 191,  0.99, 200.00],
  ['WC-8',     'Giancarlo Stanton', 'Wrecking Crew',             1.75, 181,  0.99, 100.00],
];

const total = ROWS.reduce((a, r) => a + r[3], 0);
const tr = ROWS.map(([id, pl, par, med, n, lo, hi]) =>
  `<tr><td class="k">${id}</td><td>${pl}</td><td class="q">${par}</td>` +
  `<td class="v${med >= 15 ? ' hi' : ''}">$${med.toFixed(2)}</td>` +
  `<td class="s">${n} asks &middot; $${lo.toFixed(2)}&ndash;$${hi.toFixed(2)}</td></tr>`).join('');

const section = `<section id="earlier">
<h2>Earlier rip<span class="n">17</span><span class="lab">08-30 batch</span></h2>
<p class="sub">The batch photographed the night before, priced the same way. Cova is PC and is not here. No thumbnails &mdash; you have already checked these calls; this is the pricing.</p>
<div class="tw"><table>
<thead><tr><th>Card</th><th>Player</th><th>Parallel</th><th>Ask</th><th>Comps</th></tr></thead>
<tbody>${tr}</tbody>
<tfoot><tr><td colspan="3">17 cards</td><td class="v">$${total.toFixed(2)}</td><td></td></tr></tfoot>
</table></div>
</section>`;

const css = `  .tw{overflow-x:auto}
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
</style>`;

let html = readFileSync('eBay_assets/chrome_drop_0831_review.html', 'utf8');
if (html.includes('id="earlier"')) { console.log('already added'); process.exit(0); }
html = html.replace('</style>', css);
html = html.replace('<footer>', section + '\n<footer>');
html = html.replace(/<span>priced 113\/113 &middot; /,
  `<span>130 cards priced &middot; `);
html = html.replace('<span>113 cards &middot; 226 frames</span>',
  '<span>113 cards &middot; 226 frames &middot; plus the 08-30 batch</span>');
html = html.replace(/(<span>all 113 <b>\$[\d.]+<\/b><\/span>)/,
  `$1<span>08-30 batch <b>$${total.toFixed(2)}</b></span>`);
writeFileSync('eBay_assets/chrome_drop_0831_review.html', html);
console.log(`added 17 rows, $${total.toFixed(2)}`);
