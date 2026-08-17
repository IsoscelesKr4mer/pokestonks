/**
 * In-person autograph targets rolling through Everett.
 *
 *   npx tsx scripts/everett-auto-targets.ts                 # who is coming in 45 days
 *   npx tsx scripts/everett-auto-targets.ts --days=200      # rest of the season
 *   npx tsx scripts/everett-auto-targets.ts --future        # add the feeder levels
 *   npx tsx scripts/everett-auto-targets.ts --no-ebay       # skip the price lookups (fast)
 *   npx tsx scripts/everett-auto-targets.ts --max-price=15  # only cards worth buying to sign
 *
 * WHY THIS WORKS. The Northwest League is league 126 inside sportId 13 (High-A)
 * and has only six clubs, so every road team at Everett comes from a fixed pool
 * of five organisations:
 *   Eugene Emeralds      San Francisco Giants
 *   Hillsboro Hops       Arizona Diamondbacks
 *   Spokane Indians      Colorado Rockies
 *   Tri-City Dust Devils Los Angeles Angels
 *   Vancouver Canadians  Toronto Blue Jays
 * A prospect anywhere in those five orgs passes through Everett as he climbs,
 * which is why the feeder levels matter: today's Single-A Rockies bat is next
 * year's Spokane visitor. Away players are the soft target, because the crowd
 * swarms the home dugout.
 *
 * THE OUTPUT THAT MATTERS IS "ACQUIRE", NOT "BRING". Michael owns cards for 9
 * Everett players but, at the time this was written, only 3 across all five
 * visiting orgs. The bottleneck is not knowing who to bring, it is not owning
 * cardboard for the people who are coming. So each player is checked against
 * eBay for a 1st Bowman and its cheapest active price, which answers both "does
 * a signable card exist" and "what does it cost to get one before he arrives".
 *
 * EVERYTHING IS LIVE. Rosters churn weekly and stale prospect data has been
 * called out before, so nothing is hardcoded but the league id.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { browseToken } from './lib/card-comps';
config({ path: '.env.local' });

const DAYS = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 45);
const MAX_PRICE = Number(process.argv.find((a) => a.startsWith('--max-price='))?.split('=')[1] ?? 0);
const FUTURE = process.argv.includes('--future');
const NO_EBAY = process.argv.includes('--no-ebay');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const NWL_LEAGUE = 126, EVERETT = 403;
const HIGH_A = 13, SINGLE_A = 14, ROOKIE = 16;

const api = async (p: string) => (await fetch(`https://statsapi.mlb.com/api/v1/${p}`)).json();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nameKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w)).join(' ');

type Owned = { id: number; set: string; num: string; parallel: string; signed: boolean };
type Row = {
  player: string; pos: string; from: string; when: string; sortWhen: string;
  mine: Owned[]; bowman: number | null; cheapest: number | null;
};

/** Cheapest active 1st Bowman for this player, and how many are listed. */
async function firstBowman(tok: string, player: string) {
  const q = `${player} 1st bowman`;
  try {
    const r = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=261328&limit=50`,
      { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    const j = await r.json();
    const surname = nameKey(player).split(' ').pop()!;
    // must name the player and say 1st Bowman; graded copies are not what he
    // wants to hand over a rail for
    const prices = (j.itemSummaries ?? [])
      .filter((i: any) => {
        const t = String(i.title).toLowerCase();
        return t.includes(surname) && /1st\s*bowman|first bowman/.test(t) && !/psa|bgs|sgc|cgc|graded|slab/.test(t);
      })
      .map((i: any) => Number(i.price?.value)).filter((v: number) => v > 0 && v < 5000);
    return { n: prices.length, min: prices.length ? Math.min(...prices) : null };
  } catch { return { n: 0, min: null }; }
}

async function main() {
  const today = new Date();
  const end = new Date(today.getTime() + DAYS * 864e5);
  const season = today.getFullYear();

  const teams = (await api(`teams?sportId=${HIGH_A}&season=${season}`)).teams
    .filter((t: any) => t.league?.id === NWL_LEAGUE);
  const byId = new Map<number, any>(teams.map((t: any) => [t.id, t]));
  const orgs = new Map<string, string>();
  for (const t of teams) if (t.id !== EVERETT) orgs.set(t.parentOrgName, t.name);

  const sched = await api(`schedule?sportId=${HIGH_A}&teamId=${EVERETT}&startDate=${iso(today)}&endDate=${iso(end)}`);
  const visits = new Map<number, string[]>();
  for (const day of sched.dates ?? []) {
    for (const g of day.games ?? []) {
      if (g.teams?.home?.team?.id !== EVERETT) continue;
      const a = g.teams.away.team.id;
      if (!visits.has(a)) visits.set(a, []);
      visits.get(a)!.push(day.date);
    }
  }
  console.log(`EVERETT HOME GAMES, next ${DAYS} days`);
  if (!visits.size) console.log('  none scheduled. Try --days=200 or wait for next season.');
  for (const [id, d] of visits) console.log(`  ${byId.get(id)?.name}  ${d[0]} to ${d[d.length - 1]}  (${d.length} games)`);

  const cards: any = await sql`
    SELECT id, player, set_name, card_number, parallel, COALESCE(notes,'') AS notes
    FROM baseball_cards WHERE status <> 'sold'`;
  const owned = new Map<string, Owned[]>();
  for (const c of cards) for (const part of String(c.player).split('/')) {
    const k = nameKey(part); if (!k) continue;
    if (!owned.has(k)) owned.set(k, []);
    owned.get(k)!.push({
      id: Number(c.id), set: c.set_name, num: c.card_number, parallel: c.parallel,
      signed: /in-person auto|ip auto/i.test(c.notes) || /ip auto/i.test(String(c.parallel ?? '')),
    });
  }

  const sources: { label: string; teamId: number; when: string; sortWhen: string }[] = [];
  for (const [id, d] of visits) sources.push({ label: byId.get(id)?.name ?? String(id), teamId: id, when: `${d[0]} to ${d[d.length - 1]}`, sortWhen: d[0] });
  if (FUTURE) {
    for (const sportId of [SINGLE_A, ROOKIE]) {
      for (const t of (await api(`teams?sportId=${sportId}&season=${season}`)).teams.filter((x: any) => orgs.has(x.parentOrgName))) {
        sources.push({ label: `${t.name} -> ${orgs.get(t.parentOrgName)}`, teamId: t.id, when: 'future promotion', sortWhen: '9999' });
      }
    }
  }

  let rows: Row[] = [];
  for (const s of sources) {
    const r = await api(`teams/${s.teamId}/roster?rosterType=fullSeason&season=${season}`);
    for (const p of r.roster ?? []) {
      rows.push({
        player: p.person.fullName, pos: p.position?.abbreviation ?? '', from: s.label,
        when: s.when, sortWhen: s.sortWhen, mine: owned.get(nameKey(p.person.fullName)) ?? [],
        bowman: null, cheapest: null,
      });
    }
  }
  console.log(`\n${rows.length} players across ${sources.length} rosters`);

  if (!NO_EBAY) {
    const tok = await browseToken();
    process.stdout.write('checking eBay for 1st Bowmans');
    for (const [i, row] of rows.entries()) {
      const r = await firstBowman(tok, row.player);
      row.bowman = r.n; row.cheapest = r.min;
      await sleep(110);
      if (i % 25 === 0) process.stdout.write('.');
    }
    console.log(' done');
  }

  // A player can appear on more than one roster (a rehab assignment, or a
  // complex-league entry alongside his club), so collapse to one line per
  // player and keep the soonest visit.
  const seen = new Map<string, Row>();
  for (const r of rows.sort((a, b) => a.sortWhen.localeCompare(b.sortWhen))) {
    const k = nameKey(r.player);
    if (!seen.has(k)) seen.set(k, r);
  }
  rows = [...seen.values()];

  const bring = rows.filter((r) => r.mine.some((m) => !m.signed));
  const signed = rows.filter((r) => r.mine.length && r.mine.every((m) => m.signed));
  const acquire = rows.filter((r) => !r.mine.length && (r.bowman ?? 0) > 0
    && (!MAX_PRICE || (r.cheapest ?? 1e9) <= MAX_PRICE))
    .sort((a, b) => a.sortWhen.localeCompare(b.sortWhen) || (a.cheapest ?? 1e9) - (b.cheapest ?? 1e9));

  console.log(`\n=== BRING (${bring.length}) you own an unsigned card and he is coming ===`);
  for (const r of bring.sort((a, b) => a.sortWhen.localeCompare(b.sortWhen))) {
    console.log(`  ${r.player} (${r.pos})  ${r.from}  [${r.when}]`);
    for (const m of r.mine.filter((x) => !x.signed)) console.log(`      #${m.id} ${m.set} ${m.num ?? ''} ${m.parallel ?? ''}`);
  }

  console.log(`\n=== ACQUIRE (${acquire.length}) coming through, has a 1st Bowman, you own nothing ===`);
  for (const r of acquire.slice(0, 40)) {
    console.log(`  $${String(r.cheapest?.toFixed(2)).padStart(7)}  ${r.player} (${r.pos})  ${r.from}  [${r.when}]  ${r.bowman} listed`);
  }
  if (acquire.length > 40) console.log(`  ... and ${acquire.length - 40} more`);

  if (signed.length) console.log(`\n=== already signed, skip (${signed.length}) ===\n  ${signed.map((r) => r.player).join(', ')}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
