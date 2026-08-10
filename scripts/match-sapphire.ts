import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const CL = JSON.parse(readFileSync('data/checklists.json','utf8')) as Record<string,{sheet:string,num:string,player:string}[]>;
const norm=(s:string)=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
async function main(){
  const cards=await sql`SELECT id,player,set_name,year,card_number,parallel FROM baseball_cards WHERE for_sale=false AND card_number IS NULL AND set_name ILIKE '%sapphire%' ORDER BY id`;
  const assign:{id:number,num:string,file:string}[]=[]; const flag:string[]=[];
  for(const c of cards){
    const y=String(c.year);
    const cand=Object.keys(CL).filter(f=>/sapphire/i.test(f)&&f.startsWith(y));
    if(cand.length===0){ flag.push(`FLAG id${c.id} ${c.player} y${y} — no ${y} checklist`); continue; }
    const t=norm(c.player); const hits:{num:string,file:string}[]=[];
    for(const f of cand) for(const e of CL[f]) if(norm(e.player)===t) hits.push({num:e.num,file:f});
    const nums=[...new Set(hits.map(h=>h.num))];
    if(nums.length===1){ assign.push({id:c.id,num:nums[0],file:hits[0].file}); }
    else if(nums.length===0){ flag.push(`FLAG id${c.id} ${c.player} y${y} — not found in ${y} sapphire`); }
    else { flag.push(`FLAG id${c.id} ${c.player} y${y} — ${nums.join(' / ')} (draft vs flagship)`); }
  }
  console.log('=== WILL ASSIGN (unique code within card year) ===');
  for(const a of assign){ const c=cards.find(x=>x.id===a.id)!; console.log(`  id${a.id} ${c.player} -> #${a.num}  [${a.file.replace('-Baseball-Checklist','').replace('.xlsx','')}]`); }
  console.log('\n=== FLAG (ambiguous / not covered) ===');
  flag.forEach(f=>console.log('  '+f));
  console.log(`\nassign:${assign.length} flag:${flag.length}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
