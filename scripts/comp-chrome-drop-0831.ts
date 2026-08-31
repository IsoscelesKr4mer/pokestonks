/**
 * Comp the 2026-08-31 Chrome drop. One query per distinct card+parallel, not
 * per card, since the drop has triples.
 *
 * Query WIDE on player + set + parallel keyword, then filter results on the
 * parallel and drop graded/lot listings. Never put the card number in the
 * search string -- most titles omit it and it throttles the result set to zero.
 *
 * Base cards are quoted as a floor, not searched individually: a 2026 Chrome
 * base of a non-star trades in the $0.50-2 band and 56 separate searches would
 * spend a lot of API calls to rediscover that.
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|you pick|choose/i;

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

/** what to type into eBay, and what the title must contain to count */
function plan(par: string): { q: string; must: RegExp } | null {
  if (par === 'base') return null;
  if (par === 'Refractor') return { q: 'refractor', must: /refractor/i };
  if (par.startsWith('Logofractor') || par.includes('Logofractor'))
    return { q: 'logofractor', must: /logofractor/i };
  if (par.startsWith('Wrecking Crew')) return { q: 'wrecking crew green', must: /wrecking/i };
  return { q: par, must: new RegExp(par.split(' ')[0], 'i') };
}

async function main() {
  const rows = readFileSync('data/chrome_drop_0831.tsv', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('back\t'))
    .map((l) => l.split('\t'));

  // collapse duplicates: one comp per distinct card + parallel
  const uniq = new Map<string, { num: string; player: string; par: string; n: number }>();
  for (const r of rows) {
    const k = `${r[1]}|${r[4]}`;
    const e = uniq.get(k);
    if (e) e.n++;
    else uniq.set(k, { num: r[1], player: r[2], par: r[4], n: 1 });
  }

  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const basic = Buffer.from(`${find(cfg, 'EBAY_CLIENT_ID')}:${find(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64');
  const tok = (await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json()).access_token;

  const search = async (q: string) => {
    const u = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200`;
    const j: any = await (await fetch(u, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } })).json();
    return ((j.itemSummaries || []) as any[]).map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }));
  };

  const out: any[] = [];
  for (const c of uniq.values()) {
    const pl = plan(c.par);
    if (!pl) { out.push({ ...c, med: null, n_comps: 0, note: 'base, priced as a band' }); continue; }
    const surname = c.player.split(' ').filter((w) => !/^(Jr\.?|II|III)$/i.test(w)).pop()!;
    const hits = (await search(`2026 Topps Chrome ${c.player} ${pl.q}`))
      .filter((x) => x.p > 0.5 && x.p < 4000)
      .filter((x) => new RegExp(surname.replace(/[^A-Za-z]/g, ''), 'i').test(x.t))
      .filter((x) => pl.must.test(x.t))
      .filter((x) => !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    const med = hits.length ? hits[Math.floor(hits.length / 2)].p : null;
    out.push({ ...c, med, n_comps: hits.length, lo: hits[0]?.p ?? null, hi: hits[hits.length - 1]?.p ?? null });
    await new Promise((r) => setTimeout(r, 110));
  }

  out.sort((a, b) => (b.med ?? 0) * b.n - (a.med ?? 0) * a.n);
  const line = (o: any) =>
    `${String(o.n)}x ${String(o.num).padEnd(7)} ${o.player.padEnd(22)} ${o.par.padEnd(38)} ` +
    (o.med == null ? '  (base)' : `$${o.med.toFixed(2).padStart(8)}  x${o.n} = $${(o.med * o.n).toFixed(2).padStart(8)}  (${o.n_comps} comps $${o.lo?.toFixed(2)}-$${o.hi?.toFixed(2)})`);
  console.log('distinct card+parallel:', uniq.size, '\n');
  for (const o of out) console.log('  ' + line(o));
  const priced = out.filter((o) => o.med != null);
  const total = priced.reduce((a, o) => a + o.med * o.n, 0);
  const baseCount = out.filter((o) => o.med == null).reduce((a, o) => a + o.n, 0);
  console.log(`\nnon-base total: $${total.toFixed(2)} across ${priced.reduce((a, o) => a + o.n, 0)} cards`);
  console.log(`base: ${baseCount} cards, not individually comped`);
  writeFileSync('data/chrome_drop_0831_comps.json', JSON.stringify(out, null, 1));
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
