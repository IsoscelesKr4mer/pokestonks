/**
 * Per-insert inventory of the 2026 Topps Chrome insert sets, for checking the
 * vault against the physical team bags.
 *   npx tsx scripts/insert-inventory.ts
 * Sold cards are listed separately: they are not in the bags any more.
 */
import postgres from 'postgres'; import { config } from 'dotenv';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { ssl:'require' });

function codeSort(a:string,b:string){
  const na=Number((a.match(/-(\d+)$/)||[])[1] ?? 1e9), nb=Number((b.match(/-(\d+)$/)||[])[1] ?? 1e9);
  return na-nb || a.localeCompare(b);
}
async function main(){
  const rows:any = await sql`select id, player, set_name, card_number, parallel, status
    from baseball_cards where set_name like '2026 Topps Chrome (%insert)' order by set_name`;
  const bySet = new Map<string, any[]>();
  for(const r of rows) { const k=r.set_name.replace('2026 Topps Chrome (','').replace(' insert)',''); (bySet.get(k) ?? bySet.set(k,[]).get(k))!.push(r); }

  let held=0, sold=0;
  const order=[...bySet.keys()].sort((a,b)=>bySet.get(b)!.filter(r=>r.status!=='sold').length - bySet.get(a)!.filter(r=>r.status!=='sold').length);
  for(const k of order){
    const all=bySet.get(k)!;
    const inHand=all.filter(r=>r.status!=='sold').sort((x,y)=>codeSort(x.card_number,y.card_number));
    const gone=all.filter(r=>r.status==='sold');
    held+=inHand.length; sold+=gone.length;
    // count duplicate codes so the bag check is easy
    const seen=new Map<string,number>();
    for(const r of inHand) seen.set(r.card_number,(seen.get(r.card_number)??0)+1);
    console.log(`\n${k.toUpperCase()} - ${inHand.length} in hand`);
    const printed=new Set<string>();
    for(const r of inHand){
      if(printed.has(r.card_number)) continue;
      const n=seen.get(r.card_number)!;
      printed.add(r.card_number);
      console.log(`  ${r.card_number.padEnd(9)} ${r.player}${n>1?`   x${n}`:''}`);
    }
    for(const r of gone) console.log(`  ${r.card_number.padEnd(9)} ${r.player}   (SOLD, not in bags)`);
  }
  console.log(`\nTOTAL in hand: ${held}    sold: ${sold}`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1)});
