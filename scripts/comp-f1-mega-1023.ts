/**
 * What is a single sealed 2026 Topps Chrome Formula 1 Mega Box asking on eBay?
 *
 * These are ASKS, not sold comps. The product released 2026-10-15 and
 * SportsCardsPro has no page for it yet (all six plausible console slugs miss),
 * so there is no sold-data source to check this against. Treat the output as
 * the ask floor, which a real sale has to come in under.
 *
 * The filters matter more than usual here, because the same query returns
 * blasters, hobby boxes, Logofractor boxes, 20-box cases, multi-box lots and
 * break spots, and every one of those is a different product at a different
 * price. Rejections are counted and printed so a filter that never fires is
 * visible rather than silently assumed to be working.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' });

function fk(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = fk(o[kk], k);
      if (r) return r;
    }
  }
  return undefined;
}

// Must look like the mega box of this release.
const MUST_F1 = /formula\s*(1|one)|\bf1\b/i;
const MUST_MEGA = /\bmega\b/i;
const MUST_2026 = /2026/;

// Any of these means it is not one sealed mega box.
const REJECTS: [string, RegExp][] = [
  // "2 Mega Boxes", "Mega Box (2)", "3 Sealed Boxes" and "2 Topps Chrome..."
  // all survived the first pass of this filter, so plural BOXES, a bare
  // parenthesised count and a leading count are each matched explicitly.
  ['lot/multi', /\blot\b|\bbundle\b|\bx\s*\d+\b|\b\d+\s*(?:x|boxes)\b|\bpair\b|\btwo\b|\bset of\b|\bboxes\b|\(\s*\d+\s*\)|\b\d+\s+sealed\b|^\s*\d\s/i],
  ['case', /\bcase\b|\b20\s*box\b/i],
  ['wrong config', /blaster|hobby|logofractor|value box|\bpack\b|tin\b|hanger|\bcollection\b/i],
  ['break/spot', /\bbreak\b|\bspot\b|\brandom\b|\bripped\b|\bopened\b/i],
  ['single card', /\bauto\b|\brefractor\b|\bverstappen\b|\bhamilton\b|\bnorris\b|\brookie card\b|\bpsa\b|\bbgs\b|\bcgc\b/i],
  ['empty/noise', /empty|wrapper|custom|proxy|replica/i],
];

(async () => {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const tok = (
    await (
      await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${fk(cfg, 'EBAY_CLIENT_ID')}:${fk(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
      })
    ).json()
  ).access_token;

  const search = async (q: string) => {
    const j: any = await (
      await fetch(
        `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200&filter=buyingOptions:{FIXED_PRICE}`,
        { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } }
      )
    ).json();
    return ((j.itemSummaries || []) as any[]).map((i) => ({ p: Number(i.price?.value || 0), t: i.title || '' }));
  };

  const seen = new Map<string, number>();
  for (const q of [
    '2026 Topps Chrome Formula 1 mega box sealed',
    'Topps Chrome F1 2026 mega box',
    'Topps Formula 1 Chrome mega box sealed',
  ]) {
    for (const r of await search(q)) if (r.p > 0) seen.set(r.t, r.p);
    await new Promise((r) => setTimeout(r, 150));
  }

  const rejectCounts: Record<string, number> = {};
  for (const [label] of REJECTS) rejectCounts[label] = 0;
  let notF1 = 0;
  let notMega = 0;
  let not2026 = 0;

  const keep: { p: number; t: string }[] = [];
  for (const [t, p] of seen) {
    if (!MUST_F1.test(t)) { notF1++; continue; }
    if (!MUST_MEGA.test(t)) { notMega++; continue; }
    if (!MUST_2026.test(t)) { not2026++; continue; }
    const hit = REJECTS.find(([, re]) => re.test(t));
    if (hit) { rejectCounts[hit[0]]++; continue; }
    if (p < 40 || p > 400) { rejectCounts['price band'] = (rejectCounts['price band'] || 0) + 1; continue; }
    keep.push({ p, t });
  }
  keep.sort((a, b) => a.p - b.p);

  console.log(`\n${seen.size} distinct titles seen across 3 queries`);
  console.log(`  dropped: not F1 ${notF1}, not mega ${notMega}, not 2026 ${not2026}`);
  for (const [label, n] of Object.entries(rejectCounts)) {
    console.log(`  dropped: ${label} ${n}${n === 0 ? '   <- filter never fired' : ''}`);
  }
  console.log(`\n${keep.length} single sealed mega box asks${keep.length < 5 ? '   THIN' : ''}`);
  if (keep.length) {
    const med = keep[Math.floor(keep.length / 2)].p;
    console.log(`  low $${keep[0].p.toFixed(2)}   median $${med.toFixed(2)}   high $${keep[keep.length - 1].p.toFixed(2)}`);
    console.log('');
    for (const h of keep) console.log(`   $${h.p.toFixed(2).padStart(7)}  ${h.t.slice(0, 72)}`);
  }
})();
