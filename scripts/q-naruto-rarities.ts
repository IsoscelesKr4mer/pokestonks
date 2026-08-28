import { listCardsInSet, listAllPrices } from './lib/narutodb';
(async()=>{
  const [cards,prices]=await Promise.all([listCardsInSet('NREA02'),listAllPrices()]);
  const pm=new Map(prices.map(p=>[p.card_number.toUpperCase(),p]));
  const by=new Map<string,any[]>();
  for(const c of cards){ if(!by.has(c.rarity_code)) by.set(c.rarity_code,[]); by.get(c.rarity_code)!.push(c); }
  console.log('NREA02 rarity codes as narutodb spells them:\n');
  for(const [code,list] of [...by].sort((a,b)=>b[1].length-a[1].length)){
    const ps=list.map(c=>pm.get(c.card_number.toUpperCase())?.price_last_cents).filter((x):x is number=>!!x).sort((a,b)=>a-b);
    const med=ps.length?`$${(ps[Math.floor(ps.length/2)]/100).toFixed(2)}`:'--';
    console.log(`  ${code.padEnd(6)} n=${String(list.length).padStart(3)}  median ${med.padStart(8)}   e.g. ${list[0].card_number}`);
  }
  console.log('\nevery UR-family card:');
  for(const c of cards.filter(c=>/UR/.test(c.rarity_code)).sort((a,b)=>a.card_number.localeCompare(b.card_number))){
    const p=pm.get(c.card_number.toUpperCase());
    console.log(`  ${c.card_number.padEnd(18)} ${c.rarity_code.padEnd(5)} ${String(c.character_name??'').padEnd(20)} ${p?.price_last_cents?'$'+(p.price_last_cents/100).toFixed(2):'--'}`);
  }
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
