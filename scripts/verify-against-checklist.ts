/**
 * Verify every 2026 Topps Chrome card in the vault against the official Topps
 * checklist, matching on card_number -> player.
 *
 *   npx tsx scripts/verify-against-checklist.ts <parsed-checklist.json>
 *
 * The checklist is the only external source that can catch a misread the photos
 * agree on. Build the JSON with scripts/parse-checklist.py.
 */
import postgres from 'postgres'; import { config } from 'dotenv'; import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl: 'require' });

// The PDF loses accented characters, so "Jos\u00e9 Ram\u00edrez" extracts with U+FFFD
// where the accents were. Keep the replacement char and treat it as a
// single-character wildcard when comparing, rather than deleting it and
// producing "ramrez", which matches nothing.
const norm = (s: string) => s.toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z \ufffd]/g, '').replace(/\s+/g, ' ').trim();
const surname = (s: string) => norm(s).split(' ').filter(w => !['jr', 'sr', 'ii', 'iii'].includes(w)).pop() ?? '';
/** Does `entry` contain `name`, with U+FFFD in entry matching any one char? */
function contains(entry: string, name: string) {
  if (!name) return false;
  for (let i = 0; i + name.length <= entry.length; i++) {
    let hit = true;
    for (let j = 0; j < name.length; j++) {
      const e = entry[i + j];
      if (e !== name[j] && e !== '\ufffd') { hit = false; break; }
    }
    if (hit) return true;
  }
  return false;
}

async function main() {
  const chk = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, Record<string, string>>;
  const byCode = new Map<string, string>();
  for (const sec of Object.values(chk)) for (const [code, name] of Object.entries(sec)) byCode.set(code.toUpperCase(), name);
  console.log(`checklist codes loaded: ${byCode.size}`);

  const rows: any = await sql`SELECT id, player, set_name, card_number, status FROM baseball_cards
    WHERE set_name LIKE '2026 Topps Chrome%' AND card_number ~ '^[A-Za-z]' ORDER BY card_number, id`;

  let ok = 0; const bad: string[] = []; const unknown: string[] = [];
  for (const r of rows) {
    const entry = byCode.get(String(r.card_number).toUpperCase());
    if (!entry) { unknown.push(`  #${r.id} ${r.card_number} ${r.player} (code not on the checklist)`); continue; }
    // Past to Present cards name two players, but the checklist lists only the
    // present-day one, so require ANY of our surnames to match, not all.
    const parts = String(r.player).split('/').map(p => surname(p)).filter(Boolean);
    if (parts.some(p => contains(norm(entry), p))) ok++;
    else bad.push(`  #${r.id} ${String(r.card_number).padEnd(9)} vault "${r.player}"  !=  checklist "${entry.trim()}"`);
  }
  console.log(`\nmatched: ${ok}`);
  console.log(bad.length ? `\nMISMATCHES (${bad.length}):\n${bad.join('\n')}` : '\nno mismatches');
  if (unknown.length) console.log(`\nCODES NOT ON THE CHECKLIST (${unknown.length}):\n${unknown.join('\n')}`);
  await sql.end();
}
main().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
