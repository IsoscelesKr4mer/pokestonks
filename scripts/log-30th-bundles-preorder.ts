/**
 * Log the two Pokemon Center pre-orders of 30th Celebration Booster Bundles.
 *
 * Order screenshot: "Pokémon TCG: 30th Celebration Booster Bundle (6 Packs)",
 * SKU 10-10451-115, qty 3 @ $26.94 = $80.82 + $0.00 shipping + $8.64 tax = $89.46.
 * Michael placed that order TWICE, so 6 bundles for $178.92 all in.
 *
 * Per-unit tax-in: $89.46 / 3 = $29.82.
 *
 * Booked as two lots of 3 to mirror the two separate orders rather than one lot
 * of 6, so FIFO stays honest if only one of them lands.
 *
 *   npx tsx scripts/log-30th-bundles-preorder.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const CI = 133883;
const UNIT = 2982;
const DATE = '2026-07-15';
const NOTES = 'Pokemon Center online pre-order, inbound; release 2026-09-16. Order was 3x @ $26.94 = $80.82 + $0.00 shipping + $8.64 tax = $89.46, so $29.82/bundle tax-in. Michael placed this same order TWICE (6 bundles, $178.92 all in), booked as two lots of 3. SKU 10-10451-115. DATE ASSUMED to match his other 30th pre-orders (pu468-471, 2026-07-15) — the screenshot carried no date, correct it if the orders were placed on different days.';
async function main(){
  const [ci]:any = await sql`SELECT id, name, product_type FROM catalog_items WHERE id=${CI}`;
  console.log(`ci${ci.id} ${ci.name} [${ci.product_type}]`);
  console.log(`  2 lots x 3 @ $${(UNIT/100).toFixed(2)} = $${(UNIT*6/100).toFixed(2)} total, date ${DATE}, source Pokemon Center`);
  const [dupe]:any = await sql`SELECT COUNT(*)::int n FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  console.log(`  existing lots for this item: ${dupe.n}`);
  if(dupe.n > 0){ console.error('  REFUSING: purchases already exist for this catalog item, check before double-logging'); process.exit(1); }
  if(!APPLY){ console.log('\ndry run'); await sql.end(); return; }
  const r:any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${UID}, ${CI}, ${DATE}, 3, ${UNIT}, 'Pokemon Center', ${NOTES}),
           (${UID}, ${CI}, ${DATE}, 3, ${UNIT}, 'Pokemon Center', ${NOTES})
    RETURNING id, quantity, cost_cents`;
  r.forEach((x:any)=>console.log(`  logged pu${x.id}: q${x.quantity} @ $${(x.cost_cents/100).toFixed(2)}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
