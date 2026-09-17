/**
 * TradePost offer accepted 2026-09-05 16:30 Pacific: 140x Destined Rivals
 * Booster Pack at $8.05, sale total $1,126.60. Orders F4774A96 + BA337A5E
 * (two boxes).
 *
 * BOTH shipping labels are struck through on the confirmation and the payout
 * equals the sale total, so TradePost is covering the freight this time. That
 * is a change from the 2026-09-03 Shrouded Fable sale, where he ate a $10.41
 * label and it correctly went into fees. Here fees are 0, and the $7.83
 * net-of-freight figure the cheat sheet used all day was pessimistic: he gets
 * the full $8.05.
 *
 * Per-unit price is derived from the stated total, not the displayed $8.05,
 * because 140 x 8.05 = $1,127.00 and the confirmation says $1,126.60.
 *
 *   npx tsx scripts/book-tradepost-drpacks-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const CID = 17236;
const DATE = '2026-09-05';
const QTY = 140;
const TOTAL = 112660;

async function main() {
  const dupe = await sql`SELECT id FROM sales WHERE sale_date=${DATE} AND platform='TradePost' AND notes LIKE '%F4774A96%'`;
  if (dupe.length) { console.log('already booked'); await sql.end(); return; }

  const lots = (await sql<{ id: number; cost: number; open: number }[]>`
    SELECT p.id, p.cost_cents cost,
      (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
    FROM purchases p WHERE p.catalog_item_id=${CID} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date ASC, p.id ASC`).filter((l) => l.open > 0);
  const avail = lots.reduce((s, l) => s + l.open, 0);
  console.log(`open packs: ${avail}, selling ${QTY}`);
  if (avail < QTY) throw new Error(`only ${avail} open`);

  // FIFO, one row per lot slice; the rounding remainder rides on the first row
  const base = Math.floor(TOTAL / QTY);
  let remainder = TOTAL - base * QTY;
  const sgid = randomUUID();
  let need = QTY, rev = 0, cost = 0, rows = 0;
  for (const l of lots) {
    if (need <= 0) break;
    const take = Math.min(need, l.open);
    const extra = Math.min(remainder, take);
    remainder -= extra;
    const price = base * take + extra;
    await sql`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      VALUES (${UID}, ${sgid}, ${l.id}, ${DATE}, ${take}, ${price}, 0, ${take * l.cost}, 'TradePost',
        ${`TradePost orders F4774A96 + BA337A5E, offer accepted 2026-09-05 16:30 Pacific. 140x Destined Rivals Booster Pack at $8.05 = $1,126.60. TradePost covered BOTH labels (Lowe's X-Small $24.03 and Small Mailer $7.90 both struck through, payout = sale total), so fees are 0 here, unlike the 2026-09-03 Shrouded Fable sale where he paid the label. $8.05 is 88.8% of the $9.07 TCGCSV market. Cost $5.00 a pack.`})`;
    rev += price; cost += take * l.cost; need -= take; rows++;
  }

  const h = await sql<{ n: number }[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)),0)::int n
    FROM purchases p WHERE p.catalog_item_id=${CID} AND p.deleted_at IS NULL`;
  console.log(`${rows} rows | revenue $${(rev / 100).toFixed(2)} cost $${(cost / 100).toFixed(2)} profit $${((rev - cost) / 100).toFixed(2)}`);
  console.log(`DR loose packs held now: ${h[0].n}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
