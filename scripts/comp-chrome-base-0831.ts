/**
 * Second pass over the 08-31 drop: the 56 plain base cards.
 *
 * These were skipped in comp-chrome-drop-0831.ts as "a band", which is wrong
 * for this drop. It is thick with 2026 rookies -- Roman Anthony, Konnor
 * Griffin, Nolan McLean, Trey Yesavage -- whose base cards do not trade
 * anywhere near the $0.50-2 a base veteran does.
 *
 * The filter is inverted here: instead of requiring a parallel keyword, every
 * parallel keyword is EXCLUDED, so a "Refractor /150" listing cannot set the
 * price of a plain base card.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose|\bset\b|complete/i;
// anything that makes it not a plain base card
const PARALLEL = /refractor|x-?fractor|logofractor|raywave|ray wave|prism|sapphire|lazer|seam|red white|auto(graph)?|relic|patch|\/\s?\d|\b\d{1,3}\/\d{2,4}\b|gold|orange|purple|aqua|pink|green|blue|negative|superfractor|atomic|speckle|mojo/i;

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
  const rows = readFileSync('data/chrome_drop_0831.tsv', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('back\t'))
    .map((l) => l.split('\t')).filter((r) => r[4] === 'base');

  const uniq = new Map<string, { num: string; player: string; n: number }>();
  for (const r of rows) {
    const e = uniq.get(r[1]);
    if (e) e.n++; else uniq.set(r[1], { num: r[1], player: r[2], n: 1 });
  }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json()).access_token;

  const out: any[] = [];
  for (const c of uniq.values()) {
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(`2026 Topps Chrome ${c.player}`)}&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    const surname = c.player.split(' ').filter((w) => !/^(Jr\.?|II|III)$/i.test(w)).pop()!.replace(/[^A-Za-z]/g, '');
    const hits = ((j.itemSummaries || []) as any[])
      .map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }))
      .filter((x) => x.p > 0.4 && x.p < 500)
      .filter((x) => new RegExp(surname, 'i').test(x.t))
      .filter((x) => /2026/.test(x.t) && /chrome/i.test(x.t))
      .filter((x) => !PARALLEL.test(x.t) && !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    const med = hits.length ? hits[Math.floor(hits.length / 2)].p : null;
    out.push({ ...c, med, n_comps: hits.length, lo: hits[0]?.p ?? null, hi: hits[hits.length - 1]?.p ?? null });
    await new Promise((r) => setTimeout(r, 110));
  }

  out.sort((a, b) => (b.med ?? 0) * b.n - (a.med ?? 0) * a.n);
  for (const o of out) {
    console.log(`  ${String(o.n)}x ${String(o.num).padEnd(6)} ${o.player.padEnd(22)} ` +
      (o.med == null ? 'no clean comps' : `$${o.med.toFixed(2).padStart(7)}  x${o.n} = $${(o.med * o.n).toFixed(2).padStart(7)}  (${o.n_comps} comps $${o.lo.toFixed(2)}-$${o.hi.toFixed(2)})`));
  }
  const t = out.filter((o) => o.med != null).reduce((a, o) => a + o.med * o.n, 0);
  console.log(`\nbase total: $${t.toFixed(2)} across ${out.reduce((a, o) => a + o.n, 0)} cards`);
  writeFileSync('data/chrome_drop_0831_base_comps.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
