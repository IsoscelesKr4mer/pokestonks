export {}; // makes this a module; without it the top-level const H is
           // global and collides with the other one-off query scripts
/** Price OP15-046 Sabo SR off TCGCSV (category 68 = One Piece Card Game). */
const H={headers:{'User-Agent':'pokestonks/1.0 (personal collection)','Accept':'application/json'}};
(async()=>{
  const groups:any=await(await fetch('https://tcgcsv.com/tcgplayer/68/groups',H)).json();
  const g=(groups.results||[]).filter((x:any)=>/OP-?15|OP15/i.test(x.abbreviation||'')||/OP15/i.test(x.name||''));
  console.log('OP15 groups:', g.map((x:any)=>`${x.groupId} ${x.abbreviation} ${x.name}`).join(' | ')||'none');
  const all=g.length?g:(groups.results||[]).slice(0,0);
  for(const grp of all){
    const [prods,prices]:any=await Promise.all([
      (await fetch(`https://tcgcsv.com/tcgplayer/68/${grp.groupId}/products`,H)).json(),
      (await fetch(`https://tcgcsv.com/tcgplayer/68/${grp.groupId}/prices`,H)).json(),
    ]);
    const pm=new Map((prices.results||[]).map((p:any)=>[p.productId,p]));
    const hits=(prods.results||[]).filter((p:any)=>/OP15-046/i.test(p.name)||/OP15-046/i.test((p.extendedData||[]).map((e:any)=>e.value).join(' ')));
    for(const h of hits){
      const pr:any=pm.get(h.productId);
      console.log(`  ${h.name}`);
      console.log(`     market $${pr?.marketPrice ?? '-'}   low $${pr?.lowPrice ?? '-'}   mid $${pr?.midPrice ?? '-'}`);
    }
    if(!hits.length) console.log(`  no OP15-046 in ${grp.name}`);
  }
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
