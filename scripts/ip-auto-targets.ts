/**
 * Cross-reference a MiLB team's LIVE active roster against baseball_cards, so
 * a ballpark trip carries the right cards.
 *
 *   npx tsx scripts/ip-auto-targets.ts 403 486
 *
 * Team ids come from https://statsapi.mlb.com/api/v1/teams?sportId=13 (High-A;
 * 11 Triple-A, 12 Double-A, 14 Single-A).
 *
 * Built 2026-08-14 after I answered an IP-auto question off an Opening Day
 * roster article. Michael: "youre data is old felnin and farmelo are in AA now
 * in arkansas. this is readily available info dont poison my chat with old
 * info". Roster pages on milb.com are client-rendered so scraping them returns
 * nothing; the stats API is the source and it is public and current.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function roster(id: string) {
  const r = await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}/roster?rosterType=active`);
  const j: any = await r.json();
  const t = await (await fetch(`https://statsapi.mlb.com/api/v1/teams/${id}`)).json();
  return { name: t.teams[0].name, parent: t.teams[0].parentOrgName, players: (j.roster ?? []).map((p: any) => p.person.fullName) };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
  for (const id of ids) {
    const { name, parent, players } = await roster(id);
    console.log(`\n===== ${name} (${parent}) — ${players.length} active =====`);
    let hits = 0;
    for (const p of players) {
      const rows: any = await sql`
        SELECT id, player, year, set_name, card_number, parallel, status, for_sale,
               asking_price_cents AS ask, coalesce(notes,'') AS notes
        FROM baseball_cards WHERE lower(player) = lower(${p}) ORDER BY asking_price_cents DESC NULLS LAST`;
      if (!rows.length) continue;
      hits++;
      console.log(`\n  ${p} — ${rows.length} card(s)`);
      for (const c of rows) {
        const signed = /ip auto|on-card|auto/i.test(`${c.parallel} ${c.notes}`);
        console.log(`    #${String(c.id).padEnd(4)} ${c.year} ${String(c.set_name).slice(0, 38).padEnd(38)} #${String(c.card_number ?? '-').padEnd(9)} [${String(c.parallel).slice(0, 30)}]` +
          `${c.for_sale === false ? ' PC' : ''}${signed ? ' ALREADY SIGNED' : ''} ${c.ask ? '$' + (c.ask / 100).toFixed(2) : ''}`);
      }
    }
    if (!hits) console.log('  no cards for anyone on this roster');
  }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
