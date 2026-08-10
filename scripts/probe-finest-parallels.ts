import { readFileSync } from 'fs';
const CL = JSON.parse(readFileSync('data/checklists.json','utf8')) as Record<string,{sheet:string,num:string,player:string}[]>;
const FIN='2026-Topps-Finest-Baseball-Checklist.xlsx';
const norm=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
for(const name of ['Devers','Wheeler','Guzman','Eldridge','Baldwin']){
  const hits=(CL[FIN]||[]).filter(e=>norm(e.player).includes(norm(name)));
  console.log(`${name}:`, hits.map(h=>`[${h.sheet}]#${h.num} ${h.player}`).join(' | ')||'(none)');
}
console.log('\nAll Finest sheets:', [...new Set((CL[FIN]||[]).map(e=>e.sheet))].join(' | '));
