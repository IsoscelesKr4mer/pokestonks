/**
 * Card Ladder sold comps, via the parse.bot wrapper.
 *
 *   npx tsx scripts/cardladder.ts "2026 Topps Chrome Paul Skenes 150"
 *   npx tsx scripts/cardladder.ts --cert 12345678
 *   npx tsx scripts/cardladder.ts "Paul Skenes" --detail     # per-transaction rows
 *
 * WHAT THIS IS. Card Ladder aggregates completed sales from about fourteen
 * marketplaces, which is the sold data eBay will not sell us: the Marketplace
 * Insights application was denied. parse.bot is an UNOFFICIAL wrapper around
 * Card Ladder's site, not a Card Ladder product. So:
 *
 *   - It can break or vanish without notice.
 *   - A number from here is a second opinion, never the only source behind a
 *     price. Cross-check anything that would change a decision against the
 *     SportsCardsPro public page or his own recorded sales.
 *   - Card Ladder's own coverage is strongest on graded cards. Raw modern
 *     micro-parallels are exactly where any guide is thinnest, and that is
 *     most of what he pulls, so expect misses rather than treating one as a
 *     bug.
 *
 * BUDGET. The free tier is 200 credits a month and 5 requests a minute. Every
 * endpoint costs at least one credit, so this script makes the fewest calls
 * that answer the question and prints what it spent. Do not loop it over the
 * whole collection; that is 832 cards against a 200 credit budget.
 *
 * KEY. Needs PARSEBOT_API_KEY in .env.local. Sign up at parse.bot for a free
 * key; it is not something this script can mint.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE = 'https://api.parse.bot/scraper/97d5f4bc-6c65-4546-8f71-76149a5533cb';
const KEY = process.env.PARSEBOT_API_KEY;

/** Free tier is 5 requests a minute. 13s between calls keeps us under it. */
const THROTTLE_MS = 13_000;
let spent = 0;
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, credits: number): Promise<T> {
  const wait = THROTTLE_MS - (Date.now() - lastCall);
  if (lastCall && wait > 0) await sleep(wait);
  lastCall = Date.now();

  const res = await fetch(`${BASE}/${path}`, { headers: { 'X-API-Key': KEY! } });
  spent += credits;

  if (res.status === 401) throw new Error('parse.bot rejected the key. Check PARSEBOT_API_KEY.');
  if (res.status === 429) throw new Error('Rate limited or out of credits. Free tier is 5/min, 200/month.');
  if (!res.ok) throw new Error(`parse.bot ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

type Card = {
  id: string | number;
  label: string;
  player: string;
  year: number | string;
  set: string;
  number: string;
  variation: string | null;
  condition: string | null;
  current_value: number | null;
  market_value: number | null;
  num_sales: number | null;
  pop: number | null;
  last_sold_date: string | null;
  annual_percent_change: number | null;
  monthly_percent_change: number | null;
};

/** Card Ladder quotes dollars. Everything we store is integer cents. */
const cents = (dollars: number | null | undefined): number | null =>
  dollars === null || dollars === undefined ? null : Math.round(dollars * 100);

const money = (c: number | null): string =>
  c === null ? 'no value' : `$${(c / 100).toFixed(2)}`;

const pct = (n: number | null): string =>
  n === null || n === undefined ? '' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

function printCard(c: Card, i: number) {
  const value = cents(c.current_value ?? c.market_value);
  const bits = [
    `${i + 1}. ${c.label ?? `${c.year} ${c.set} ${c.player} #${c.number}`}`,
    `   ${money(value)}`,
    c.condition ? `   ${c.condition}` : '',
    c.num_sales ? `   ${c.num_sales} sales` : '',
    c.pop ? `   pop ${c.pop}` : '',
    c.last_sold_date ? `   last sold ${c.last_sold_date}` : '',
    c.annual_percent_change ? `   1y ${pct(c.annual_percent_change)}` : '',
  ];
  console.log(bits.filter(Boolean).join(''));
}

async function main() {
  const argv = process.argv.slice(2);
  if (!KEY) {
    console.error(
      'No PARSEBOT_API_KEY in .env.local.\n' +
        'Sign up at parse.bot for a free key (200 credits a month), then add:\n' +
        '  PARSEBOT_API_KEY=...\n'
    );
    process.exit(1);
  }

  const wantDetail = argv.includes('--detail');
  const certIdx = argv.indexOf('--cert');
  const query = argv.filter((a) => !a.startsWith('--')).join(' ').trim();

  if (certIdx !== -1) {
    const cert = argv[certIdx + 1];
    if (!cert) throw new Error('--cert needs a certification number.');
    const out = await call<unknown>(`search_by_cert?cert_number=${encodeURIComponent(cert)}`, 1);
    console.log(JSON.stringify(out, null, 2));
    console.log(`\n${spent} credit${spent === 1 ? '' : 's'} spent.`);
    return;
  }

  if (!query) {
    console.error('Usage: npx tsx scripts/cardladder.ts "<year> <set> <player> <number>" [--detail]');
    process.exit(1);
  }

  const search = await call<{ cards: Card[]; total_hits: number }>(
    `search_cards?query=${encodeURIComponent(query)}&limit=10`,
    1
  );

  const cards = search.cards ?? [];
  if (cards.length === 0) {
    // A miss here is usually the query, not the market. Card Ladder labels
    // cards its own way, so drop the card number and widen before concluding
    // the card is not tracked. Same lesson the eBay pricer learned: "no
    // comps" is nearly always a bad search.
    console.log(`No Card Ladder match for "${query}".`);
    console.log('Try it without the card number, or with just year + set + player.');
    console.log(`\n${spent} credit${spent === 1 ? '' : 's'} spent.`);
    return;
  }

  console.log(`${search.total_hits ?? cards.length} hits, showing ${cards.length}:\n`);
  cards.forEach(printCard);

  if (wantDetail) {
    const top = cards[0];
    console.log(`\nPer-transaction detail for ${top.label}:\n`);
    const sales = await call<unknown>(`get_card_sales_detail?card_id=${encodeURIComponent(String(top.id))}`, 1);
    console.log(JSON.stringify(sales, null, 2));
  }

  console.log(`\n${spent} credit${spent === 1 ? '' : 's'} spent. Free tier is 200 a month.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
