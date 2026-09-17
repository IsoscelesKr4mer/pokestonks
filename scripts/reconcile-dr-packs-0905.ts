/**
 * Hand count 2026-09-05: 142 loose Destined Rivals packs against 144 logged.
 * Cause unknown (Michael does not remember), so this books it the same way the
 * 2026-07-09 count was booked in the other direction (lot 425, "+6 previously
 * unlogged packs"): an inventory reconciliation, NOT a sale.
 *
 * No cost or loss is realised. Two units come off the oldest open lots, FIFO,
 * which is where the earliest-acquired packs would have gone anyway. Every open
 * lot is $5.00 so the choice of lot changes no downstream number.
 *
 *   npx tsx scripts/reconcile-dr-packs-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CID = 17236;
const TARGET = 142;
const NOTE = 'Hand count 2026-09-05: 142 physical vs 144 logged. 2 units removed as inventory reconciliation, cause unknown (not a sale, no loss booked).';

async function held() {
  const r = await sql<{ n: number }[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips x WHERE x.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS n
    FROM purchases p WHERE p.catalog_item_id=${CID} AND p.deleted_at IS NULL`;
  return r[0].n;
}

async function main() {
  const before = await held();
  console.log(`held before: ${before}, target ${TARGET}`);
  if (before === TARGET) { console.log('already reconciled, nothing to do'); await sql.end(); return; }
  if (before < TARGET) { console.log('vault is BELOW the count; this script only removes'); await sql.end(); return; }

  let toRemove = before - TARGET;
  const lots = await sql<any[]>`
    SELECT p.id, p.purchase_date::text d, p.quantity, p.notes,
      (p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips x WHERE x.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS remaining
    FROM purchases p
    WHERE p.catalog_item_id=${CID} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date ASC, p.id ASC`;

  for (const l of lots) {
    if (toRemove <= 0) break;
    if (l.remaining <= 0) continue;
    const take = Math.min(l.remaining, toRemove);
    const newQty = l.quantity - take;
    if (newQty === 0) {
      await sql`UPDATE purchases SET deleted_at = NOW(),
        notes = ${[l.notes, NOTE].filter(Boolean).join(' | ')} WHERE id=${l.id}`;
      console.log(`  lot ${l.id} (${l.d}) soft-deleted, was qty ${l.quantity}`);
    } else {
      await sql`UPDATE purchases SET quantity = ${newQty},
        notes = ${[l.notes, NOTE].filter(Boolean).join(' | ')} WHERE id=${l.id}`;
      console.log(`  lot ${l.id} (${l.d}) qty ${l.quantity} -> ${newQty}`);
    }
    toRemove -= take;
  }

  const after = await held();
  console.log(`held after: ${after} ${after === TARGET ? 'OK' : 'MISMATCH'}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
