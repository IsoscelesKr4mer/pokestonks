/**
 * Ascended Heroes booster bundle, Edmonds Safeway, 2026-08-31 13:25.
 *
 * The transcript ended "from safeway at uh 125". That is the TIME, not a price:
 *   - message stamped 20:28:17Z = 13:28 Pacific, so 13:25 is three minutes prior
 *   - :25 is a confirmed Edmonds Safeway drop mark (data/vending_machines.md)
 *   - every one of the 96+ prior vending bundles booked at exactly $30.00
 *   - the AH bundle markets at $84.59; no machine sells one for $1.25
 * Same misread happened on 2026-08-09 ("$2.16") and 2026-08-27 ("$2.25"), both
 * times the number was the clock.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CI = 76;                       // Ascended Heroes Booster Bundle
const COST = 3000;                   // standard vending flat
const DATE = '2026-08-31';
const NOTES = 'Edmonds Safeway 13:25, ON the :25 mark. Standard $30.00 vending bundle price. ' +
  'Voice note transcribed as "at uh 125" - that is the TIME (message stamped 20:28Z = 13:28 Pacific, ' +
  ':25 is a confirmed drop mark), not a price. Same misread as 2026-08-09 and 2026-08-27.';

async function main() {
  const item: any = await sql`SELECT id, name FROM catalog_items WHERE id=${CI}`;
  if (!item.length) throw new Error('catalog item missing');

  // guard against a double-log if this note gets replayed
  const dupe: any = await sql`
    SELECT id FROM purchases WHERE catalog_item_id=${CI} AND purchase_date=${DATE} AND deleted_at IS NULL`;
  if (dupe.length) { console.log(`already logged: purchase #${dupe[0].id}`); await sql.end(); return; }

  const uid: any = await sql`SELECT user_id FROM purchases WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const ins: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid[0].user_id}, ${CI}, ${DATE}, 1, ${COST}, 'Vending Machine', ${NOTES})
    RETURNING id`;
  console.log(`logged purchase #${ins[0].id}: ${item[0].name} x1 @ $${(COST / 100).toFixed(2)}, Vending Machine, ${DATE}`);

  const held: any = await sql`
    SELECT COALESCE(SUM(quantity),0) q FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  const sold: any = await sql`
    SELECT COALESCE(SUM(s.quantity),0) q FROM sales s JOIN purchases p ON p.id=s.purchase_id
    WHERE p.catalog_item_id=${CI} AND s.deleted_at IS NULL`;
  console.log(`AH bundles: ${held[0].q} bought, ${sold[0].q} sold -> ${held[0].q - sold[0].q} on hand`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
