/**
 * Cross-set player-lot candidates. Michael: "probably some bowman players too
 * that have crossover among sets."
 *
 * A player lot needs DIFFERENT cards, so this counts distinct set+number+
 * parallel, not rows, and reports how many distinct product families the
 * player spans. One set is a set-builder sale; three sets is a collector sale.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const r: any = await sql`
    SELECT player,
           count(*) cards,
           count(DISTINCT split_part(set_name, ' (', 1)) families,
           count(*) FILTER (WHERE status='listed') listed,
           sum(coalesce(asking_price_cents,0)) ask,
           string_agg(DISTINCT replace(set_name, '2026 Topps ', ''), ' | ') sets
    FROM baseball_cards
    WHERE duplicate_of_id IS NULL AND coalesce(sold_price_cents,0)=0
    GROUP BY player HAVING count(*) >= 3
    ORDER BY count(DISTINCT split_part(set_name, ' (', 1)) DESC, sum(coalesce(asking_price_cents,0)) DESC`;
  console.log(`${r.length} players in the vault hold 3+ unsold cards:\n`);
  r.forEach((x: any) => console.log(
    `  ${x.player.padEnd(22)} ${x.cards} cards / ${x.families} product families / ${x.listed} listed / asks $${(x.ask / 100).toFixed(2)}\n` +
    `      ${x.sets}`));
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
