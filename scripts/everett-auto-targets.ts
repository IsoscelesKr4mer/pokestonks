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
import { readFileSync, writeFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

/**
 * eBay Browse has a DAILY call cap and a full below-AA sweep is ~930 players.
 * Two sweeps in an afternoon exhausted it, and every lookup then came back 429.
 * Cache on disk so re-runs cost nothing: whether a player has a 1st Bowman on
 * the market does not change hour to hour.
 */
const CACHE_FILE = 'scripts/_bowman_cache.json';
type Cached = { n: number; min: number | null; at: string };
const cache: Record<string, Cached> = existsSync(CACHE_FILE)
  ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};
const CACHE_DAYS = 14;
const fresh = (c: Cached) => (Date.now() - Date.parse(c.at)) / 864e5 < CACHE_DAYS;

const DAYS = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 45);
const MAX_PRICE = Number(process.argv.find((a) => a.startsWith('--max-price='))?.split('=')[1] ?? 0);
const FUTURE = process.argv.includes('--future');
/**
 * Offseason planning: EVERYTHING BELOW DOUBLE-A in the six NWL organisations,
 * so High-A, Single-A and rookie ball.
 *
 * An earlier version dropped the current High-A rosters on the theory that they
 * all graduate to AA. Michael: "That's not true some of these guys just got
 * pulled up in the last week. Let's just keep it at <AA." Promotions run
 * continuously, so a player who reached High-A days ago is very much still an
 * NWL body next season. AA and above is the real cutoff, because that is where
 * a player has left the league for good.
 */
const OFFSEASON = process.argv.includes('--offseason');
const NO_EBAY = process.argv.includes('--no-ebay');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const NWL_LEAGUE = 126, EVERETT = 403;
const HIGH_A = 13, SINGLE_A = 14, ROOKIE = 16;
/** Everything below Double-A. AA and up have left the Northwest League. */
const BELOW_AA = [HIGH_A, SINGLE_A, ROOKIE];

const api = async (p: string) => (await fetch(`https://statsapi.mlb.com/api/v1/${p}`)).json();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nameKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w)).join(' ');

type Owned = { id: number; set: string; num: string; parallel: string; signed: boolean };

/**
 * rosterType=fullSeason includes MLB players on rehab assignments, so a
 * Single-A roster can contain Shane Bieber, Alek Manoah, Yusei Kikuchi. They
 * are real autograph targets if they happen to be in town, but they are NOT
 * next season's Northwest League, so they must not sit in an offseason
 * acquisition list. Anyone with an mlbDebutDate has already been up and is
 * marked accordingly instead of being silently projected to High-A.
 */
async function debuted(ids: number[]) {
  const out = new Set<number>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const j = await (await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&fields=people,id,mlbDebutDate`)).json();
      for (const p of j.people ?? []) if (p.mlbDebutDate) out.add(Number(p.id));
    } catch { /* leave unmarked rather than wrongly excluding */ }
  }
  return out;
}

/**
 * WHERE EACH PLAYER IS RIGHT NOW.
 *
 * rosterType=fullSeason is CUMULATIVE: it lists everyone who suited up for the
 * club at any point this year, including players long since promoted. That put
 * Felnin Celesten and Jonny Farmelo on the Everett roster after both had moved
 * up to Double-A Arkansas. Michael, twice: "felnin and farmelo are in AA now in
 * arkansas... dont poison my chat with old info", then "you need to have a
 * better source for these players".
 *
 * So the roster is only used to discover WHO to consider. The authoritative
 * answer to what level a player is at is his own currentTeam, and anyone whose
 * current club is not one of the below-AA clubs in these six orgs is dropped.
 * This also makes the old highest-level dedupe unnecessary: one player has
 * exactly one current team.
 */
async function currentTeams(ids: number[]) {
  const out = new Map<number, { id: number; name: string }>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const j = await (await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&hydrate=currentTeam`)).json();
      for (const p of j.people ?? []) {
        const ct = p.currentTeam;
        if (ct?.id) out.set(Number(p.id), { id: Number(ct.id), name: String(ct.name ?? '') });
      }
    } catch { /* unknown current team -> dropped below, better than guessing */ }
  }
  return out;
}
type Row = {
  player: string; pos: string; from: string; when: string; sortWhen: string;
  personId: number; mlb: boolean; level: number;
  mine: Owned[]; bowman: number | null; cheapest: number | null;
};

/**
 * Cheapest active 1st Bowman for this player, and how many are listed.
 *
 * Returns null when the answer is UNKNOWN (rate limited, network error). It
 * must never return zero for a failure: a 429 that reads as "no cards exist"
 * silently empties the ACQUIRE list and looks exactly like a real result.
 */
async function firstBowman(tok: string, player: string): Promise<{ n: number; min: number | null } | null> {
  const q = `${player} 1st bowman`;
  const hit = cache[q];
  if (hit && fresh(hit)) return { n: hit.n, min: hit.min };
  try {
    const r = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&category_ids=261328&limit=50`,
      { headers: { Authorization: `Bearer ${tok}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } });
    if (r.status === 429) return null;
    const j = await r.json();
    if (j.errors) return null;
    const surname = nameKey(player).split(' ').pop()!;
    // must name the player and say 1st Bowman; graded copies are not what he
    // wants to hand over a rail for
    const prices = (j.itemSummaries ?? [])
      .filter((i: any) => {
        const t = String(i.title).toLowerCase();
        return t.includes(surname) && /1st\s*bowman|first bowman/.test(t) && !/psa|bgs|sgc|cgc|graded|slab/.test(t);
      })
      .map((i: any) => Number(i.price?.value)).filter((v: number) => v > 0 && v < 5000);
    const out = { n: prices.length, min: prices.length ? Math.min(...prices) : null };
    cache[q] = { ...out, at: new Date().toISOString() };
    return out;
  } catch { return null; }
}

async function main() {
  const today = new Date();
  const end = new Date(today.getTime() + DAYS * 864e5);
  const season = today.getFullYear();

  const teams = (await api(`teams?sportId=${HIGH_A}&season=${season}`)).teams
    .filter((t: any) => t.league?.id === NWL_LEAGUE);
  const byId = new Map<number, any>(teams.map((t: any) => [t.id, t]));
  // ALL SIX orgs, Seattle included. Away players are the easier ask, but
  // Michael still wants Everett's own roster: "no I def want it to incluide
  // Everett's roster". He has 81 home dates a year to work them.
  const orgs = new Map<string, string>();
  for (const t of teams) orgs.set(t.parentOrgName, t.name);

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
  if (OFFSEASON) console.log(`OFFSEASON PLAN: every roster below Double-A in the six NWL orgs (High-A, Single-A, rookie), Seattle included.
AA and above are excluded, that is where a player has actually left the league.
`);
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

  const sources: { label: string; teamId: number; when: string; sortWhen: string; level: number }[] = [];
  if (!OFFSEASON) {
    for (const [id, d] of visits) sources.push({ label: byId.get(id)?.name ?? String(id), teamId: id, when: `${d[0]} to ${d[d.length - 1]}`, sortWhen: d[0], level: HIGH_A });
    // the home side, always available across the whole homestand calendar
    sources.push({ label: 'Everett AquaSox (HOME)', teamId: EVERETT, when: 'any home game', sortWhen: '0000', level: HIGH_A });
  }
  if (FUTURE || OFFSEASON) {
    for (const sportId of OFFSEASON ? BELOW_AA : [SINGLE_A, ROOKIE]) {
      for (const t of (await api(`teams?sportId=${sportId}&season=${season}`)).teams.filter((x: any) => orgs.has(x.parentOrgName))) {
        const dest = orgs.get(t.parentOrgName)!;
        sources.push({
          label: t.name === dest ? `${t.name} (already NWL)` : `${t.name} -> ${dest}`,
          teamId: t.id, when: OFFSEASON ? 'next season' : 'future promotion', sortWhen: '9999', level: sportId,
        });
      }
    }
  }

  let rows: Row[] = [];
  for (const s of sources) {
    const r = await api(`teams/${s.teamId}/roster?rosterType=fullSeason&season=${season}`);
    for (const p of r.roster ?? []) {
      rows.push({
        player: p.person.fullName, pos: p.position?.abbreviation ?? '', from: s.label,
        when: s.when, sortWhen: s.sortWhen, level: s.level, personId: Number(p.person.id), mlb: false,
        mine: owned.get(nameKey(p.person.fullName)) ?? [], bowman: null, cheapest: null,
      });
    }
  }
  // Re-seat every player on his CURRENT club, and drop anyone who has climbed
  // out of the pool. The roster call only told us who to look at.
  const allowed = new Map<number, { label: string; when: string; sortWhen: string; level: number }>();
  for (const s2 of sources) allowed.set(s2.teamId, { label: s2.label, when: s2.when, sortWhen: s2.sortWhen, level: s2.level });
  const nowAt = await currentTeams([...new Set(rows.map((r) => r.personId))]);
  const before = rows.length;
  rows = rows.filter((r) => {
    const ct = nowAt.get(r.personId);
    if (!ct || !allowed.has(ct.id)) return false;
    const a = allowed.get(ct.id)!;
    r.from = a.label; r.when = a.when; r.sortWhen = a.sortWhen; r.level = a.level;
    return true;
  });
  {
    const seen2 = new Map<string, Row>();
    for (const r of rows) if (!seen2.has(nameKey(r.player))) seen2.set(nameKey(r.player), r);
    rows = [...seen2.values()];
  }
  console.log(`  ${before} roster entries -> ${rows.length} players actually still below AA in these orgs`);

  const vets = await debuted(rows.map((r) => r.personId));
  for (const r of rows) r.mlb = vets.has(r.personId);
  const rehab = rows.filter((r) => r.mlb).length;
  console.log(`
${rows.length} players across ${sources.length} rosters` +
    (rehab ? `, ${rehab} already MLB-debuted (rehab assignments, not next season's NWL)` : ''));
  // An MLB veteran on rehab is not a future High-A visitor. Keep him out of the
  // offseason projection; in-season he is still a legitimate target.
  if (OFFSEASON) rows = rows.filter((r) => !r.mlb);

  if (!NO_EBAY) {
    // Sequential at ~110ms was fine for one roster, but sweeping every level
    // below AA is 1,000+ players and it ran past ten minutes. Six at a time
    // keeps it polite and finishes in a couple of minutes.
    const tok = await browseToken();
    process.stdout.write(`checking eBay for 1st Bowmans (${rows.length} players)`);
    const queue = [...rows];
    let done = 0, failed = 0, stop = false;
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (;;) {
        if (stop) return;
        const row = queue.shift();
        if (!row) return;
        const r = await firstBowman(tok, row.player);
        if (r === null) {
          failed++;
          // one 429 means the daily cap is gone; keep whatever is cached and stop
          if (failed > 20) { stop = true; return; }
        } else { row.bowman = r.n; row.cheapest = r.min; }
        if (++done % 100 === 0) process.stdout.write('.');
        await sleep(60);
      }
    }));
    writeFileSync(CACHE_FILE, JSON.stringify(cache));
    console.log(' done');
    if (failed) {
      console.log(`
  !! ${failed} eBay lookups FAILED (rate limit or network).`);
      console.log('     The ACQUIRE list below is INCOMPLETE. Cached answers were used where');
      console.log('     available; re-run tomorrow to fill the rest. Never read a short list');
      console.log('     here as "nothing to buy".');
    }
    const unknown = rows.filter((r) => r.bowman === null).length;
    if (unknown) console.log(`  ${unknown} players still unchecked`);
  }



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
