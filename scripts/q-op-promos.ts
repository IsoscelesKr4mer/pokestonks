export {}; // module scope: these scripts have no imports, and without this TS
// treats them as global and their top-level main()/get() collide across files.
/** Price the two IB-07 promos off TCGCSV, the same source the vault syncs from. */
const WANT = new Set([709094, 709096, 694721]);
async function get(u: string) {
  const r = await fetch(u, { headers: { 'User-Agent': 'pokestonks/0.1' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return r.json() as any;
}
async function main(){
  const CAT = Number(process.argv[2] ?? 68);
  const groups = await get(`https://tcgcsv.com/tcgplayer/${CAT}/groups`);
  const gs = (groups.results ?? groups) as any[];
  console.log(`category ${CAT}: ${gs.length} groups`);
  for (const g of gs) {
    let list: any[];
    try { list = ((await get(`https://tcgcsv.com/tcgplayer/${CAT}/${g.groupId}/products`)).results ?? []) as any[]; }
    catch { continue; }
    const hits = list.filter((p) => WANT.has(Number(p.productId)));
    if (!hits.length) continue;
    const pl = ((await get(`https://tcgcsv.com/tcgplayer/${CAT}/${g.groupId}/prices`)).results ?? []) as any[];
    for (const h of hits) {
      console.log(`\n[${g.name}] ${h.name}  (id ${h.productId})`);
      const pr = pl.filter((x) => Number(x.productId) === Number(h.productId));
      if (!pr.length) { console.log('   no price row'); continue; }
      for (const x of pr) console.log(`   ${String(x.subTypeName).padEnd(12)} market ${x.marketPrice != null ? '$'+Number(x.marketPrice).toFixed(2) : '—'}  low ${x.lowPrice != null ? '$'+Number(x.lowPrice).toFixed(2) : '—'}`);
    }
  }
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
