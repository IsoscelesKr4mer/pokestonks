/**
 * The DR bundle he owns that was never logged.
 *
 * "i probably bought one that i forgot to log but i am literally looking at 8
 * boxes right now." The physical count wins: nine logged buys matched drop_log
 * one for one and both sales verified, so the gap is a missed purchase rather
 * than a phantom sale.
 *
 * Follows the "found in the car" precedent (pu597, pu598): source Unknown,
 * unknown_cost=true, purchase_date = the day it was discovered, and the cost
 * set to the standard vending flat. $30.00 is not invented here, it is what all
 * nine of his other DR bundles cost and what every vending bundle costs.
 *
 * NO drop_log row. The date and machine are genuinely unknown, and a made-up
 * row would corrupt the drop-timing analysis that log exists for.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const CI = 17235, COST = 3000, DATE = '2026-09-01';
const NOTES = 'UNLOGGED PURCHASE, reconstructed 2026-09-01 from a physical count. Michael counted 8 bundles ' +
  'against 7 in the vault; 9 logged buys matched drop_log exactly and both sales were verified against ' +
  'the card show lot and live eBay order 09-14959-92118, so the gap is a buy he forgot to report. ' +
  'PURCHASE DATE AND SOURCE ARE UNKNOWN; the date here is the day it was found, not the day it was bought. ' +
  'Cost is the standard $30.00 vending flat, matching all nine of his other DR bundles.';
(async () => {
  const before: any = await sql`
    SELECT coalesce(sum(quantity),0) b FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  const sold: any = await sql`
    SELECT coalesce(sum(s.quantity),0) s FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=${CI}`;
  const held = Number(before[0].b) - Number(sold[0].s);
  console.log(`before: bought ${before[0].b}, sold ${sold[0].s}, on hand ${held}`);
  if (held >= 8) { console.log('already at 8 or more, nothing to add'); await sql.end(); return; }
  console.log(`adding 1 unlogged bundle -> ${held + 1} on hand`);
  if (!APPLY) { console.log('dry run'); await sql.end(); return; }
  const uid: any = await sql`SELECT user_id FROM purchases WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const ins: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes, unknown_cost)
    VALUES (${uid[0].user_id}, ${CI}, ${DATE}, 1, ${COST}, 'Unknown', ${NOTES}, true) RETURNING id`;
  const after: any = await sql`
    SELECT coalesce(sum(quantity),0) b FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  console.log(`logged purchase #${ins[0].id} (unknown_cost)`);
  console.log(`now: bought ${after[0].b}, sold ${sold[0].s}, on hand ${Number(after[0].b) - Number(sold[0].s)}`);
  await sql.end();
})();
