/**
 * One-off: reduce SS catalog fees by $11.84 on the re-synced sale for eBay
 * order 14-14698-00727 to capture the shipping windfall the buyer overpaid
 * (paid $26.51 shipping, label cost $14.67, net +$11.84 to seller).
 *
 * Without this adjustment, pokestonks shows P&L $62.89; the true P&L on this
 * sale is $74.73. Edit is applied by reducing feesCents on ONE SS row by
 * $1184. Total catalog fees drop from $34.30 → $22.46.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

async function main() {
  const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
  const EBAY_ORDER_ID = '14-14698-00727';
  const SS_CATALOG_ID = 19928;
  const REDUCTION_CENTS = 1184;

  // Find the sale_group_id for the most recent (post-fix) sync of this order
  const [synced] = await sql`
    SELECT sale_group_id FROM ebay_synced_orders WHERE ebay_order_id = ${EBAY_ORDER_ID};
  `;
  if (!synced) throw new Error(`No ebay_synced_orders row for ${EBAY_ORDER_ID}`);
  const saleGroupId = (synced as { sale_group_id: string }).sale_group_id;
  console.log(`Sale group: ${saleGroupId}`);

  // SS catalog has 30 FIFO sale rows; distribute the reduction proportionally
  // by current fees_cents share, with rounding remainder going to the last row.
  const ssRows = await sql`
    SELECT s.id, s.fees_cents
    FROM sales s
    JOIN purchases p ON p.id = s.purchase_id
    WHERE s.sale_group_id = ${saleGroupId}
      AND p.catalog_item_id = ${SS_CATALOG_ID}
    ORDER BY s.id;
  `;
  type Row = { id: number; fees_cents: number };
  const rows = ssRows as unknown as Row[];
  const totalFees = rows.reduce((s, r) => s + r.fees_cents, 0);
  console.log(`SS catalog: ${rows.length} rows, current total fees=${(totalFees/100).toFixed(2)}`);
  if (totalFees < REDUCTION_CENTS) {
    throw new Error(`Total SS fees (${totalFees}) < reduction (${REDUCTION_CENTS})`);
  }

  // Compute per-row reduction; last row absorbs any rounding leftover.
  const reductions = rows.map((r, idx) => {
    if (idx === rows.length - 1) return 0; // placeholder, fixed below
    return Math.round((r.fees_cents / totalFees) * REDUCTION_CENTS);
  });
  const distributed = reductions.slice(0, -1).reduce((s, n) => s + n, 0);
  reductions[reductions.length - 1] = REDUCTION_CENTS - distributed;

  // Show before
  const [beforeAgg] = await sql`
    SELECT
      SUM(s.fees_cents)::int AS total_fees,
      SUM(s.sale_price_cents - s.fees_cents - s.matched_cost_cents)::int AS realized_pnl
    FROM sales s
    WHERE s.sale_group_id = ${saleGroupId};
  `;
  console.log('Before:', beforeAgg);

  await sql.begin(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      if (reductions[i] === 0) continue;
      await tx`UPDATE sales SET fees_cents = fees_cents - ${reductions[i]} WHERE id = ${rows[i].id};`;
    }
    // Tag the sale group's notes (apply to any row that has notes column convention — use first row)
    await tx`UPDATE sales SET notes = COALESCE(notes, '') || ' [shipping windfall -$11.84]' WHERE id = ${rows[0].id};`;
  });

  const [afterAgg] = await sql`
    SELECT
      SUM(s.fees_cents)::int AS total_fees,
      SUM(s.sale_price_cents - s.fees_cents - s.matched_cost_cents)::int AS realized_pnl
    FROM sales s
    WHERE s.sale_group_id = ${saleGroupId};
  `;
  console.log('After:', afterAgg);

  // Per-catalog summary for verification
  const perCatalog = await sql`
    SELECT c.name,
           SUM(s.quantity)::int AS qty,
           SUM(s.sale_price_cents)::int AS rev,
           SUM(s.fees_cents)::int AS fees,
           SUM(s.matched_cost_cents)::int AS cost
    FROM sales s
    JOIN purchases p ON p.id = s.purchase_id
    JOIN catalog_items c ON c.id = p.catalog_item_id
    WHERE s.sale_group_id = ${saleGroupId}
    GROUP BY c.name
    ORDER BY c.name;
  `;
  console.log('\nPer-catalog totals:');
  for (const r of perCatalog as unknown as Array<{ name: string; qty: number; rev: number; fees: number; cost: number }>) {
    const pnl = r.rev - r.fees - r.cost;
    console.log(
      `  ${r.name}: qty=${r.qty} rev=$${(r.rev/100).toFixed(2)} ` +
      `fees=$${(r.fees/100).toFixed(2)} cost=$${(r.cost/100).toFixed(2)} pnl=$${(pnl/100).toFixed(2)}`
    );
  }

  await sql.end();
  console.log('\nDONE. Pokestonks P&L should now show $74.73.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
