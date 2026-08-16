/**
 * Shared eBay Browse comp logic for sports-card pricing.
 *
 * This lived inline in price-cards.ts and has now produced three separate
 * mispricing bugs, each found only because Michael eyeballed a number and said
 * it was wrong. It lives here so there is exactly one copy to fix:
 *
 *   1. The card number went INTO the query ("... Denzer Guzman #237"), which
 *      throttled results to near zero. It is a FILTER over a wide result set,
 *      not a search term.
 *   2. X-Fractor fell through to `base`, because "x-fractor" does not contain
 *      the substring "refractor", so X-Fractors were comped against base cards
 *      at roughly half their real price.
 *   3. Insert cards searched without their insert NAME, so a Big Ticket Players
 *      Ohtani found 50 generic Ohtani cards, exactly one of which was the right
 *      card, and that one was graded. One comp, $27.49 ask, $4.50 real market.
 *
 * Rules that fall out of those:
 *   - search wide, filter narrow
 *   - the parallel tier decides both the query keyword and the accept test
 *   - for inserts the set NAME is the reliable token; the code is often absent
 *   - graded copies are never comps for raw cards
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';

export type CardLike = {
  player: string; set_name: string; year?: number | string | null;
  card_number?: string | null; parallel?: string | null;
};

function findKey(o: any, k: string): string | undefined {
  if (o && typeof o === 'object') {
    for (const kk of Object.keys(o)) {
      if (kk === k && typeof o[kk] === 'string') return o[kk];
      const r = findKey(o[kk], k); if (r) return r;
    }
  }
  return undefined;
}

export async function browseToken(): Promise<string> {
  const cfg = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const id = findKey(cfg, 'EBAY_CLIENT_ID'), sec = findKey(cfg, 'EBAY_CLIENT_SECRET');
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token fail ' + JSON.stringify(j));
  return j.access_token;
}

export const serial = (p: string | null | undefined) => {
  const m = (p || '').match(/\/(\d{1,4})/); return m ? `/${m[1]}` : null;
};

export function category(parallel: string | null | undefined) {
  const p = (parallel || '').toLowerCase();
  if (/mini[\s-]?diamond/.test(p) && !serial(parallel)) return 'minidiamond';
  if (/red\s*white|rwb|red\/white/.test(p)) return 'rwb';
  if (serial(parallel)) return 'numbered';
  // MUST precede the refractor test and the base fallback: "x-fractor" does not
  // contain "refractor".
  if (/x-?fractor/.test(p)) return 'xfractor';
  if (p.includes('refractor') || p.includes('raywave')) return 'refractor';
  if (p.includes('insert')) return 'insert';
  return 'base';
}

const REF_KW = ['superfractor', 'atomic', 'laser', 'mojo', 'shimmer', 'padparadscha', 'sepia', 'aqua prism', 'prism', 'x-fractor', 'xfractor', 'seams'];
export const refKeyword = (parallel: string | null | undefined) => {
  const p = (parallel || '').toLowerCase(); return REF_KW.find(k => p.includes(k)) || null;
};

/** "2026 Topps Chrome (Big Ticket Players insert)" -> "Big Ticket Players" */
export function insertName(setName: string | null | undefined) {
  const m = (setName || '').match(/\(([^)]+)\)/);
  if (!m) return null;
  return m[1].replace(/\s*(insert|autographs|autograph)$/i, '').trim() || null;
}

export function buildQuery(c: CardLike) {
  const set = (c.set_name || '').replace(/\(.*?\)/g, '').trim();
  const year = String(c.year ?? '');
  const parts: (string | null)[] = [set.startsWith(year) ? '' : year, set, insertName(c.set_name), c.player];
  const cat = category(c.parallel);
  if (cat === 'rwb') parts.push('red white blue refractor');
  else if (cat === 'minidiamond') parts.push('mini diamond refractor');
  else if (cat === 'xfractor') parts.push('xfractor');
  else if (cat === 'refractor') parts.push(refKeyword(c.parallel) ? `${refKeyword(c.parallel)} refractor` : 'refractor');
  const ser = serial(c.parallel); if (ser) parts.push(ser);
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function productGate(setName: string) {
  const s = (setName || '').toLowerCase();
  if (s.includes('finest')) return { require: ['finest'], exclude: ['bowman'] };
  if (s.includes('bowman')) return { require: ['bowman'], exclude: ['finest'] };
  if (s.includes('sterling')) return { require: ['sterling'], exclude: [] as string[] };
  if (s.includes('chrome')) return { require: ['chrome'], exclude: ['bowman', 'finest'] };
  if (s.includes('topps')) return { require: ['topps'], exclude: ['bowman', 'finest'] };
  return { require: [] as string[], exclude: [] as string[] };
}

export function numberMatches(title: string, num: string | null | undefined) {
  if (!num) return true;
  const t = title.toLowerCase(); const n = String(num).toLowerCase().trim();
  const strip = (s: string) => s.replace(/[\s-]/g, '');
  if (/[a-z]/.test(n)) return strip(t).includes(strip(n));
  return new RegExp(`(^|[^0-9a-z/])#?${n}([^0-9]|$)`, 'i').test(` ${t} `);
}

const NONBASE_WORDS = ['auto', 'ssp', 'superfractor', 'super fractor', 'x-fractor', 'xfractor', 'mini diamond', 'mojo', 'shimmer', 'laser', 'atomic', 'prism', 'sepia', 'padparadscha', 'sapphire', 'printing plate', 'negative', '1/1'];
/** Graded copies sell for a multiple of raw and are never comps for raw stock. */
export const GRADED = /\b(psa|bgs|sgc|cgc|gem\s*mint|graded|slab)\b/i;

export function matches(title: string, c: CardLike) {
  const t = title.toLowerCase();
  if (GRADED.test(title)) return false;
  const surname = (c.player.split('/')[0].trim().split(' ').pop() || '').toLowerCase();
  if (surname && !t.includes(surname)) return false;
  const pg = productGate(c.set_name);
  if (pg.require.some(r => !t.includes(r))) return false;
  if (pg.exclude.some(x => t.includes(x))) return false;
  // For inserts the set name pins the card as well as the code does, and is far
  // more often present in the title. One card per player per insert set.
  const ins = insertName(c.set_name);
  const insHit = ins ? t.includes(ins.toLowerCase()) : false;
  if (!insHit && !numberMatches(title, c.card_number)) return false;

  const cat = category(c.parallel); const ser = serial(c.parallel);
  const hasRef = t.includes('refractor') || t.includes('raywave') || t.includes('prism');
  const hasNum = /\/\d/.test(t); const hasAuto = t.includes('auto');
  const hasSSP = t.includes('ssp') || t.includes('super');
  if (cat === 'minidiamond') return t.includes('mini') && t.includes('diamond') && !hasNum && !hasAuto;
  if (cat === 'xfractor') return /x\s*-?\s*fractor/.test(t) && !hasNum && !hasAuto;
  if (cat === 'base') return !hasNum && !hasAuto && !hasSSP && !NONBASE_WORDS.some(w => t.includes(w));
  if (cat === 'refractor') { const kw = refKeyword(c.parallel); return hasRef && !hasNum && !hasAuto && !hasSSP && (!kw || t.includes(kw.split(' ')[0])); }
  if (cat === 'rwb') return (t.includes('red') && (t.includes('white') || t.includes('blue'))) || t.includes('rwb');
  if (cat === 'numbered') return ser ? t.includes(ser) : (hasNum && !hasAuto);
  return true; // insert: the gates above already pin it
}

export const pct = (arr: number[], p: number) => {
  const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Active asking prices for this exact card, graded copies excluded. */
export async function comps(tok: string, c: CardLike): Promise<number[]> {
  const q = buildQuery(c);
  try {
    const r = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=261328&limit=50`,
      { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j = await r.json();
    return (j.itemSummaries || []).filter((it: any) => matches(it.title || '', c))
      .map((it: any) => Number(it.price?.value)).filter((v: number) => v > 0 && v < 100000);
  } catch { return []; }
}
