// Sold-price source for SPORTS sealed product.
//
// Why this exists: the vault's daily price engine is TCGplayer-backed via
// TCGCSV, and TCGCSV has no sports categories at all (checked 2026-08-05, 90
// categories, zero baseball/football/basketball). So Topps/Bowman sealed can
// never price itself through the Pokemon pipeline.
//
// SportsCardsPro's public product page renders a computed "Ungraded" market
// value from eBay sold listings, plus a table of individual sales. No API
// token or subscription needed for that page. It 403s on non-browser
// user-agents, hence the UA below.
//
// Fetched via curl, not global fetch. Their bot filter 403s Node's undici even
// with a full set of browser headers (UA, Accept, Accept-Language, Sec-Fetch-*
// all tried), which points at TLS fingerprinting rather than headers. curl gets
// through. That makes this a LOCAL-ONLY path, same as scripts/price-cards.ts;
// it would not work from a Vercel function.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function get(url: string, slug: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sL', '--max-time', '40', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9', url],
    { maxBuffer: 32 * 1024 * 1024 }
  );
  if (!stdout || stdout.length < 5000) {
    throw new Error(`sportscardspro ${slug}: short or empty response (${stdout.length} bytes)`);
  }
  return stdout;
}

export type SportsCardsProQuote = {
  slug: string;
  marketCents: number;
  /** Individual eBay sales the page lists, newest first. Raw titles. */
  recentSales: Array<{ date: string; title: string; priceCents: number }>;
};

function toCents(dollars: string): number {
  return Math.round(Number(dollars.replace(/[$,]/g, '')) * 100);
}

function decode(s: string): string {
  return s
    .replace(/&#43;/g, '+')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripTags(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export async function fetchQuote(slug: string): Promise<SportsCardsProQuote> {
  const url = `https://www.sportscardspro.com/game/${slug}`;
  const html = await get(url, slug);

  // The Ungraded market value is the first dollar figure inside #price_data.
  const block = /id="price_data"[\s\S]{0,4000}/.exec(html);
  if (!block) throw new Error(`sportscardspro ${slug}: no #price_data block`);
  const price = /\$[\d,]+\.\d{2}/.exec(stripTags(block[0]));
  if (!price) throw new Error(`sportscardspro ${slug}: no price in #price_data`);

  const recentSales: SportsCardsProQuote['recentSales'] = [];
  const table = /Sale Date[\s\S]*/.exec(html);
  if (table) {
    for (const row of table[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
      const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? [])
        .map(stripTags)
        .filter((c) => c && c !== 'Report It' && !c.startsWith('Time Warp'));
      const [date, title, amount] = cells;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
      if (!/^\$[\d,]+\.?\d*$/.test(amount ?? '')) continue;
      recentSales.push({ date, title, priceCents: toCents(amount) });
    }
  }

  return { slug, marketCents: toCents(price[0]), recentSales };
}

/**
 * Sold rows carry raw eBay titles, so multi-box lots and weight-sorted
 * ("22.4g VERY HEAVY") pack-search listings sit alongside clean single-unit
 * sales and will skew a naive median. Drop them.
 */
export function singleUnitSales(sales: SportsCardsProQuote['recentSales']) {
  return sales.filter(
    (s) =>
      !/\b\d+\s*[x×]\s*20\d\d|\blot of\b|\bbundle of\b|\bset of\b/i.test(s.title) &&
      !/\bheavy\b|\d+\.\d+\s*g\b/i.test(s.title)
  );
}
