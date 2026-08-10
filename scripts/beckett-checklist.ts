/**
 * Read a product's parallel structure straight off Beckett.
 *
 *   npx tsx scripts/beckett-checklist.ts 2025 bowman-draft-sapphire
 *   npx tsx scripts/beckett-checklist.ts 2023 bowman-chrome-sapphire
 *
 * Michael should not have to paste checklists in. Beckett has a page per
 * product per year and curl with a browser UA reaches it.
 */
import { fetchChecklist, beckettUrl } from '../lib/services/beckett';

async function main(){
  const year = Number(process.argv[2]);
  const slug = process.argv[3];
  if (!year || !slug) { console.error('usage: beckett-checklist.ts <year> <slug>'); process.exit(1); }
  const url = beckettUrl(year, slug);
  console.log(url);
  const { lines, parallels } = await fetchChecklist(url);
  console.log(`\nparallels and inserts found: ${parallels.length}`);
  for (const p of parallels) console.log(`  ${p.name.padEnd(34)} /${String(p.serial).padEnd(5)} ${p.odds ?? ''}`);
  const sel = lines.filter((l) => /selection/i.test(l) && l.length < 140).slice(0, 6);
  if (sel.length) { console.log('\nlines mentioning Selections:'); for (const s of sel) console.log(`  ${s}`); }
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
