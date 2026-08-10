import { readFileSync } from 'fs';
const CL = JSON.parse(readFileSync('data/checklists.json','utf8')) as Record<string,{sheet:string,num:string,player:string}[]>;
const CH='2026-Topps-Chrome-Baseball-Checklist-1.xlsx';
const FIN='2026-Topps-Finest-Baseball-Checklist.xlsx';
// Chrome base lowest numbers
const base=(CL[CH]||[]).filter(e=>e.sheet==='Base').filter(e=>/^\d+$/.test(e.num)).sort((a,b)=>Number(a.num)-Number(b.num)).slice(0,6);
console.log('Chrome Base #1-6:'); base.forEach(e=>console.log(`  #${e.num} ${e.player}`));
console.log('\nFinest sheets:',[...new Set((CL[FIN]||[]).map(e=>e.sheet))].join(' | '));
// any autographs sheet donovan
const autoSheets=(CL[FIN]||[]).filter(e=>/auto/i.test(e.sheet));
console.log('Finest auto-sheet sample:',autoSheets.slice(0,3).map(e=>`${e.sheet}#${e.num} ${e.player}`).join(' | '));
