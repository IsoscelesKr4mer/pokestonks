/**
 * Destined Rivals booster bundle, vending, 2026-09-03.
 *
 * Reported same day, time not recalled and machine not stated. Cost is not a
 * guess: every vending bundle he has ever bought booked at exactly $30.00
 * (96+ lots), so the flat is the only defensible figure. Machine goes into the
 * note once he says which one - he reported new marks for both Edmonds Safeway
 * (:01-:02 / :31-:32) and Shoreline Fred Meyer (:08 / :38) in the same message.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const COST = 3000;
const DATE = '2026-09-03';
const NOTES = 'Vending bundle, standard $30.00 flat. Time of day not recalled and the machine ' +
  'was not stated when reported - he gave new drop marks for both Edmonds Safeway and Shoreline ' +
  'Fred Meyer in the same message. Update this note with the machine once confirmed.';
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
  const px: any = await sql`SELECT market_price_cents, snapshot_date::text d FROM price_snapshots
    WHERE catalog_item_id=${ci[0].id} ORDER BY snapshot_date DESC LIMIT 1`;
  console.log(`DR bundles: bought ${b[0].q}, sold ${s[0].q}, on hand ${Number(b[0].q) - Number(s[0].q)}`);
  if (px.length) console.log(`latest market $${(px[0].market_price_cents/100).toFixed(2)} (${px[0].d})`);
  await sql.end();
})();
