export {}; // makes this a module; without it the top-level const H is
           // global and collides with the other one-off query scripts
/** OP14-107 Shakuyaku and OP14-108 Silvers Rayleigh via TCGCSV (category 68).
 *  tcgcsv rejects the default fetch agent with an HTML page, so send a UA. */
const H={headers:{'User-Agent':'pokestonks/1.0 (personal collection)','Accept':'application/json'}};
(async()=>{
  const g:any=await(await fetch('https://tcgcsv.com/tcgplayer/68/groups',H)).json();
  const grp=(g.results||[]).filter((x:any)=>/OP-?14/i.test(x.abbreviation||''));
  for(const q of grp){
    const [p,pr]:any=await Promise.all([
      (await fetch(`https://tcgcsv.com/tcgplayer/68/${q.groupId}/products`,H)).json(),
      (await fetch(`https://tcgcsv.com/tcgplayer/68/${q.groupId}/prices`,H)).json()]);
    const pm=new Map((pr.results||[]).map((x:any)=>[x.productId,x]));
    for(const code of ['OP14-107','OP14-108']){
      const hits=(p.results||[]).filter((x:any)=>
        new RegExp(code,'i').test(x.name)||
        ((x.extendedData||[]).some((e:any)=>new RegExp(code,'i').test(String(e.value)))));
      for(const h of hits){
        const m:any=pm.get(h.productId);
        console.log(`${code}  ${h.name.slice(0,52).padEnd(52)} market $${m?.marketPrice ?? '-'}  low $${m?.lowPrice ?? '-'}`);
      }
      if(!hits.length) console.log(`${code}  not found in ${q.name}`);
    }
  }
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
