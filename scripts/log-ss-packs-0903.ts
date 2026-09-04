/**
 * 2x Surging Sparks booster packs, Edmonds Safeway, 2026-09-03 18:01.
 *
 * "at 601 Safeway Edmonds" is the TIME, not a price, for the fifth time:
 *   - Discord message stamped 2026-09-04T01:05:08Z = 18:05 Pacific on 09-03,
 *     so 18:01 is four minutes prior
 *   - :01 is the NEW Edmonds mark he reported earlier today (:01-:02 / :31-:32)
 *   - every vending single pack books at exactly $5.00 ($4.49 + tax)
 * Same misread as 2026-08-09, 08-27, 08-31 and 09-01.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const COST = 500;
const QTY = 2;
const DATE = '2026-09-03';
const NOTES = 'Edmonds Safeway 18:01, ON the new :01 mark he reported the same day. ' +
  'Standard $5.00 vending pack price. Voice note transcribed as "at 601 Safeway Edmonds" - ' +
  '601 is the TIME (message stamped 2026-09-04T01:05Z = 18:05 Pacific), not a price. ' +
  'Fifth time this transcription has happened.';
(async () => {
  // ci19928, not the Sleeved pack (ci19926) - all 71 prior vending SS lots are ci19928
  const ci: any = await sql`SELECT id, name FROM catalog_items WHERE id=19928`;
  ci.forEach((c: any) => console.log(`  candidate ci${c.id} ${c.name}`));
  if (ci.length !== 1) { console.error('ambiguous catalog item, not logging'); process.exit(1); }
  const dupe: any = await sql`SELECT id, quantity FROM purchases
    WHERE catalog_item_id=${ci[0].id} AND purchase_date=${DATE} AND deleted_at IS NULL`;
  if (dupe.length) { console.log(`already logged on ${DATE}: purchase #${dupe[0].id} x${dupe[0].quantity}`); await sql.end(); return; }
  const uid: any = await sql`SELECT user_id FROM purchases WHERE user_id IS NOT NULL ORDER BY id DESC LIMIT 1`;
  const ins: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid[0].user_id}, ${ci[0].id}, ${DATE}, ${QTY}, ${COST}, 'Vending Machine', ${NOTES}) RETURNING id`;
  console.log(`\nlogged purchase #${ins[0].id}: ${ci[0].name} x${QTY} @ $5.00, Vending Machine, ${DATE}`);
  const b: any = await sql`SELECT coalesce(sum(quantity),0) q FROM purchases WHERE catalog_item_id=${ci[0].id} AND deleted_at IS NULL`;
  const s: any = await sql`SELECT coalesce(sum(sa.quantity),0) q FROM sales sa JOIN purchases p ON p.id=sa.purchase_id WHERE p.catalog_item_id=${ci[0].id}`;
  const r: any = await sql`SELECT count(*) q FROM rips ri JOIN purchases p ON p.id=ri.source_purchase_id WHERE p.catalog_item_id=${ci[0].id}`;
  const px: any = await sql`SELECT market_price_cents m, low_price_cents l, snapshot_date::text d FROM market_prices
    WHERE catalog_item_id=${ci[0].id} ORDER BY snapshot_date DESC LIMIT 1`;
  const held = Number(b[0].q) - Number(s[0].q) - Number(r[0].q);
  console.log(`SS packs: bought ${b[0].q}, sold ${s[0].q}, ripped ${r[0].q}, on hand ${held}`);
  if (px.length) console.log(`latest market $${(px[0].m/100).toFixed(2)} (low $${(px[0].l/100).toFixed(2)}, ${px[0].d})`);
  await sql.end();
})();
