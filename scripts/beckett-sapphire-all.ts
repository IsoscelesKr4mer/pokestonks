/**
 * Pull the parallel ladder for every Bowman Sapphire release from Beckett.
 *
 *   npx tsx scripts/beckett-sapphire-all.ts            # print
 *   npx tsx scripts/beckett-sapphire-all.ts --json     # write scripts/_sapphire_ladders.json
 *
 * Three products, each with its own ladder per year. Beckett slugs vary a
 * little year to year, so each product tries a few spellings.
 */
import { fetchChecklist } from '../lib/services/beckett';
import { writeFileSync } from 'fs';

const PRODUCTS: { key: string; slugs: string[]; years: number[] }[] = [
  { key: 'Bowman Sapphire',        slugs: ['bowman-sapphire', 'bowman-sapphire-edition'],               years: [2020,2021,2022,2023,2024,2025,2026] },
  { key: 'Bowman Chrome Sapphire', slugs: ['bowman-chrome-sapphire', 'bowman-chrome-sapphire-edition'], years: [2020,2021,2022,2023,2024,2025,2026] },
  { key: 'Bowman Draft Sapphire',  slugs: ['bowman-draft-sapphire', 'bowman-draft-chrome-sapphire'],    years: [2019,2020,2021,2022,2023,2024,2025,2026] },
];

const CORE = /^(green|aqua|orange|yellow|gold|purple|red|black|blue|padparadscha|superfractor)\b/i;

async function main(){
  const out: Record<string, Record<string, {name:string;serial:number|null}[]>> = {};
  for (const p of PRODUCTS) {
    out[p.key] = {};
    for (const y of p.years) {
      let got: any = null; let usedSlug='';
      for (const slug of p.slugs) {
        try {
          const r = await fetchChecklist(`https://www.beckett.com/news/${y}-${slug}-baseball-cards/`);
          // A 404 still returns a page, so require real parallel content.
          if (r.parallels.length >= 3) { got = r; usedSlug = slug; break; }
        } catch {}
      }
      if (!got) {
        // Distinguish "page missing" from "Beckett never published the runs".
        try {
          const r = await fetchChecklist(`https://www.beckett.com/news/${y}-${p.slugs[0]}-baseball-cards/`);
          const noRuns = r.lines.some((l:string)=>/print runs? for cards without serial numbers have not been announced|specifics are not yet known|not yet known/i.test(l));
          const hasPage = r.lines.some((l:string)=>new RegExp(`${y}[^
]{0,40}checklist`,'i').test(l));
          console.log(`${y} ${p.key}: ${noRuns ? 'page exists, Beckett has NOT published the print runs' : hasPage ? 'page exists, no parallel list on it' : 'no page'}`);
        } catch { console.log(`${y} ${p.key}: fetch failed`); }
        continue;
      }
      // Base ladder = the first run of core colours, before insert/auto ladders.
      const seen = new Set<string>();
      const base = got.parallels
        .filter((x:any)=>CORE.test(x.name))
        .filter((x:any)=>{ const k=x.name.toLowerCase().replace(/ sapphire| refractor/g,'').trim();
                           if (seen.has(k)) return false; seen.add(k); return true; })
        .map((x:any)=>({name:x.name.replace(/\s+/g,' ').trim(), serial:x.serial}));
      out[p.key][String(y)] = base;
      console.log(`${y} ${p.key}  (${usedSlug})`);
      console.log(`   ${base.map((b:any)=>`${b.name.replace(/ Sapphire| Refractor/g,'')} /${b.serial}`).join(', ')}`);
    }
  }
  if (process.argv.includes('--json')) {
    writeFileSync('scripts/_sapphire_ladders.json', JSON.stringify(out,null,1));
    console.log('\nwritten to scripts/_sapphire_ladders.json');
  }
}
main().catch((e)=>{console.error(String(e).slice(0,400));process.exit(1);});
