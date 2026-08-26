/**
 * Book the Nick Kurtz Perspectives P-3 that sold 2026-08-25.
 *
 *   npx tsx scripts/book-card-sales-0826.ts --apply
 *
 * SUBTLETY WORTH KEEPING: the eBay SKU is `PYP-P-371`, but row #371 was already
 * booked sold on 2026-08-20. That is not a double-sale — he owns TWO copies of
 * P-3 (rows #317 and #371) and build-pyp-group.ts merges duplicates into ONE
 * dropdown row named after the "primary" row, at qty 2. The live variation reads
 * qty 2 / sold 2, so this second sale belongs to the OTHER row, #317.
 *
 * A you-pick SKU names the primary row, not the row that sold. Always book
 * against the copy that is still unsold.
 *
 * Date is PACIFIC: the order is 2026-08-26 00:34 UTC = 2026-08-25 17:34 local.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ID = 317, PRICE = 349, DATE = '2026-08-25', ORDER = '02-15095-93013', ITEM = '168617438227';
(async()=>{
  const [row]:any = await sql`SELECT id, player, card_number, parallel, status, asking_price_cents, notes FROM baseball_cards WHERE id=${ID}`;
  console.log(`#${row.id} ${row.player} ${row.card_number} ${row.parallel} | status=${row.status} ask=$${(row.asking_price_cents/100).toFixed(2)}`);
  if(row.status === 'sold'){ console.error('already sold, nothing to do'); process.exit(1); }
  console.log(`  -> sold $${(PRICE/100).toFixed(2)} on ${DATE} (order ${ORDER})`);
  if(!APPLY){ console.log('dry run'); await sql.end(); return; }
  const note = `${row.notes} Sold via eBay order ${ORDER} on ${DATE} (Pacific) for $${(PRICE/100).toFixed(2)}, you-pick listing ${ITEM}. SECOND copy of P-3; the variation is SKU PYP-P-371 at qty 2 because build-pyp-group merges duplicates under the primary row, so this sale books against #317 not #371. Booked 2026-08-26.`;
  await sql`UPDATE baseball_cards SET status='sold', for_sale=false, sold_price_cents=${PRICE}, sold_date=${DATE}, notes=${note}, updated_at=now() WHERE id=${ID}`;
  const [chk]:any = await sql`SELECT status, for_sale, sold_price_cents, sold_date::text sd FROM baseball_cards WHERE id=${ID}`;
  console.log(`  #${ID} now: ${chk.status}, for_sale=${chk.for_sale}, $${(chk.sold_price_cents/100).toFixed(2)} on ${chk.sd}`);
  const [tot]:any = await sql`SELECT COUNT(*)::int c, SUM(sold_price_cents)::int s FROM baseball_cards WHERE status='sold'`;
  console.log(`baseball_cards lifetime: ${tot.c} sold, $${(tot.s/100).toFixed(2)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
