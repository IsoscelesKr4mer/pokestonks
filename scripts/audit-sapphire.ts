/**
 * Check every Sapphire card's colour and serial against the ladder for its
 * specific PRODUCT and YEAR.
 *
 *   npx tsx scripts/audit-sapphire.ts
 *
 * Ladders from Michael 2026-08-10, Beckett-confirmed for 2023 Chrome Sapphire.
 * The ladder differs by product AND year, so a colour alone means nothing:
 * in 2023 Chrome Sapphire a /75 is Orange, while in 2023 Draft a /75 is Yellow.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

type Ladder = Record<string, number>;
const SAPPHIRE: Record<string, Ladder> = {
  '2020': {orange:50, purple:25, red:10},
  '2021': {green:125, aqua:99, orange:75, yellow:50, purple:20, red:15},
  '2022': {aqua:55, orange:50, purple:25, red:10},
  '2023': {green:60, aqua:55, orange:50, purple:25, red:10},
  '2024': {green:99, yellow:75, gold:50, orange:25, black:10, red:5},
  '2025': {green:99, yellow:75, gold:50, orange:25, black:10, red:5},
  '2026': {green:99, yellow:75, gold:50, orange:25, black:10, red:5},
};
const CHROME: Record<string, Ladder> = {
  '2021': {green:125, aqua:99, orange:75, yellow:50, purple:25, red:5},
  '2023': {aqua:99, orange:75, yellow:50, purple:25, red:5},
  '2024': {yellow:75, gold:50, orange:25, black:10, red:5},
  '2025': {yellow:75, gold:50, orange:25, black:10, red:5},
  '2026': {yellow:75, gold:50, orange:25, black:10, red:5},
};
const DRAFT: Record<string, Ladder> = {
  '2019': {blue:99, green:50, orange:25, gold:15, purple:10, red:5},
  '2021': {yellow:99, green:50, orange:25, aqua:20, gold:15, purple:10, red:5},
  '2022': {yellow:99, green:50, orange:25, aqua:20, gold:15, purple:10, red:5},
  '2023': {yellow:75, gold:50, orange:25, black:10, red:5},
  '2024': {yellow:75, gold:50, orange:25, black:10, red:5},
  '2025': {yellow:75, gold:50, orange:25, black:10, red:5},
  '2026': {yellow:75, gold:50, orange:25, black:10, red:5},
};
// Ranges Michael flagged as unconfirmed; do not assert a mismatch on these.
const UNCONFIRMED = new Set(['CHROME:2020', 'CHROME:2022', 'DRAFT:2020']);

function productOf(set: string): 'DRAFT'|'CHROME'|'SAPPHIRE' {
  if (/draft/i.test(set)) return 'DRAFT';
  if (/chrome/i.test(set)) return 'CHROME';
  return 'SAPPHIRE';
}

async function main(){
  const rows = await sql`
    SELECT id, player, set_name, year, card_number, parallel FROM baseball_cards
    WHERE parallel ILIKE '%sapphire%' ORDER BY set_name, id`;
  let base=0, ok=0; const issues:string[]=[];
  for (const c of rows as any[]) {
    const prod=productOf(c.set_name);
    const yr=String(c.year ?? (c.set_name.match(/(\d{4})/)?.[1] ?? ''));
    const colour=(c.parallel||'').match(/\b(aqua|orange|yellow|purple|red|green|gold|black|blue)\b/i)?.[1]?.toLowerCase();
    const serial=Number((c.parallel||'').match(/\/(\d{1,4})/)?.[1] ?? 0);
    const table = prod==='DRAFT'?DRAFT : prod==='CHROME'?CHROME : SAPPHIRE;

    // Blue is base everywhere except 2019 Draft.
    if (colour==='blue' && !(prod==='DRAFT' && yr==='2019')) { base++; continue; }
    // Base inserts legitimately have no colour. Sapphire Selections base is
    // the blue version; its parallels are Gold Ref /50, Orange Ref /25,
    // Red Ref /5, Superfractor 1/1 (Beckett, 2025 Draft Sapphire).
    if (!colour && /selections|insert/i.test(c.parallel || '')) { base++; continue; }
    if (!colour) { issues.push(`  #${c.id} ${c.player}: no colour recorded (${c.parallel})`); continue; }
    if (!yr) { issues.push(`  #${c.id} ${c.player}: no year on the record`); continue; }
    if (UNCONFIRMED.has(`${prod}:${yr}`)) { issues.push(`  #${c.id} ${yr} ${prod} ${c.player}: ladder unconfirmed for this product/year`); continue; }
    const lad=table[yr];
    if (!lad) { issues.push(`  #${c.id} ${yr} ${prod} ${c.player}: no ladder on file`); continue; }
    const expect=lad[colour];
    if (!expect) {
      const alt=Object.entries(lad).find(([,v])=>v===serial)?.[0];
      issues.push(`  #${c.id} ${yr} ${prod} ${c.player}: ${colour} is not in this ladder${alt?`, but /${serial} here is ${alt}`:''}`);
    } else if (serial && serial!==expect) {
      const alt=Object.entries(lad).find(([,v])=>v===serial)?.[0];
      issues.push(`  #${c.id} ${yr} ${prod} ${c.player}: recorded ${colour} /${serial}, but ${colour} is /${expect} here${alt?` and /${serial} is ${alt}`:''}`);
    } else ok++;
  }
  console.log(`base Blue (unnumbered): ${base}`);
  console.log(`numbered parallels that check out: ${ok}`);
  console.log(`needing attention: ${issues.length}`);
  for (const i of issues) console.log(i);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
