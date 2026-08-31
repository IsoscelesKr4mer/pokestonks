/**
 * Full catalogue audit page: every card in baseball_cards, grouped by type,
 * with listed and unlisted shown side by side.
 *
 * Thumbnails point at the Supabase URLs rather than being inlined as data
 * URIs. The 113-card review page inlined them because it was published as an
 * artifact first, where the CSP blocks external hosts; this page only ever
 * lives on GitHub Pages, which loads them fine. 441 cards inlined would have
 * been a ~6MB page.
 *
 *   npx tsx scripts/build-catalog-audit-0831.ts
 */
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Which bucket a card belongs to. Order matters: specific before generic. */
function bucket(setName: string, parallel: string): string {
  const p = parallel || '';
  const insert = setName.match(/\(([^)]+?) insert\)/i);
  if (/auto/i.test(p) || /autograph/i.test(setName)) return 'Autographs';
  // set_name already carries the checklist's own casing, so use it verbatim.
  // Title-casing it turned "Past to Present" into "Past To Present" and
  // "World's Finest" into "World'S Finest".
  if (insert) return insert[1];
  if (/sapphire/i.test(setName) || /sapphire/i.test(p)) return 'Sapphire';
  if (/\d\s?\/\s?\d/.test(p) || /\/\s?\d/.test(p)) return 'Serial numbered';
  if (/x-?fractor/i.test(p)) return 'X-Fractor';
  if (/mojo/i.test(p)) return 'Mojo Refractor';
  if (/raywave|lazer|prism|seams|red white|mini.?diamond|logofractor/i.test(p)) return 'Specialty Refractors';
  if (/refractor/i.test(p)) return 'Refractor';
  if (/^base/i.test(p)) return 'Base';
  if (/insert/i.test(p)) return 'Inserts (other)';
  if (/variation|\bssp\b|\bsp\b/i.test(p)) return 'Short prints & variations';
  return 'Unclassified';
}

// Fixed order for the non-insert buckets; inserts fall in after, by size.
const ORDER = ['Base', 'Refractor', 'X-Fractor', 'Mojo Refractor', 'Specialty Refractors',
  'Sapphire', 'Serial numbered', 'Autographs'];

async function main() {
  const rows: any = await sql`
    SELECT id, player, set_name, year, card_number, parallel, status, for_sale,
           asking_price_cents ask, sold_price_cents sold, ebay_item_id, notes, comp_note,
           photo_urls
    FROM baseball_cards
    ORDER BY player, set_name, card_number`;

  const live = rows.filter((r: any) => !(Number(r.sold) > 0));
  const sold = rows.filter((r: any) => Number(r.sold) > 0);

  const groups = new Map<string, any[]>();
  for (const r of live) {
    const b = bucket(r.set_name || '', r.parallel || '');
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(r);
  }

  const names = [...groups.keys()].sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return groups.get(b)!.length - groups.get(a)!.length;
  });

  const isListed = (r: any) => r.status === 'listed';
  // "Not listed" is two different things and conflating them made the first
  // version of this page read a deliberate decision as a backlog: 41 of the 52
  // unlisted are PC keepers, and their notes say so.
  const isPC = (r: any) => !isListed(r) && /\bkeeper\b|\bPC\b/i.test(r.notes || '');
  // A price taken from one active ask is one seller's opinion, not a market.
  // Nine cards carried these, worth $4,318 on paper and about $560 in reality.
  const oneAsk = (r: any) => /^[1-3] active comp/.test(r.comp_note || '');
  const nUnlisted = live.filter((r: any) => !isListed(r)).length;
  const nListed = live.filter(isListed).length;
  const askTotal = live.filter(isListed).reduce((a: number, r: any) => a + Number(r.ask || 0), 0);
  const soldTotal = sold.reduce((a: number, r: any) => a + Number(r.sold || 0), 0);
  const noPhoto = live.filter((r: any) => !r.photo_urls || (r.photo_urls as any[]).length === 0).length;

  // The headline of this audit is not the total, it is where the unlisted
  // value sits. Computed, never hardcoded, so it stays true on a rebuild.
  const unlisted = live.filter((r: any) => !isListed(r));
  const pcKeepers = live.filter(isPC);
  const nPC = pcKeepers.length;
  const forSaleGap = unlisted.filter((r: any) => !isPC(r));
  const unpriced = unlisted.filter((r: any) => r.ask == null).length;
  const thinPriced = live.filter((r: any) => r.ask != null && oneAsk(r));
  const thinAsk = thinPriced.reduce((a: number, r: any) => a + Number(r.ask || 0), 0);
  const noNum = live.filter((r: any) => !r.card_number).length;

  const tile = (r: any) => {
    const url = (r.photo_urls as any[] | null)?.[0];
    const listed = isListed(r);
    const pc = isPC(r);
    const thin = oneAsk(r);
    const price = r.ask ? `$${(Number(r.ask) / 100).toFixed(2)}` : '';
    const kind = listed ? 'l' : pc ? 'p' : 'u';
    return `<figure class="c${listed ? '' : pc ? ' pc' : ' un'}" data-s="${kind}">` +
      (url ? `<img src="${esc(url)}" alt="${esc(r.player)}" loading="lazy" decoding="async">`
           : `<div class="noimg">no photo</div>`) +
      `<figcaption><b>${esc(r.card_number ?? '?')}</b> ${esc(r.player)}` +
      `<span class="st">${esc((r.set_name || '').replace(/^(20\d\d) /, ''))}</span>` +
      `<span class="pl">${esc(r.parallel || '-')}</span>` +
      `<span class="row"><span class="tag ${listed ? 'on' : pc ? 'pc' : 'off'}">${listed ? 'listed' : pc ? 'PC keeper' : (r.status || 'not listed')}</span>` +
      (price ? `<span class="px${thin ? ' thin' : ''}" ${thin ? 'title="priced off fewer than 4 active asks"' : ''}>${price}${thin ? '<i>?</i>' : ''}</span>` : '') + `</span>` +
      `</figcaption></figure>`;
  };

  const sections = names.map((n) => {
    const g = groups.get(n)!;
    // Unlisted first: that is the part of the catalogue that needs a decision.
    const sorted = [...g].sort((a, b) => (isListed(a) ? 1 : 0) - (isListed(b) ? 1 : 0) ||
      String(a.player).localeCompare(String(b.player)));
    const u = g.filter((r) => !isListed(r) && !isPC(r)).length;
    const p = g.filter(isPC).length;
    const bits = [u ? `${u} not listed` : '', p ? `${p} PC` : ''].filter(Boolean).join(' &middot; ');
    return `<section data-g="${esc(n)}"><h2>${esc(n)}<span class="n">${g.length}</span>` +
      (bits ? `<span class="lab${u ? ' warn' : ''}">${bits}</span>` : `<span class="lab">all listed</span>`) +
      `</h2><div class="grid">${sorted.map(tile).join('')}</div></section>`;
  }).join('\n');

  const soldRows = sold.sort((a: any, b: any) => Number(b.sold) - Number(a.sold)).map((r: any) =>
    `<tr><td class="k">${esc(r.card_number ?? '?')}</td><td>${esc(r.player)}</td>` +
    `<td class="q">${esc((r.set_name || '').replace(/^(20\d\d) /, ''))}</td>` +
    `<td class="q">${esc(r.parallel || '-')}</td>` +
    `<td class="v">$${(Number(r.sold) / 100).toFixed(2)}</td></tr>`).join('');

  const html = `<title>Card Catalogue Audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Sans:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
  :root{
    --paper:#f2f4f3; --card:#ffffff; --ink:#161c22; --soft:#5b6b76; --faint:#8a99a3;
    --rule:#dde3df; --accent:#8a3324; --wash:#f6ece9; --warn:#8a6d10; --warnwash:#f7f0dc;
  }
  @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
    --paper:#0f1418; --card:#171f26; --ink:#e8eeeb; --soft:#a5b3bb; --faint:#75858f;
    --rule:#28333b; --accent:#e0836c; --wash:#2a1a16; --warn:#d6ad3f; --warnwash:#2b2412;
  }}
  :root[data-theme="dark"]{
    --paper:#0f1418; --card:#171f26; --ink:#e8eeeb; --soft:#a5b3bb; --faint:#75858f;
    --rule:#28333b; --accent:#e0836c; --wash:#2a1a16; --warn:#d6ad3f; --warnwash:#2b2412;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);
    font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:15px;line-height:1.5;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:82rem;margin:0 auto;padding:0 1.25rem 5rem}
  header.top{padding:3rem 0 1.25rem;border-bottom:2px solid var(--ink);margin-bottom:1.5rem}
  .kick{font-family:"JetBrains Mono",monospace;font-size:.7rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--accent);margin:0 0 .9rem}
  h1{font-family:Archivo,sans-serif;font-weight:700;font-size:clamp(1.9rem,4.5vw,2.9rem);
    letter-spacing:-.022em;line-height:1.05;margin:0 0 .7rem;text-wrap:balance}
  .lede{color:var(--soft);max-width:60ch;margin:0}
  .tally{display:flex;flex-wrap:wrap;gap:.4rem;margin-top:1.4rem;
    font-family:"JetBrains Mono",monospace;font-size:.74rem}
  .tally span{background:var(--card);border:1px solid var(--rule);border-radius:100px;
    padding:.3rem .7rem;color:var(--soft)}
  .tally b{color:var(--ink)}
  .tally .hot{background:var(--warnwash);border-color:var(--warn)}
  .tally .hot b{color:var(--warn)}
  .c.pc{border-color:var(--rule);opacity:.92}
  .tag.pc{color:var(--soft);border-color:var(--soft)}
  .px.thin{color:var(--warn)}
  .px.thin i{font-style:normal;font-weight:700;margin-left:.15rem}
  .note{background:var(--warnwash);border-left:3px solid var(--warn);padding:.95rem 1.15rem;
    border-radius:0 5px 5px 0;margin:0 0 1.5rem;font-size:.9rem}
  .note p{margin:0 0 .5rem}.note p:last-child{margin:0}
  .bar{position:sticky;top:0;z-index:5;background:var(--paper);padding:.7rem 0;
    border-bottom:1px solid var(--rule);margin-bottom:2rem;display:flex;gap:.4rem;flex-wrap:wrap;
    align-items:center}
  .bar button{font-family:"JetBrains Mono",monospace;font-size:.7rem;letter-spacing:.06em;
    text-transform:uppercase;background:var(--card);color:var(--soft);cursor:pointer;
    border:1px solid var(--rule);border-radius:100px;padding:.4rem .85rem}
  .bar button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  .bar button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .bar .hint{font-size:.72rem;color:var(--faint);margin-left:auto}
  section{margin:0 0 2.6rem}
  section[hidden]{display:none}
  h2{font-family:Archivo,sans-serif;font-weight:600;font-size:1.3rem;letter-spacing:-.01em;
    margin:0 0 .9rem;padding-bottom:.5rem;border-bottom:1px solid var(--rule);
    display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
  h2 .n{font-family:"JetBrains Mono",monospace;font-size:.78rem;font-weight:600;
    color:var(--accent);background:var(--wash);border-radius:100px;padding:.15rem .55rem}
  h2 .lab{font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--faint);margin-left:auto}
  h2 .lab.warn{color:var(--warn)}
  .grid{display:grid;gap:.8rem;grid-template-columns:repeat(auto-fill,minmax(142px,1fr))}
  .c{margin:0;background:var(--card);border:1px solid var(--rule);border-radius:7px;
    overflow:hidden;display:flex;flex-direction:column}
  .c.un{border-color:var(--warn)}
  .c[hidden]{display:none}
  .c img{width:100%;aspect-ratio:5/7;object-fit:cover;display:block;background:#0c1013}
  .noimg{width:100%;aspect-ratio:5/7;display:flex;align-items:center;justify-content:center;
    background:var(--wash);color:var(--faint);font-family:"JetBrains Mono",monospace;font-size:.62rem}
  figcaption{padding:.5rem .55rem .6rem;font-size:.76rem;line-height:1.35;
    display:flex;flex-direction:column;gap:.1rem}
  figcaption b{font-family:"JetBrains Mono",monospace;font-size:.7rem;color:var(--accent);
    margin-right:.3rem}
  .st{color:var(--faint);font-size:.66rem;margin-top:.15rem}
  .pl{color:var(--soft);font-size:.68rem}
  .row{display:flex;align-items:center;gap:.35rem;margin-top:.35rem;flex-wrap:wrap}
  .tag{font-family:"JetBrains Mono",monospace;font-size:.55rem;letter-spacing:.08em;
    text-transform:uppercase;border-radius:100px;padding:.14rem .45rem;border:1px solid}
  .tag.on{color:var(--faint);border-color:var(--rule)}
  .tag.off{color:var(--warn);border-color:var(--warn);background:var(--warnwash)}
  .px{font-family:"JetBrains Mono",monospace;font-size:.72rem;font-weight:600;
    margin-left:auto;font-variant-numeric:tabular-nums}
  .tw{overflow-x:auto}
  table{border-collapse:collapse;width:100%;font-size:.82rem;min-width:520px}
  th{text-align:left;font-family:"JetBrains Mono",monospace;font-size:.62rem;letter-spacing:.12em;
    text-transform:uppercase;color:var(--faint);padding:0 .7rem .5rem 0;
    border-bottom:1px solid var(--rule);white-space:nowrap}
  td{padding:.45rem .7rem .45rem 0;border-bottom:1px solid var(--rule);vertical-align:baseline}
  td.k{font-family:"JetBrains Mono",monospace;font-size:.72rem;color:var(--accent);white-space:nowrap}
  td.q{color:var(--soft)}
  td.v{font-family:"JetBrains Mono",monospace;font-weight:600;text-align:right;
    font-variant-numeric:tabular-nums;white-space:nowrap}
  footer{margin-top:3rem;padding-top:1.2rem;border-top:2px solid var(--ink);
    font-family:"JetBrains Mono",monospace;font-size:.7rem;color:var(--faint);
    display:flex;flex-wrap:wrap;gap:.4rem 1.4rem;justify-content:space-between}
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<div class="wrap">
<header class="top">
  <p class="kick">Inventory audit &middot; ${new Date().toISOString().slice(0, 10)}</p>
  <h1>Card Catalogue Audit</h1>
  <p class="lede">Every card in the vault, grouped by type, with listed and unlisted side by side. Unlisted cards carry a gold border, so the gaps read at a glance.</p>
  <div class="tally">
    <span><b>${live.length}</b> cards held</span>
    <span><b>${nListed}</b> listed</span>
    <span class="hot"><b>${forSaleGap.length}</b> not listed</span>
    <span><b>${nPC}</b> PC keepers</span>
    <span>asks <b>$${(askTotal / 100).toFixed(2)}</b></span>
    <span><b>${sold.length}</b> sold &middot; $${(soldTotal / 100).toFixed(2)}</span>
    ${noPhoto ? `<span class="hot"><b>${noPhoto}</b> no photo</span>` : ''}
  </div>
</header>
<div class="note">
  <p><strong>Read the prices with care.</strong> ${thinPriced.length} cards carry a price taken from fewer than four active asks, $${(thinAsk / 100).toFixed(2)} between them. One was a Kade Anderson booked at $1,500 off a single seller&rsquo;s ask; it really trades near $75. Each is marked <strong>?</strong> and none should be trusted without a fresh look.</p>
  <p><strong>Not listed is two different things.</strong> ${nPC} of the ${nUnlisted} unlisted cards are <strong>PC keepers</strong>, held on purpose rather than waiting on a listing. Only <strong>${forSaleGap.length}</strong> are a genuine gap.</p>
  <p>${unpriced} unlisted cards have no price at all${noNum ? `, and ${noNum} cards in the catalogue have no card number` : ''}. Those are the data gaps worth closing.</p>
</div>
<div class="bar">
  <button data-f="all" aria-pressed="true">All ${live.length}</button>
  <button data-f="u" aria-pressed="false">Not listed ${forSaleGap.length}</button>
  <button data-f="p" aria-pressed="false">PC ${nPC}</button>
  <button data-f="l" aria-pressed="false">Listed ${nListed}</button>
  <span class="hint">${names.length} groups</span>
</div>
${sections}
<section><h2>Sold<span class="n">${sold.length}</span><span class="lab">out of inventory</span></h2>
<div class="tw"><table><thead><tr><th>#</th><th>Player</th><th>Set</th><th>Parallel</th><th>Sold</th></tr></thead>
<tbody>${soldRows}</tbody>
<tfoot><tr><td colspan="4">${sold.length} cards</td><td class="v">$${(soldTotal / 100).toFixed(2)}</td></tr></tfoot>
</table></div></section>
<footer><span>${rows.length} rows &middot; baseball_cards</span><span>asking prices, not comps</span></footer>
</div>
<script>
(function(){
  var btns=[].slice.call(document.querySelectorAll('.bar button'));
  btns.forEach(function(b){
    b.addEventListener('click',function(){
      var f=b.dataset.f;
      btns.forEach(function(o){o.setAttribute('aria-pressed',String(o===b));});
      [].forEach.call(document.querySelectorAll('figure.c'),function(c){
        c.hidden = (f!=='all' && c.dataset.s!==f);
      });
      // Hide a whole group once the filter empties it.
      [].forEach.call(document.querySelectorAll('section[data-g]'),function(s){
        s.hidden = !s.querySelector('figure.c:not([hidden])');
      });
    });
  });
})();
</script>`;

  writeFileSync('eBay_assets/catalog_audit.html', html);
  console.log(`${live.length} held, ${nListed} listed, ${nUnlisted} NOT listed, ${sold.length} sold`);
  console.log(`groups: ${names.map((n) => `${n} ${groups.get(n)!.length}`).join(' | ')}`);
  const unclass = groups.get('Unclassified') || [];
  if (unclass.length) console.log('UNCLASSIFIED:', unclass.map((r: any) => `${r.player} "${r.parallel}"`).join(', '));
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 700)); process.exit(1); });
