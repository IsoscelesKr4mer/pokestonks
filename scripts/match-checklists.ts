import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');
const CL = JSON.parse(readFileSync('data/checklists.json','utf8')) as Record<string,{sheet:string,num:string,player:string}[]>;
const norm=(s:string)=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
function files(card:any):string[]{
  const s=(card.set_name||'').toLowerCase(); const y=card.year;
  if(s.includes('topps chrome')&&String(y)==='2026') return ['2026-Topps-Chrome-Baseball-Checklist-1.xlsx'];
  if(s.includes('finest')&&String(y)==='2026') return ['2026-Topps-Finest-Baseball-Checklist.xlsx'];
  if(s.includes('bowman chrome prospects')||(s.includes('2026 bowman'))) return ['2026-Bowman-Baseball-Checklist.xlsx'];
  if(s.includes('sapphire')){ // search all sapphire files
    return Object.keys(CL).filter(f=>/sapphire/i.test(f));
  }
  return [];
}
function lookup(card:any){
  const target=norm(card.player);
  const parts=card.player.split('/').map((p:string)=>norm(p)).filter(Boolean);
  const hits:{file:string,num:string,player:string}[]=[];
  for(const f of files(card)){
    for(const e of CL[f]||[]){
      const ep=norm(e.player);
      if(ep===target || parts.some((p:string)=>ep===p) || (parts.length>1 && parts.every((p:string)=>target.includes(p)))){
        hits.push({file:f,num:e.num,player:e.player});
      }
    }
  }
  return hits;
}
async function main(){
  const cards=await sql`SELECT id,player,set_name,year,card_number,parallel,for_sale FROM baseball_cards ORDER BY id`;
  let back=0, verifyOk=0, mismatch=0, ambiguous=0, nofile=0, nomatch=0;
  const report:string[]=[];
  for(const c of cards){
    if(files(c).length===0){ if(!c.card_number) nofile++; continue; }
    const hits=lookup(c);
    const nums=[...new Set(hits.map(h=>h.num))];
    if(hits.length===0){ if(!c.card_number){ nomatch++; report.push(`NOMATCH id${c.id} ${c.player} [${c.set_name}]`);} continue; }
    if(!c.card_number){
      if(nums.length===1){ back++; report.push(`BACKFILL id${c.id} ${c.player} -> #${nums[0]} (${hits[0].file.replace('-Baseball-Checklist','').replace('.xlsx','')})`);
        if(APPLY) await sql`UPDATE baseball_cards SET card_number=${nums[0]} WHERE id=${c.id}`;
      } else { ambiguous++; report.push(`AMBIG id${c.id} ${c.player} -> ${nums.join('/')} across ${[...new Set(hits.map(h=>h.file.slice(0,9)))].join(',')}`); }
    } else {
      if(nums.includes(String(c.card_number))) verifyOk++;
      else { mismatch++; report.push(`MISMATCH id${c.id} ${c.player} DB#${c.card_number} vs checklist ${nums.join('/')}`); }
    }
  }
  console.log(`APPLY=${APPLY} | backfilled:${back} verifyOK:${verifyOk} mismatch:${mismatch} ambiguous:${ambiguous} noChecklist:${nofile} noMatch:${nomatch}`);
  console.log(report.join('\n'));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
