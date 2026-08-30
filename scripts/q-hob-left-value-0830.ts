/** Live Scryfall value of what is still unsold on the Hobbit you-pick. */
const LEFT: [string, number, boolean][] = [
  ['Attercop',116,false],['Confusticate and Bebother',35,false],['Crude Bent Blade',63,true],
  ['Desert Were-Worm',92,false],['Dwarven Shortsword',10,false],['Dwarven Shortsword',10,true],
  ["Elvenking's Halls",182,false],["Elvenking's Harper",38,false],["Galion, Elvenking's Butler",125,false],
  ['Goblin Plate Mail',157,false],['Goblin-town Flunkies',100,false],['Gundabad Opportunist',101,false],
  ['Human Soldier Token',2,false],['Key to the Side-Door',175,false],['Lake-town Lookout',18,false],
  ['Lakeshore Apothecary',43,false],['Moment of Glory',21,false],["Old Fat Spider Can't See Me",50,false],
  ['Ordinary Bear',133,false],['Patient Instructor',162,false],['Plains',189,true],
  ['Ragged Short Spear',108,false],['Ravenhill Flock',52,false],['Reverent Howl',81,false],
  ['Silvan Reveler',163,false],['Stony-Voiced Goblins',85,false],['The Lonely Mountain',187,false],
  ["The Mountain-king's Return",22,false],
];
const H={headers:{'User-Agent':'pokestonks/1.0 (personal collection)','Accept':'application/json'}};
(async()=>{
  let total=0, missing=0; const rows:any[]=[];
  for(const [name,num,foil] of LEFT){
    const r=await fetch(`https://api.scryfall.com/cards/hob/${num}`,H);
    if(!r.ok){ missing++; rows.push({name,num,foil,usd:null}); continue; }
    const c:any=await r.json();
    const usd=foil ? Number(c.prices?.usd_foil ?? 0) : Number(c.prices?.usd ?? 0);
    total+=usd; rows.push({name:c.name,num,foil,usd});
    await new Promise(s=>setTimeout(s,90)); // Scryfall asks for ~10 req/s max
  }
  rows.sort((a,b)=>(b.usd??0)-(a.usd??0));
  for(const r of rows) console.log(`  $${(r.usd??0).toFixed(2).padStart(6)}  #${String(r.num).padEnd(4)} ${r.foil?'FOIL ':'     '}${r.name}`);
  console.log(`\n${LEFT.length} cards still unsold`);
  console.log(`Scryfall total: $${total.toFixed(2)}   average $${(total/LEFT.length).toFixed(2)} per card`);
  console.log(`Listed ask:     $${(LEFT.length*1.49).toFixed(2)} (all at the $1.49 floor)`);
  if(missing) console.log(`${missing} not found on Scryfall`);
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
