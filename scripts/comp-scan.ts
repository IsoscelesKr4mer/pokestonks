/** Generic eBay Browse active-listing comp scan. npx tsx scripts/_comp.ts "query" [excludeRegex] */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = findKey(o[kk], k); if (r) return r;
  }
  return undefined;
}
async function appToken() {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const j = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${findKey(cfg, 'EBAY_CLIENT_ID')}:${findKey(cfg, 'EBAY_CLIENT_SECRET')}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  })).json();
  if (!j.access_token) throw new Error('app token failed');
  return j.access_token as string;
}

async function main() {
  const q = process.argv[2];
  const must = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
  const tok = await appToken();
  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=200&filter=${encodeURIComponent('conditions:{NEW}')}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
  const b = await res.json();
  const items = (b.itemSummaries || []) as any[];
  // Drop multi-box lots, cases, singles, breaks.
  const bad = /\bcase\b|lot of|\b\d+\s*x\b|\bx\s*\d+\b|\b(two|three|four|five|six|ten)\b|\b[2-9]\s*(box|boxes|pack|packs)|break|random|psa|cgc|\bcard\b|auto\b.*\/|empty|wrapper/i;
  const rel = items.filter((i) => {
    const t = i.title || '';
    if (bad.test(t)) return false;
    if (must && !must.test(t)) return false;
    return true;
  });
  const rows = rel.map((i) => {
    const p = Number(i.price?.value ?? 0);
    const s = Number(i.shippingOptions?.[0]?.shippingCost?.value ?? 0);
    return { all: p + s, p, s, t: (i.title || '').slice(0, 70) };
  }).sort((a, b) => a.all - b.all);
  console.log(`"${q}"  ${items.length} raw -> ${rows.length} relevant\n`);
  for (const r of rows) console.log(`  $${r.all.toFixed(2)} (${r.p.toFixed(2)} + ${r.s.toFixed(2)}) | ${r.t}`);
  if (rows.length) {
    const v = rows.map((r) => r.all);
    const q1 = v[Math.floor(v.length * 0.25)];
    const med = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    const q3 = v[Math.floor(v.length * 0.75)];
    console.log(`\n  n=${v.length}  low $${v[0].toFixed(2)}  Q1 $${q1.toFixed(2)}  MEDIAN $${med.toFixed(2)}  Q3 $${q3.toFixed(2)}  high $${v[v.length - 1].toFixed(2)}`);
  }
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
