import { readFileSync } from 'fs';
import { listAllPrices, priceConfidence } from './lib/narutodb';
(async()=>{
  const lines=readFileSync('data/naruto_cards_0828.tsv','utf8').trim().split(/\r?\n/).slice(1);
  const prices=await listAllPrices();
  const pm=new Map(prices.map(p=>[p.card_number.toUpperCase(),p]));
  let real=0, ph=0, none=0;
  const byTier:Record<string,{real:number;ph:number}>={};
  for(const l of lines){
    const code=(l.split('\t')[1]||'').replace('-DUR-','-◇UR-');
    if(!code||code==='?') continue;
    const p=pm.get(code.toUpperCase());
    const c=priceConfidence(p);
    const v=p?.price_last_cents??0;
    const tier=code.split('-')[1];
    byTier[tier]??={real:0,ph:0};
    if(c==='placeholder'){ph+=v;byTier[tier].ph+=v;}
    else if(c==='none'){none++;}
    else {real+=v;byTier[tier].real+=v;}
  }
  console.log('tier    real comps   placeholder');
  for(const [t,v] of Object.entries(byTier)) console.log(`${t.padEnd(6)} $${(v.real/100).toFixed(2).padStart(8)}   $${(v.ph/100).toFixed(2).padStart(8)}`);
  console.log(`\nTOTAL  $${(real/100).toFixed(2)} on real comps + $${(ph/100).toFixed(2)} placeholder = $${((real+ph)/100).toFixed(2)}`);
  console.log(`${none} cards with no price at all`);
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
