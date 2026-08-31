/**
 * Comp the 2026-08-31 Chrome drop. One query per distinct card+parallel.
 *
 * Query WIDE on player + set + parallel keyword, then filter the results down.
 * Never put the card number in the search string -- most titles omit it and it
 * throttles the result set to zero.
 *
 * CORRECTED 2026-08-31. The first run priced the plain Parker Messick
 * Logofractor at $45.00. Michael sent a screenshot of the actual search:
 * $1.99, $3.50, $7.95. The filter required the parallel word but excluded
 * nothing, so a "Logofractor Rookie Autographs #RA-PM" at $45 and a "Red
 * Logofractor /5" at $499 both counted as comps for a plain Logofractor. 53
 * hits, everything above $10 an auto or a serial-numbered colour, and the
 * median landed on an autograph.
 *
 * So every non-base call now carries an explicit `not`. Two traps in writing
 * those. A bare colour word cannot be excluded, because "Blue Jays", "Red Sox"
 * and "White Sox" are teams -- the colour only counts when bound to
 * fractor/refractor. And a serial has two shapes in the wild, "/150" and
 * "054/150".
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose|complete set/i;

const AUTO = /\bautos?\b|autograph|signed|on.?card|\bRA-|\bIS-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
// A colour only counts as a parallel when bound to fractor/refractor, so team
// names (Blue Jays, Red Sox, White Sox) do not trip it.
const COLOUR = /\b(gold|blue|pink|green|orange|purple|red|black|aqua|sepia|bronze|silver|teal|yellow|magenta|white)\s*-?\s*(logo)?(x-?)?fractor|\b(gold|blue|pink|green|orange|purple|red|black|aqua)\s+refractor/i;
// Designs that are not a plain Refractor.
const DESIGN = /logofractor|x-?fractor|raywave|ray wave|prism|seams?\b|red white|lazer|negative|superfractor|atomic|speckle|mojo/i;
const INSERT = /wrecking|future star|perspective|big ticket|rivals|1991|static noise|diamond moment/i;

const any = (...rs: RegExp[]) => new RegExp(rs.map((r) => r.source).join('|'), 'i');
const all = (...rs: RegExp[]) => ({ test: (s: string) => rs.every((r) => r.test(s)) });

type Plan = { q: string; must: { test(s: string): boolean }; not: RegExp };

function plan(par: string): Plan | null {
  if (par === 'base') return null;

  if (par === 'Refractor')
    return { q: 'refractor', must: /refractor/i, not: any(DESIGN, COLOUR, SERIAL, AUTO, INSERT) };

  if (par === 'Logofractor')
    return { q: 'logofractor', must: /logofractor/i, not: any(COLOUR, SERIAL, AUTO, INSERT) };

  const inserts: [RegExp, RegExp, string][] = [
    [/Wrecking Crew insert/, /wrecking/i, 'wrecking crew logofractor'],
    [/Future Stars insert/, /future star/i, 'future stars logofractor'],
    [/Perspectives insert/, /perspective/i, 'perspectives logofractor'],
    [/Big Ticket Players insert/, /big ticket/i, 'big ticket players logofractor'],
  ];
  for (const [tag, must, q] of inserts)
    if (tag.test(par)) return { q, must: all(must, /logofractor/i), not: any(COLOUR, SERIAL, AUTO) };

  // Numbered colour parallels: REQUIRE both the colour and the run size.
  const m = par.match(/\b(Gold|Blue|Pink|Green|Orange|Purple|Red|Black)\b/i);
  const run = par.match(/\/\s?(\d{1,4})/);
  if (m && run) {
    const wrecking = /Wrecking Crew/i.test(par);
    return {
      q: `${m[1]} ${wrecking ? 'wrecking crew' : 'logofractor'} ${run[1]}`,
      // Match just the run size after the slash. An earlier `\b\d{0,3}\s?/`
      // prefix never matched a bare "/50", because there is no word boundary
      // before the slash, and that alone lost every comp for the Valera Gold.
      // "/50" cannot match "/150": the character after the slash differs.
      must: all(new RegExp(`\\b${m[1]}\\b`, 'i'),
        new RegExp(`/\\s?${run[1]}\\b`),
        wrecking ? /wrecking/i : /logofractor/i),
      not: AUTO,
    };
  }
  return { q: par, must: new RegExp(par.split(' ')[0], 'i'), not: AUTO };
}

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
    .map((l) => l.split('\t'));

  const uniq = new Map<string, { num: string; player: string; par: string; n: number }>();
  for (const r of rows) {
    const k = `${r[1]}|${r[4]}`;
    const e = uniq.get(k);
    if (e) e.n++; else uniq.set(k, { num: r[1], player: r[2], par: r[4], n: 1 });
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
    const pl = plan(c.par);
    if (!pl) { out.push({ ...c, med: null, n_comps: 0 }); continue; }
    const surname = c.player.split(' ').filter((w) => !/^(Jr\.?|II|III)$/i.test(w)).pop()!.replace(/[^A-Za-z]/g, '');
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(`2026 Topps Chrome ${c.player} ${pl.q}`)}&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    const hits = ((j.itemSummaries || []) as any[])
      .map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }))
      .filter((x) => x.p > 0.5 && x.p < 4000)
      .filter((x) => new RegExp(surname, 'i').test(x.t))
      // The base pass required these and this one did not, so Bowman Chrome
      // and other-year listings were free to set parallel medians.
      .filter((x) => /2026/.test(x.t) && /chrome/i.test(x.t))
      .filter((x) => pl.must.test(x.t))
      .filter((x) => !pl.not.test(x.t))
      .filter((x) => !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    const med = hits.length ? hits[Math.floor(hits.length / 2)].p : null;
    out.push({ ...c, med, n_comps: hits.length, lo: hits[0]?.p ?? null, hi: hits[hits.length - 1]?.p ?? null });
    await new Promise((r) => setTimeout(r, 110));
  }

  out.sort((a, b) => (b.med ?? 0) * b.n - (a.med ?? 0) * a.n);
  for (const o of out) {
    if (o.par === 'base') continue;
    console.log(`  ${o.n}x ${String(o.num).padEnd(7)} ${o.player.padEnd(22)} ${o.par.padEnd(38)} ` +
      (o.med == null ? 'NO COMPS' : `$${o.med.toFixed(2).padStart(7)} x${o.n} = $${(o.med * o.n).toFixed(2).padStart(7)}  (${o.n_comps} asks $${o.lo.toFixed(2)}-$${o.hi.toFixed(2)})`));
  }
  const priced = out.filter((o) => o.med != null);
  console.log(`\nnon-base total: $${priced.reduce((a, o) => a + o.med * o.n, 0).toFixed(2)} across ${priced.reduce((a, o) => a + o.n, 0)} cards`);
  const thin = priced.filter((o) => o.n_comps < 4);
  if (thin.length) console.log(`thin (<4 asks): ${thin.map((o) => `${o.num} ${o.player} ${o.n_comps}`).join(', ')}`);
  const none = out.filter((o) => o.par !== 'base' && o.med == null);
  if (none.length) console.log(`NO COMPS: ${none.map((o) => `${o.num} ${o.player} (${o.par})`).join(', ')}`);
  writeFileSync('data/chrome_drop_0831_comps.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
