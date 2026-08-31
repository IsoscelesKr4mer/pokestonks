/**
 * Price the 2026-08-30 drop. Cova is PC and deliberately absent.
 *
 * Query WIDE on player plus set, then filter the results on the card number and
 * the parallel keyword. Putting the number in the search string throttles it to
 * near zero, because most seller titles do not carry it.
 *
 * Graded listings are excluded: raw-vs-slabbed is a different market and mixing
 * them inflates every median.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
config({ path: '.env.local' }); config({ path: '.env' });

type Card = { id: string; player: string; q: string; must: RegExp; not?: RegExp };

const CARDS: Card[] = [
  { id: '#1 base',            player: 'Shohei Ohtani',     q: '2026 Topps Chrome Shohei Ohtani base',        must: /ohtani/i, not: /refractor|x-?fractor|auto|raywave|logofractor|prism|sapphire|\/\d|psa|bgs|sgc|cgc|lot/i },
  { id: '#3 RayWave',         player: 'Yordan Alvarez',    q: '2026 Topps Chrome Yordan Alvarez raywave',    must: /raywave|ray wave/i },
  { id: '#62 Seams',          player: 'Luis Castillo',     q: '2026 Topps Chrome Luis Castillo refractor',   must: /seam/i },
  { id: '#99 RWB',            player: 'Ketel Marte',       q: '2026 Topps Chrome Ketel Marte refractor',     must: /red white|rwb|white.*blue/i },
  { id: '#164 RayWave',       player: 'Jeff McNeil',       q: '2026 Topps Chrome Jeff McNeil refractor',     must: /raywave|ray wave/i },
  { id: '#272 RWB',           player: 'Daniel Schneemann', q: '2026 Topps Chrome Daniel Schneemann',         must: /red white|rwb|white.*blue/i },
  { id: '#296 Seams',         player: 'Chris Sale',        q: '2026 Topps Chrome Chris Sale refractor',      must: /seam/i },
  { id: 'WC-1 Wrecking Crew', player: 'Aaron Judge',       q: '2026 Topps Chrome Aaron Judge Wrecking Crew', must: /wrecking/i },
  { id: 'WC-8 Wrecking Crew', player: 'Giancarlo Stanton', q: '2026 Topps Chrome Stanton Wrecking Crew',     must: /wrecking/i },
  { id: '91CB-3 1991 Topps',  player: 'Bryce Harper',      q: '2026 Topps Chrome Bryce Harper 1991',         must: /1991|91cb/i },
  { id: '91CB-4 1991 Topps',  player: 'Cal Raleigh',       q: '2026 Topps Chrome Cal Raleigh 1991',          must: /1991|91cb/i },
  { id: '91CB-21 1991 Topps', player: 'Sal Stewart',       q: '2026 Topps Chrome Sal Stewart 1991',          must: /1991|91cb/i },
  { id: 'RVA-8 Rivals',       player: 'David Wright',      q: '2026 Topps Chrome David Wright Rivals',       must: /rival/i },
  { id: 'RVA-20 Rivals',      player: 'Jarren Duran',      q: '2026 Topps Chrome Jarren Duran Rivals',       must: /rival/i },
  { id: 'FS-4 Future Stars',  player: 'Samuel Basallo',    q: '2026 Topps Chrome Samuel Basallo Future Stars', must: /future star/i },
  { id: 'BTP-5 Big Ticket',   player: 'Elly De La Cruz',   q: '2026 Topps Chrome Elly De La Cruz Big Ticket', must: /big ticket/i },
  { id: 'BTP-11 Big Ticket',  player: 'Juan Soto',         q: '2026 Topps Chrome Juan Soto Big Ticket',       must: /big ticket/i },
];

const GRADED = /psa|bgs|sgc|cgc|\bgem\b|graded|slab/i;
const NOISE = /\blot\b|break|random|reprint|custom|digital|proxy|\bcase\b|complete set/i;

// CORRECTED 2026-08-31, the same bug Michael caught in the 113-card run:
// requiring the parallel word while excluding nothing let autographs and
// serial-numbered colour parallels set the medians. A plain insert is not
// comped by its own /25 auto. Colour is excluded only when bound to
// fractor/refractor, so the Blue Jays and the Red Sox survive the filter.
const AUTO = /\bautos?\b|autograph|signed|on.?card|\bRA-|\bIS-/i;
const SERIAL = /\/\s?\d{1,4}\b|\b\d{1,3}\s?\/\s?\d{1,4}\b/;
const COLOUR = /\b(gold|blue|pink|green|orange|purple|red|black|aqua|sepia|bronze|silver|teal|yellow|magenta|white)\s*-?\s*(logo)?(x-?)?fractor|\b(gold|blue|pink|green|orange|purple|red|black|aqua)\s+refractor/i;
const EXCLUDE = new RegExp([AUTO, SERIAL, COLOUR].map((r) => r.source).join('|'), 'i');
// Red White & Blue IS a colour parallel, so the colour rule has to stand down
// for those two cards or it excludes the very listings being looked for. It
// dropped Schneemann to zero comps and Marte to one before this exemption.
const NO_COLOUR_RULE = new RegExp([AUTO, SERIAL].map((r) => r.source).join('|'), 'i');

function find(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') for (const kk of Object.keys(o)) {
    if (kk === k && typeof o[kk] === 'string') return o[kk];
    const r = find(o[kk], k); if (r) return r;
  }
  return undefined;
}

async function main() {
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

  let total = 0;
  const out: string[] = [];
  for (const c of CARDS) {
    const raw = await search(c.q);
    const hits = raw
      .filter((x) => x.p > 0.5 && x.p < 5000)
      .filter((x) => new RegExp(c.player.split(' ').pop()!, 'i').test(x.t))
      .filter((x) => /2026/.test(x.t) && /chrome/i.test(x.t))
      .filter((x) => c.must.test(x.t))
      .filter((x) => !(/red white|rwb/i.test(c.must.source) ? NO_COLOUR_RULE : EXCLUDE).test(x.t))
      .filter((x) => !(c.not && c.not.test(x.t)))
      .filter((x) => !GRADED.test(x.t) && !NOISE.test(x.t))
      .sort((a, b) => a.p - b.p);
    if (!hits.length) {
      out.push(`  ${c.id.padEnd(20)} ${c.player.padEnd(18)}  no raw comps`);
      continue;
    }
    const med = hits[Math.floor(hits.length / 2)].p;
    total += med;
    out.push(`  ${c.id.padEnd(20)} ${c.player.padEnd(18)}  $${med.toFixed(2).padStart(7)}   (${hits.length} asks, $${hits[0].p.toFixed(2)}-$${hits[hits.length - 1].p.toFixed(2)})${hits.length < 4 ? '  THIN' : ''}`);
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log('2026 Topps Chrome drop, raw active-ask medians:\n');
  console.log(out.join('\n'));
  console.log(`\nsum of medians: $${total.toFixed(2)}  (asks, not sales; graded excluded)`);
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
