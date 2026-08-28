/** What would a single you-pick holding EVERY card look like? */
import { readFileSync } from 'fs';
import { listCardsInSet, listAllPrices, priceConfidence } from './lib/narutodb';
const ask=(c:number)=>Math.max(299,Math.ceil((c*1.15)/50)*50-1);
(async()=>{
  const lines=readFileSync('data/naruto_cards_0828.tsv','utf8').trim().split(/\r?\n/).filter(l=>!l.startsWith('#')).slice(1);
  const n=new Map<string,number>();
  for(const l of lines){ const c=(l.split('\t')[1]||'').replace('-DUR-','-◇UR-').toUpperCase(); if(c&&c!=='?') n.set(c,(n.get(c)??0)+1); }
  const [cards,prices]=await Promise.all([listCardsInSet('NREA02'),listAllPrices()]);
  const pm=new Map(prices.map(p=>[p.card_number.toUpperCase(),p]));
  let rows=0,copies=0,askTot=0,phRows=0;
  const byTier:Record<string,{rows:number;copies:number;ask:number}>={};
  for(const [code,qty] of n){
    const card=cards.find(c=>c.card_number.toUpperCase()===code); if(!card) continue;
    const p=pm.get(code); const a=ask(p?.price_last_cents??0);
    rows++; copies+=qty; askTot+=a*qty;
    if(priceConfidence(p)==='placeholder') phRows++;
    const t=card.rarity_code; byTier[t]??={rows:0,copies:0,ask:0};
    byTier[t].rows++; byTier[t].copies+=qty; byTier[t].ask+=a*qty;
  }
  console.log(`ALL-IN you-pick: ${rows} dropdown rows, ${copies} cards, $${(askTot/100).toFixed(2)} total ask`);
  console.log(`(his 2026 Chrome you-pick already runs 165 rows, so 93 is not near any limit)\n`);
  for(const [t,v] of Object.entries(byTier)) console.log(`  ${t.padEnd(5)} ${String(v.rows).padStart(2)} rows / ${String(v.copies).padStart(3)} cards  $${(v.ask/100).toFixed(2).padStart(8)}`);
  console.log(`\n${phRows} of ${rows} rows priced off a narutodb PLACEHOLDER, not a real comp`);
  console.log(`\nvs current three listings: $248.90 + $24.99 + $29.99 = $303.88`);
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
