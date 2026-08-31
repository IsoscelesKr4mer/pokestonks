/**
 * Fold the comps into the 08-31 review page, and correct the two cards that
 * were still unresolved when the page was first published:
 *   IMG_2612 "?" / "CARD SHIFTED IN FRAME" -> #272 Daniel Schneemann, Refractor
 *   IMG_2614 "?" Chase Dollander           -> #277
 * Both read fine at half resolution. The crop was aimed at the wrong corner.
 *
 * Prices are the median ACTIVE ASK, graded and lot listings excluded. Asks run
 * above sales, so these are a ceiling to price down from, not a valuation.
 */
import { readFileSync, writeFileSync } from 'fs';

type Comp = { num: string; player: string; par?: string; med: number | null; n_comps: number; lo: number | null; hi: number | null };

const nonBase: Comp[] = JSON.parse(readFileSync('data/chrome_drop_0831_comps.json', 'utf8'));
const base: Comp[] = JSON.parse(readFileSync('data/chrome_drop_0831_base_comps.json', 'utf8'));

const px = new Map<string, Comp>();
for (const c of nonBase) px.set(`${c.num}|${c.par}`, c);
for (const c of base) px.set(`${c.num}|base`, c);

let html = readFileSync('eBay_assets/chrome_drop_0831_review.html', 'utf8');

// --- the two late corrections -------------------------------------------
html = html
  .replace(/<b>\?<\/b> CARD SHIFTED IN FRAME - needs wider crop/, '<b>272</b> Daniel Schneemann')
  .replace(/alt="CARD SHIFTED IN FRAME - needs wider crop"/, 'alt="Daniel Schneemann"')
  .replace(/<b>\?<\/b> Chase Dollander/, '<b>277</b> Chase Dollander');
// the shifted row had no team; give it one, matching its neighbours
html = html.replace(/(<b>272<\/b> Daniel Schneemann)<span class="tm"><\/span>/, '$1<span class="tm">Cleveland Guardians</span>');

// --- price chip on every card -------------------------------------------
let hit = 0, miss: string[] = [];
html = html.replace(
  /<b>([^<]+)<\/b> ([^<]+?)<span class="tm">([^<]*)<\/span><span class="pl">([^<]*)<\/span>/g,
  (m, num, player, team, par) => {
    const c = px.get(`${num}|${par}`);
    if (!c || c.med == null) { miss.push(`${num} ${player} (${par})`); return m; }
    hit++;
    const tier = c.med >= 15 ? ' hi' : c.med >= 5 ? ' mid' : '';
    return m + `<span class="px${tier}">$${c.med.toFixed(2)}` +
      `<i>${c.n_comps} asks &middot; $${c.lo!.toFixed(2)}&ndash;$${c.hi!.toFixed(2)}</i></span>`;
  },
);

// --- styles for the chip -------------------------------------------------
html = html.replace('</style>', `  .px{font-family:"JetBrains Mono",monospace;font-size:.86rem;font-weight:600;
    color:var(--ink);margin-top:.35rem;padding-top:.35rem;border-top:1px solid var(--rule);
    display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap}
  .px.mid{color:var(--accent)}
  .px.hi{color:var(--accent)}
  .px.hi::before{content:"";width:5px;height:5px;border-radius:50%;
    background:var(--accent);flex:none;align-self:center}
  .px i{font-style:normal;font-size:.58rem;font-weight:400;color:var(--faint);
    letter-spacing:.01em}
  .money{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.7rem;
    font-family:"JetBrains Mono",monospace;font-size:.74rem}
  .money span{background:var(--wash);border:1px solid var(--rule);border-radius:100px;
    padding:.3rem .7rem;color:var(--soft)}
  .money b{color:var(--accent)}
</style>`);

// --- money row under the tally ------------------------------------------
const sum = (cs: Comp[], rows: string[][]) =>
  rows.reduce((a, r) => {
    const c = px.get(`${r[1]}|${r[4]}`);
    return a + (c?.med ?? 0);
  }, 0);
const rows = readFileSync('data/chrome_drop_0831.tsv', 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && !l.startsWith('back\t')).map((l) => l.split('\t'));
const baseRows = rows.filter((r) => r[4] === 'base');
const parRows = rows.filter((r) => r[4] !== 'base');
const tBase = sum(base, baseRows), tPar = sum(nonBase, parRows);

html = html.replace('</div>\n  </header>', `</div>
    <div class="money">
      <span>parallels <b>$${tPar.toFixed(2)}</b></span>
      <span>base <b>$${tBase.toFixed(2)}</b></span>
      <span>all 113 <b>$${(tBase + tPar).toFixed(2)}</b></span>
      <span>median active ask, graded excluded</span>
    </div>
  </header>`);

html = html.replace(
  '<p>The <strong>base</strong> section',
  `<p><strong>What the prices are.</strong> Each card carries the median asking price of the live raw listings for that exact player and parallel, with the spread and the comp count under it. Asks sit above sales, so treat these as the top of the range, not a valuation. Cards over $15 are dotted.</p>
    <p>The <strong>base</strong> section`);

html = html.replace('<span>data/chrome_drop_0831.tsv</span>',
  `<span>priced ${hit}/113 &middot; data/chrome_drop_0831.tsv</span>`);

writeFileSync('eBay_assets/chrome_drop_0831_review.html', html);
console.log(`priced ${hit}/113`);
if (miss.length) console.log('no price:', miss.join(', '));
console.log(`parallels $${tPar.toFixed(2)} + base $${tBase.toFixed(2)} = $${(tBase + tPar).toFixed(2)}`);
