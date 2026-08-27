/**
 * Two Kevin McGonigle #16 X-Fractors sold in one order on 2026-08-26.
 *
 * Same shape as the Nick Kurtz case: the variation is SKU PYP-CHROME-344 at
 * qty 2 because build-pyp-group merges duplicate cards under the primary row.
 * Both physical copies sold, so BOTH rows book — #344 and #345.
 *
 * Date is PACIFIC: order is 2026-08-27 01:17 UTC = 2026-08-26 18:17 local.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const IDS=[344,345], PRICE=1599, DATE='2026-08-26', ORDER='20-15067-35760', ITEM='168622320644';
(async()=>{
  const rows:any = await sql`SELECT id, player, card_number, parallel, status, asking_price_cents, notes FROM baseball_cards WHERE id = ANY(${IDS}) ORDER BY id`;
  for(const r of rows) console.log(`#${r.id} ${r.player} ${r.card_number} ${r.parallel} | ${r.status} | ask $${(r.asking_price_cents/100).toFixed(2)}`);
  const todo = rows.filter((r:any)=>r.status!=='sold');
  console.log(`\n${todo.length} to book at $${(PRICE/100).toFixed(2)} each on ${DATE}`);
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  for(const r of todo){
    const note = `${r.notes ?? ''} Sold via eBay order ${ORDER} on ${DATE} (Pacific) for $${(PRICE/100).toFixed(2)}, you-pick listing ${ITEM}. Both copies of #16 X-Fractor went in one order; the variation is SKU PYP-CHROME-344 at qty 2, so #344 and #345 both book. Booked 2026-08-27.`.trim();
    await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${PRICE}, sold_date=${DATE}, notes=${note}, updated_at=now() WHERE id=${r.id}`;
    console.log(`  booked #${r.id}`);
  }
  const [t]:any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
  console.log(`baseball_cards lifetime: ${t.c} sold, $${(t.s/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
