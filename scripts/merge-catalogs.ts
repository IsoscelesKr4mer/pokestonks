import { readFileSync, writeFileSync } from 'fs';
const D='C:/Users/Michael/AppData/Local/Temp/claude/C--Users-Michael-Documents-Claude-Pokemon-Portfolio/d6249d3c-0281-4963-b522-3afbfde0cbd8/scratchpad';
const a=JSON.parse(readFileSync(D+'/catalog_A.json','utf8'));
const b=JSON.parse(readFileSync(D+'/catalog_B.json','utf8'));
const all=[...a,...b];
writeFileSync(D+'/catalog_merged.json',JSON.stringify(all,null,1));
console.log(`merged: ${all.length} (A ${a.length} + B ${b.length})`);
const bySet:Record<string,number>={}; let lowConf=0, looseBack=0, looseFront=0, newCard=0;
for(const c of all){ bySet[c.set_name]=(bySet[c.set_name]||0)+1; if(c.confidence==='low')lowConf++; if(c.kind==='loose_back')looseBack++; if(c.kind==='loose_front')looseFront++; if(c.kind==='new_card')newCard++; }
console.log('by set:',JSON.stringify(bySet,null,0));
console.log(`new_card ${newCard} | loose_front ${looseFront} | loose_back ${looseBack} | low-conf ${lowConf}`);
console.log('\nlow-confidence (parallel):');
for(const c of all.filter((x:any)=>x.confidence==='low')) console.log(`  ${c.front_img||c.back_img} ${c.player} #${c.card_number} [${c.parallel}] - ${c.notes}`);
