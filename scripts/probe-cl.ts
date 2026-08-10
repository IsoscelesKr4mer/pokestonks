import { readFileSync } from 'fs';
const CL = JSON.parse(readFileSync('data/checklists.json','utf8')) as Record<string,{sheet:string,num:string,player:string}[]>;
function show(file:string, name:string){
  const rows=(CL[file]||[]).filter(e=>e.player.toLowerCase().includes(name.toLowerCase()));
  console.log(`\n=== ${name} in ${file} ===`);
  for(const r of rows) console.log(`  [${r.sheet}] #${r.num}  ${r.player}`);
}
const CH='2026-Topps-Chrome-Baseball-Checklist-1.xlsx';
const FIN='2026-Topps-Finest-Baseball-Checklist.xlsx';
show(CH,'Ohtani'); show(CH,'Sal Stewart'); show(CH,'Chase Burns'); show(CH,'Mike Trout'); show(CH,'Julio Rodriguez'); show(CH,'Roman Anthony'); show(CH,'Murakami');
show(FIN,'Murakami'); show(FIN,'Donovan'); show(FIN,'Justin Crawford');
// distinct insert sheet names in chrome
const sheets=[...new Set((CL[CH]||[]).map(e=>e.sheet))];
console.log('\nChrome sheets:',sheets.join(' | '));
