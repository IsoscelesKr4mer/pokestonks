export {}; // module scope: these scripts have no imports, and without this TS
// treats them as global and their top-level main()/get() collide across files.
/** Every One Piece Illustration Box on TCGCSV, to test the "older ones went up" thesis. */
async function get(u: string) {
  const r = await fetch(u, { headers: { 'User-Agent': 'pokestonks/0.1' } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as any;
}
async function main(){
  const CAT = 68;
  const groups = ((await get(`https://tcgcsv.com/tcgplayer/${CAT}/groups`)).results ?? []) as any[];
  const found: any[] = [];
  for (const g of groups) {
    let list: any[];
    try { list = ((await get(`https://tcgcsv.com/tcgplayer/${CAT}/${g.groupId}/products`)).results ?? []) as any[]; }
    catch { continue; }
    const ibs = list.filter((p) => /illustration box/i.test(p.name) && !/vol\.?\s*7/i.test(p.name) === false || /illustration box/i.test(p.name));
    const boxes = list.filter((p) => /illustration box/i.test(p.name) && /vol/i.test(p.name) && !/silvers|shakuyaku|\(/i.test(p.name.replace(/\(one piece card game illustration box[^)]*\)/i,'')));
    const cands = list.filter((p)=>/^one piece card game illustration box vol\.?\s*\d+$/i.test(p.name.trim()));
    if (!cands.length) continue;
    const pl = ((await get(`https://tcgcsv.com/tcgplayer/${CAT}/${g.groupId}/prices`)).results ?? []) as any[];
    for (const p of cands) {
      const pr = pl.filter((x) => Number(x.productId) === Number(p.productId));
      for (const x of pr) found.push({ name: p.name, group: g.name, market: x.marketPrice, low: x.lowPrice, sub: x.subTypeName });
    }
  }
  found.sort((a,b)=>a.name.localeCompare(b.name, 'en', {numeric:true}));
  console.log('One Piece Illustration Boxes on TCGCSV:');
  for (const f of found) {
    console.log(`  ${f.name.padEnd(48)} market ${f.market!=null?'$'+Number(f.market).toFixed(2):'—'}  low ${f.low!=null?'$'+Number(f.low).toFixed(2):'—'}`);
  }
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
