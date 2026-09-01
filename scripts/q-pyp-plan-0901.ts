import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const GROUPS: Record<string,string> = {
  '2026 Topps Chrome': '168622320644',
  '2026 Topps Chrome (Wrecking Crew insert)': '168617438056',
  '2026 Topps Chrome (1991 Topps Baseball insert)': '168617438091',
  '2026 Topps Chrome (Big Ticket Players insert)': '168617438107',
  '2026 Topps Chrome (Past to Present insert)': '168617438176',
  '2026 Topps Chrome (Future Stars insert)': '168617438146',
  '2026 Topps Chrome (Chrome Rivals insert)': '168617438132',
};
async function main(){
  for (const [set, item] of Object.entries(GROUPS)) {
    const cur:any = await sql`
      SELECT count(*) rows, count(DISTINCT card_number||'|'||parallel) vars
      FROM baseball_cards WHERE ebay_item_id=${item} AND coalesce(sold_price_cents,0)=0`;
    const inc:any = await sql`
      SELECT count(*) rows, count(DISTINCT card_number||'|'||parallel) vars
      FROM baseball_cards WHERE set_name=${set} AND ebay_item_id IS NULL AND status='photographed'
        AND notes LIKE '%2026-08-31%'`;
    const newvars:any = await sql`
      SELECT count(DISTINCT card_number||'|'||parallel) v FROM baseball_cards n
      WHERE n.set_name=${set} AND n.ebay_item_id IS NULL AND n.notes LIKE '%2026-08-31%'
        AND NOT EXISTS (SELECT 1 FROM baseball_cards o
                        WHERE o.ebay_item_id=${item} AND coalesce(o.sold_price_cents,0)=0
                          AND o.card_number=n.card_number AND o.parallel=n.parallel)`;
    const after = Number(cur[0].vars)+Number(newvars[0].v);
    const flag = after>250 ? '  *** OVER THE 250 VARIATION CAP ***' : '';
    console.log(`${item} | ${set}`);
    console.log(`   live ${cur[0].rows} cards / ${cur[0].vars} variations`);
    console.log(`   incoming ${inc[0].rows} cards / ${inc[0].vars} distinct`);
    console.log(`   -> ${newvars[0].v} NEW variations, ${Number(inc[0].rows)-Number(newvars[0].v)} become extra qty`);
    console.log(`   after: ${after} variations${flag}\n`);
  }
  const orphan:any = await sql`
    SELECT set_name, count(*) c FROM baseball_cards
    WHERE ebay_item_id IS NULL AND notes LIKE '%2026-08-31%'
      AND set_name NOT IN (${sql(Object.keys(GROUPS))}) GROUP BY 1`;
  console.log('incoming with NO group to join:');
  if(!orphan.length) console.log('  none');
  orphan.forEach((r:any)=>console.log(`  ${r.c}  ${r.set_name}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
