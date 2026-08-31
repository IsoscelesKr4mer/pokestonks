/**
 * One of the three Pete Crow-Armstrong #45 base cards sold.
 * Order 09-15101-65580, 2026-08-30 13:55Z = 06:55 Pacific, so the PACIFIC date
 * is 2026-08-30. $14.49.
 *
 * All three rows are identical copies on one listing, so which row books is
 * arbitrary; taking the lowest id keeps it deterministic. The other two stay
 * listed.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const PRICE=1449, DATE='2026-08-30', ORDER='09-15101-65580', ITEM='168584893860';
(async()=>{
  const rows:any = await sql`SELECT id, card_number, parallel, status, notes FROM baseball_cards
    WHERE player ILIKE '%Crow-Armstrong%' AND card_number='45' AND status='listed' AND for_sale
    ORDER BY id`;
  console.log(`${rows.length} PCA #45 still listed: ${rows.map((r:any)=>'#'+r.id).join(', ')}`);
  if(!rows.length){ console.log('nothing to book'); await sql.end(); return; }
  const t=rows[0];
  console.log(`booking #${t.id} at $${(PRICE/100).toFixed(2)} on ${DATE}`);
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  const note=`${t.notes ?? ''} Sold via eBay order ${ORDER} on ${DATE} (Pacific; order stamped 13:55Z) for $${(PRICE/100).toFixed(2)} off listing ${ITEM}. One of three identical copies on that listing; the other two remain listed. Booked 2026-08-31.`.trim();
  await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${PRICE},
    sold_date=${DATE}, notes=${note}, updated_at=now() WHERE id=${t.id}`;
  const [left]:any = await sql`SELECT COUNT(*)::int c FROM baseball_cards
    WHERE player ILIKE '%Crow-Armstrong%' AND card_number='45' AND status='listed' AND for_sale`;
  const [tot]:any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
  console.log(`booked. PCA #45 still listed: ${left.c}`);
  console.log(`baseball_cards lifetime: ${tot.c} sold, $${(tot.s/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
