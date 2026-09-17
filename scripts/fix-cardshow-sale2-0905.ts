/**
 * Correction: the second card show deal was 1x Destined Rivals + 2x Ascended
 * Heroes for $195, not 2x DR + 1x AH as first reported and booked.
 *
 * Michael caught it himself: 80% of the sheet for that basket is $196, which
 * only works for 1 DR + 2 AH ($244.86 market). The composition I booked would
 * have made $195 an 87.2% sale; the real one is 79.6%, essentially his 80%
 * settle line.
 *
 * Deletes the bad sale group and rebooks with the same pro-rata-by-market split.
 *
 *   npx tsx scripts/fix-cardshow-sale2-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-05';
const TOTAL = 19500;
const BAD_GROUP = '86610758-e680-4179-abcc-8bb7c5a62a0b';
const DEAL = [
  { ci: 17235, name: 'Destined Rivals Booster Bundle', qty: 1, mkt: 6750 },
  { ci: 76, name: 'Ascended Heroes Booster Bundle', qty: 2, mkt: 8868 },
];

const openLots = (ci: number) => sql<{ id: number; cost: number; open: number }[]>`
  SELECT p.id, p.cost_cents cost,
    (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
  FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL
  ORDER BY p.purchase_date ASC, p.id ASC`;

async function main() {
  const bad = await sql`SELECT id FROM sales WHERE sale_group_id=${BAD_GROUP}`;
  if (bad.length) {
    await sql`DELETE FROM sales WHERE sale_group_id=${BAD_GROUP}`;
    console.log(`removed ${bad.length} mis-booked rows (group ${BAD_GROUP})`);
  } else {
    const already = await sql`SELECT id FROM sales WHERE sale_date=${DATE} AND notes LIKE '%second vendor%'`;
    if (already.length) { console.log('already corrected'); await sql.end(); return; }
  }

  const mktTotal = DEAL.reduce((s, d) => s + d.mkt * d.qty, 0);
  const units: { ci: number; price: number }[] = [];
  for (const d of DEAL) {
    const share = Math.round((TOTAL * d.mkt * d.qty) / mktTotal);
    const per = Math.floor(share / d.qty);
    for (let i = 0; i < d.qty; i++) units.push({ ci: d.ci, price: per + (i === 0 ? share - per * d.qty : 0) });
  }
  units[0].price += TOTAL - units.reduce((s, u) => s + u.price, 0);
  console.log(`split of $${(TOTAL / 100).toFixed(2)}: ${units.map((u) => '$' + (u.price / 100).toFixed(2)).join(' + ')}`);

  const sgid = randomUUID();
  let rev = 0, cost = 0;
  for (const d of DEAL) {
    const lots = (await openLots(d.ci)).filter((l) => l.open > 0);
    if (lots.reduce((s, l) => s + l.open, 0) < d.qty) throw new Error(`${d.name}: not enough open lots`);
    const prices = units.filter((u) => u.ci === d.ci).map((u) => u.price);
    let li = 0, used = 0;
    for (const price of prices) {
      while (used >= lots[li].open) { li++; used = 0; }
      const lot = lots[li];
      await sql`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity,
          sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
        VALUES (${UID}, ${sgid}, ${lot.id}, ${DATE}, 1, ${price}, 0, ${lot.cost}, 'Card show (cash)',
          ${`Card show 2026-09-05, second vendor took 1x Destined Rivals + 2x Ascended Heroes bundles for $195 cash. Corrected composition: first reported as 2x DR + 1x AH and rebooked after Michael checked it against the sheet. Lump sum split pro-rata by market ($244.86 total), so this unit books at $${(price / 100).toFixed(2)}. $195 is 79.6% of market, his 80% settle line, with the room mostly bidding 70-75%. Cash: no fees, no label.`})`;
      rev += price; cost += lot.cost; used++;
    }
    console.log(`${d.name}: ${d.qty} sold`);
  }

  for (const ci of [17235, 76]) {
    const h = await sql<{ n: number; name: string }[]>`
      SELECT ci.name, COALESCE(SUM(p.quantity
        - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)),0)::int n
      FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
      WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL GROUP BY ci.name`;
    console.log(`  ${h[0].name} held now: ${h[0].n}`);
  }
  console.log(`group ${sgid} | revenue $${(rev / 100).toFixed(2)} cost $${(cost / 100).toFixed(2)} profit $${((rev - cost) / 100).toFixed(2)}`);

  const day = await sql<{ rev: number; cost: number; n: number }[]>`
    SELECT COALESCE(SUM(sale_price_cents - fees_cents),0)::int rev,
           COALESCE(SUM(matched_cost_cents),0)::int cost, COUNT(*)::int n
    FROM sales WHERE sale_date=${DATE} AND platform='Card show (cash)'`;
  console.log(`DAY TOTAL: ${day[0].n} units, revenue $${(day[0].rev / 100).toFixed(2)}, cost $${(day[0].cost / 100).toFixed(2)}, profit $${((day[0].rev - day[0].cost) / 100).toFixed(2)}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
