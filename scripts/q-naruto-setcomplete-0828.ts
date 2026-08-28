import { readFileSync } from 'fs';
import { listCardsInSet } from './lib/narutodb';
(async()=>{
  const lines=readFileSync('data/naruto_cards_0828.tsv','utf8').trim().split(/\r?\n/).slice(1);
  const have=new Set<string>();
  for(const l of lines){ const c=(l.split('\t')[1]||'').replace('-DUR-','-◇UR-'); if(c&&c!=='?') have.add(c.toUpperCase()); }
  const cards=await listCardsInSet('NREA02');
  const byTier=new Map<string,string[]>();
  for(const c of cards){ if(!byTier.has(c.rarity_code)) byTier.set(c.rarity_code,[]); byTier.get(c.rarity_code)!.push(c.card_number.toUpperCase()); }
  console.log('tier   have / in set   missing');
  for(const t of ['CR','AR','MR','◇UR','UR','SSR','SR','R','PR']){
    const all=byTier.get(t)??[]; if(!all.length) continue;
    const got=all.filter(n=>have.has(n));
    const miss=all.filter(n=>!have.has(n)).map(n=>n.split('-')[2]);
    console.log(`${t.padEnd(5)} ${String(got.length).padStart(3)} / ${String(all.length).padStart(3)}      ${got.length===all.length?'*** COMPLETE ***':miss.slice(0,12).join(' ')+(miss.length>12?` +${miss.length-12}`:'')}`);
  }
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
