/**
 * Normalize baseball_cards.set_name for 2026 Topps Chrome inserts.
 *
 *   npx tsx scripts/normalize-insert-sets.ts           # dry run
 *   npx tsx scripts/normalize-insert-sets.ts --apply
 *
 * Two separate problems, both of which quietly break any per-insert count:
 *
 * 1. THE SAME INSERT UNDER FOUR NAMES. The 1991 design insert (91CB- codes) was
 *    filed as "1991 Topps 75 Years insert", "1991 Topps Baseball insert",
 *    "1991 Topps insert" and "75 Years of Baseball insert". Big Ticket Player
 *    was split across "Big Ticket Player insert" and "Big Ticket insert". A
 *    GROUP BY set_name therefore reported 5 + 2 + 2 + 1 instead of 10.
 *
 * 2. INSERTS FILED AS BASE CHROME. Six rows carry an insert code in
 *    card_number but sit under plain "2026 Topps Chrome", so they never appear
 *    in an insert listing at all.
 *
 * The insert code prefix is the authority here, not the existing set_name.
 * Nothing about parallel, price or listing state is touched.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const TC = '2026 Topps Chrome';

/**
 * Code prefix -> canonical set_name. Order matters: PTP must beat P.
 *
 * These names come from the official Topps checklist PDF, not from whatever
 * spelling happened to be most common in the table. Two were wrong on the first
 * pass: the 91CB- insert is "1991 Topps Baseball" (I had picked "1991 Topps 75
 * Years", which was the majority spelling but not the real one), and BTP- is
 * "Big Ticket Players", plural. Verify with scripts/verify-against-checklist.ts.
 */
const BY_PREFIX: [string, string][] = [
  ['91CB-', `${TC} (1991 Topps Baseball insert)`],
  ['PTP-', `${TC} (Past to Present insert)`],
  ['BTP-', `${TC} (Big Ticket Players insert)`],
  // Chrome Rivals ships in HOME and AWAY variants, coded RVH- and RVA-. Only
  // RVA- was listed here at first, which left Reggie Jackson RVH-16 sitting
  // under plain "2026 Topps Chrome" and missing from the Rivals count entirely.
  ['RVA-', `${TC} (Chrome Rivals insert)`],
  ['RVH-', `${TC} (Chrome Rivals insert)`],
  ['WC-', `${TC} (Wrecking Crew insert)`],
  ['FS-', `${TC} (Future Stars insert)`],
  ['SN-', `${TC} (Static Noise insert)`],
  // Looked up on the 2026 Topps Chrome checklist rather than guessed: DM- is
  // Diamond Moments, IS- is Ink Strokes (an autograph set, so it is named like
  // the other auto sets and deliberately does not end in "insert").
  ['DM-', `${TC} (Diamond Moments insert)`],
  ['IS-', `${TC} (Ink Strokes autographs)`],
  ['RA-', `${TC} (Rookie Autographs)`],
  ['P-', `${TC} (Perspectives insert)`],
];

function canonical(cardNumber: string): string | null {
  const n = (cardNumber || '').toUpperCase();
  for (const [pre, set] of BY_PREFIX) if (n.startsWith(pre)) return set;
  return null;
}

async function main() {
  // Only 2026 Topps Chrome rows. Finest and Bowman have their own insert
  // families and their own code prefixes, so leave them alone.
  const rows: any = await sql`
    SELECT id, player, set_name, card_number, status FROM baseball_cards
    WHERE set_name LIKE ${TC + '%'} ORDER BY card_number, id`;

  const changes = rows
    .map((r: any) => ({ ...r, want: canonical(r.card_number) }))
    .filter((r: any) => r.want && r.want !== r.set_name);

  if (!changes.length) { console.log('nothing to normalize'); await sql.end(); return; }

  console.log(`${changes.length} rows to re-file:\n`);
  for (const c of changes) {
    console.log(`  #${String(c.id).padEnd(4)} ${String(c.card_number).padEnd(9)} ${c.player.padEnd(28)} [${c.status}]`);
    console.log(`         ${c.set_name}\n      -> ${c.want}`);
  }

  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }
  for (const c of changes) {
    await sql`UPDATE baseball_cards SET set_name = ${c.want}, updated_at = now() WHERE id = ${c.id}`;
  }
  console.log(`\n${changes.length} rows re-filed.`);

  const after: any = await sql`
    SELECT set_name, count(*)::int n FROM baseball_cards
    WHERE set_name LIKE ${TC + ' (%'} GROUP BY 1 ORDER BY n DESC, 1`;
  console.log('\n2026 Topps Chrome inserts after normalization:');
  for (const r of after) console.log(`  ${String(r.n).padStart(3)}  ${r.set_name}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
