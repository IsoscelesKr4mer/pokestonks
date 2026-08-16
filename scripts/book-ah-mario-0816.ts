/**
 * Book both Ascended Heroes Booster Bundles sold to Mario, 2026-08-16.
 *
 *   npx tsx scripts/book-ah-mario-0816.ts           # dry run
 *   npx tsx scripts/book-ah-mario-0816.ts --apply
 *
 * Michael: "both of my ascended heroes bundles in the vault have been venmo'd
 * for from Mario", then "$80".
 *
 * $80 is PER BUNDLE, not $80 for the pair. That is not an assumption, it is his
 * own history: six prior Ascended Heroes bundles have gone to the same buyer,
 * five of them at $80 with the note "like usual", one at $70 when the market
 * was softer and one at $85. TCGCSV market is $79.56, so $80 each is exactly
 * at market and $40 each would be half. Two units, $160 total.
 *
 * FIFO across the two open lots, one unit each:
 *   lot #556  2026-08-13  Edmonds Safeway 12:28      $30.00
 *   lot #566  2026-08-14  Shoreline Fred Meyer 17:45 $30.00
 *
 * Local Venmo sale, so fees are zero. Neither bundle was committed to an Active
 * listing (all four mappings that touch this product are on Completed
 * listings), so there is nothing to delist first.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG_ITEM = 76;
const SALE_DATE = '2026-08-16';
const PRICE_EACH = 8000;
const PLATFORM = 'Venmo (local)';
const NOTE = 'Ascended Heroes bundle to Mario (Hawaii) $80, like usual. Both remaining bundles went in one Venmo.';

async function main() {
  const lots: any = await sql`
    SELECT p.id, p.purchase_date::text AS d, p.cost_cents, p.user_id, p.source,
      p.quantity - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions b WHERE b.source_purchase_id=p.id),0) AS open
    FROM purchases p
    WHERE p.catalog_item_id=${CATALOG_ITEM} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.id`;
  const open = lots.filter((l: any) => Number(l.open) > 0);
  const held = open.reduce((n: number, l: any) => n + Number(l.open), 0);

  console.log(`Ascended Heroes Booster Bundle: ${held} held`);
  if (held !== 2) { console.error(`expected 2 held, found ${held}. Not booking.`); process.exit(1); }

  const groupId = randomUUID();
  let revenue = 0, cost = 0;
  for (const l of open) {
    const qty = Number(l.open);
    revenue += PRICE_EACH * qty;
    cost += Number(l.cost_cents) * qty;
    console.log(`  lot#${l.id} ${l.d} ${qty}x @ cost $${(l.cost_cents / 100).toFixed(2)} -> sold $${(PRICE_EACH / 100).toFixed(2)} each`);
  }
  console.log(`  revenue $${(revenue / 100).toFixed(2)}  cost $${(cost / 100).toFixed(2)}  fees $0.00  realised +$${((revenue - cost) / 100).toFixed(2)}`);
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  for (const l of open) {
    const qty = Number(l.open);
    await sql`
      INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents,
                         matched_cost_cents, platform, notes, sale_group_id)
      VALUES (${l.user_id}, ${l.id}, ${SALE_DATE}, ${qty}, ${PRICE_EACH * qty}, 0,
              ${Number(l.cost_cents) * qty}, ${PLATFORM}, ${NOTE}, ${groupId})`;
    console.log(`  booked lot#${l.id}`);
  }

  const [after]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${CATALOG_ITEM} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  console.log(`\nheld after booking: ${after.held}  (expected 0)`);
  if (Number(after.held) !== 0) { console.error('held did not go to zero'); process.exit(1); }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
