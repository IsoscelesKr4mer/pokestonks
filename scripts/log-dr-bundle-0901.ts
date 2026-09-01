/**
 * Destined Rivals booster bundle, Edmonds Safeway, 2026-09-01 14:25.
 *
 * "at $225" is the TIME, not a price, for the fourth time now:
 *   - message stamped 21:42:23Z = 14:42 Pacific, so 14:25 is 17 minutes prior
 *   - :25 is a confirmed Edmonds Safeway drop mark (data/vending_machines.md)
 *   - every vending bundle he has ever bought booked at exactly $30.00
 *   - no machine sells a bundle for $2.25, and $225 is 6x its market
 * Same misread as 2026-08-09 ("$2.16"), 08-27 ("$2.25") and 08-31 ("125").
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const COST = 3000;
const DATE = '2026-09-01';
const NOTES = 'Edmonds Safeway 14:25, ON the :25 mark. Standard $30.00 vending bundle price. ' +
  'Voice note transcribed as "at $225" - that is the TIME (message stamped 21:42Z = 14:42 Pacific, ' +
  ':25 is a confirmed drop mark), not a price. Fourth time this transcription has happened.';
(async () => {
  const ci: any = await sql`SELECT id, name FROM catalog_items
    WHERE name ILIKE '%destined rivals%' AND product_type ILIKE '%bundle%'
      AND name NOT ILIKE '%case%' AND name NOT ILIKE '%display%' ORDER BY id LIMIT 5`;
  ci.forEach((c: any) => console.log(`  candidate ci${c.id} ${c.name}`));
  if (ci.length !== 1) { console.error('ambiguous catalog item, not logging'); process.exit(1); }
  const dupe: any = await sql`SELECT id FROM purchases
    WHERE catalog_item_id=${ci[0].id} AND purchase_date=${DATE} AND deleted_at IS NULL`;
  if (dupe.length) { console.log(`already logged: purchase #${dupe[0].id}`); await sql.end(); return; }
  const uid: any = await sql`SELECT user_id FROM purchases WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const ins: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid[0].user_id}, ${ci[0].id}, ${DATE}, 1, ${COST}, 'Vending Machine', ${NOTES}) RETURNING id`;
  console.log(`\nlogged purchase #${ins[0].id}: ${ci[0].name} x1 @ $30.00, Vending Machine, ${DATE}`);
  const b: any = await sql`SELECT coalesce(sum(quantity),0) q FROM purchases WHERE catalog_item_id=${ci[0].id} AND deleted_at IS NULL`;
  const s: any = await sql`SELECT coalesce(sum(s.quantity),0) q FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=${ci[0].id}`;
  console.log(`DR bundles: bought ${b[0].q}, sold ${s[0].q}, on hand ${Number(b[0].q) - Number(s[0].q)}`);
  await sql.end();
})();
