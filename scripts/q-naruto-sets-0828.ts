import { readFileSync } from 'fs';
import { listCardsInSet } from './lib/narutodb';
(async()=>{
  const lines=readFileSync('data/naruto_cards_0828.tsv','utf8').trim().split(/\r?\n/).filter(l=>!l.startsWith('#')).slice(1);
  const n=new Map<string,number>();
  for(const l of lines){ const c=(l.split('\t')[1]||'').replace('-DUR-','-◇UR-').toUpperCase(); if(c&&c!=='?') n.set(c,(n.get(c)??0)+1); }
  const cards=await listCardsInSet('NREA02');
  for(const tier of ['SR','R']){
    const all=cards.filter(c=>c.rarity_code===tier).map(c=>c.card_number.toUpperCase());
    const counts=all.map(c=>n.get(c)??0);
    const have=counts.filter(x=>x>0).length;
    const min=Math.min(...counts);
    const total=counts.reduce((a,b)=>a+b,0);
    console.log(`${tier}: ${have}/${all.length} distinct, ${total} copies, complete sets buildable = ${min}`);
    if(min>0){ console.log(`   leftovers after ${min} full set(s): ${total-min*all.length} cards`); }
    else {
      const missing=all.filter(c=>!n.get(c)).map(c=>c.split('-')[2]);
      console.log(`   missing ${missing.length}: ${missing.join(' ')}`);
    }
    const dist=all.map(c=>`${c.split('-')[2]}x${n.get(c)??0}`).join(' ');
    console.log(`   ${dist}\n`);
  }
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
