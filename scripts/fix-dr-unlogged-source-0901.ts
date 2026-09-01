/**
 * Correct purchase #605: source is Vending Machine, and the cost is not unknown.
 *
 * Michael: "its not unknown it's always a vending machine for DR bundles."
 *
 * He is right, and I over-applied the found-in-the-car precedent. Those two
 * lots were genuinely sourceless. This one is not: every DR bundle he has ever
 * owned came from a machine, and every vending bundle is $30.00 flat. So the
 * COST is known and unknown_cost must be false, or it will show up as a lot
 * with no reliable basis when it has a perfectly reliable one.
 *
 * What is actually unknown is narrower: the date and which machine. That
 * belongs in the note, not in a flag about cost.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const NOTES = 'UNLOGGED PURCHASE, reconstructed 2026-09-01 from a physical count: Michael counted 8 bundles ' +
  'against 7 in the vault. All 9 logged buys matched drop_log one for one and both sales verified against ' +
  'the card show lot and live eBay order 09-14959-92118, so this is a buy he forgot to report. ' +
  'Source is Vending Machine and cost is the standard $30.00 flat, both certain: every DR bundle he has ' +
  'owned came from a machine at exactly $30.00. WHAT IS UNKNOWN IS THE DATE AND WHICH MACHINE - the date ' +
  'here is the day it was found, not the day it was bought, and there is deliberately no drop_log row.';
(async () => {
  const r: any = await sql`
    UPDATE purchases SET source='Vending Machine', unknown_cost=false, notes=${NOTES}
    WHERE id=605 RETURNING id, source, cost_cents, unknown_cost`;
  if (!r.length) { console.error('purchase 605 not found'); process.exit(1); }
  console.log(`pu${r[0].id}: source "${r[0].source}", $${(r[0].cost_cents/100).toFixed(2)}, unknown_cost=${r[0].unknown_cost}`);
  const b: any = await sql`SELECT coalesce(sum(quantity),0) b FROM purchases WHERE catalog_item_id=17235 AND deleted_at IS NULL`;
  const s: any = await sql`SELECT coalesce(sum(s.quantity),0) s FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=17235`;
  console.log(`DR bundles: bought ${b[0].b}, sold ${s[0].s}, on hand ${Number(b[0].b)-Number(s[0].s)}`);
  const src: any = await sql`SELECT source, count(*) n FROM purchases WHERE catalog_item_id=17235 AND deleted_at IS NULL GROUP BY 1`;
  console.log('sources now:', src.map((x: any) => `${x.source} x${x.n}`).join(', '));
  await sql.end();
})();
