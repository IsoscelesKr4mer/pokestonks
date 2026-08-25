/**
 * Book the TradePost sale of 4 Prismatic Evolutions Booster Bundles.
 *
 *   npx tsx scripts/book-tradepost-pe-0822.ts            # dry run
 *   npx tsx scripts/book-tradepost-pe-0822.ts --apply
 *
 * Receipt: order E0D2ADCF, sold 2026-08-22 09:47 PDT, 4x @ $71.71 = $286.84,
 * one UPS label -$8.12 (1Z1493G20308806428), payout $278.72.
 *
 * TradePost charges NO commission, but the seller pays shipping. That is the
 * mirror image of eBay, where the buyer pays shipping and the platform takes
 * 13.25% of it. So the $8.12 label is booked into `fees_cents`, allocated
 * $2.03 per bundle, which makes net-per-sale land on the real $69.68 payout and
 * keeps realized P&L honest. Booking it as a fee-free $71.71 sale would
 * overstate realized profit by $8.12.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const CI = 19776;
const UNIT = 7171;
const SHIP_EACH = 203;   // $8.12 / 4
const DATE = '2026-08-22';
const NOTE = 'TradePost order E0D2ADCF, sold 2026-08-22 09:47 PDT. 4x @ $71.71 = $286.84 gross, one UPS label 1Z1493G20308806428 -$8.12, payout $278.72. TradePost takes no commission; seller pays shipping, so the $8.12 label is allocated $2.03/bundle into fees_cents to make net match the real payout.';

async function main() {
  const lots: any = await sql`
    SELECT p.id, p.purchase_date::text pd, p.quantity, p.cost_cents,
      COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0) sold
    FROM purchases p WHERE p.catalog_item_id=${CI} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.id`;
  const open = lots.filter((r: any) => r.quantity - Number(r.sold) > 0);
  const held = open.reduce((s: number, r: any) => s + (r.quantity - Number(r.sold)), 0);
  console.log(`held ${held} PE bundles across ${open.length} open lots`);
  if (held !== 4) { console.error(`REFUSING: expected 4 held, found ${held}`); process.exit(1); }

  const gid = randomUUID();
  let gross = 0, fees = 0, cost = 0;
  for (const l of open) {
    gross += UNIT; fees += SHIP_EACH; cost += l.cost_cents;
    console.log(`  pu${l.id} (${l.pd}, cost $${(l.cost_cents / 100).toFixed(2)}) -> sold $71.71, ship $2.03, net $${((UNIT - SHIP_EACH) / 100).toFixed(2)}`);
  }
  console.log(`\ngross $${(gross / 100).toFixed(2)} | shipping $${(fees / 100).toFixed(2)} | payout $${((gross - fees) / 100).toFixed(2)} | cost $${(cost / 100).toFixed(2)}`);
  console.log(`REALIZED PROFIT $${((gross - fees - cost) / 100).toFixed(2)}  (ROI ${(((gross - fees - cost) / cost) * 100).toFixed(0)}%)`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  for (const l of open) {
    const r: any = await sql`
      INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
      VALUES (${UID}, ${l.id}, ${DATE}, 1, ${UNIT}, ${SHIP_EACH}, ${l.cost_cents}, 'TradePost', ${NOTE}, ${gid})
      RETURNING id`;
    console.log(`  booked sale ${r[0].id} against pu${l.id}`);
  }
  const [chk]: any = await sql`
    SELECT COUNT(*)::int n, SUM(sale_price_cents)::int g, SUM(fees_cents)::int f, SUM(matched_cost_cents)::int c
    FROM sales WHERE sale_group_id=${gid}`;
  console.log(`\ngroup ${gid}: ${chk.n} rows, gross $${(chk.g / 100).toFixed(2)}, fees $${(chk.f / 100).toFixed(2)}, cost $${(chk.c / 100).toFixed(2)}, realized $${((chk.g - chk.f - chk.c) / 100).toFixed(2)}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
