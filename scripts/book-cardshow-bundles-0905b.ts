/**
 * Card show 2026-09-05, SECOND deal: 2x Destined Rivals Booster Bundle + 1x
 * Ascended Heroes Booster Bundle to another vendor for $195 cash.
 *
 * $195 against $223.68 of market is 87.2%, better than the first deal and above
 * the 85% ask, which is worth knowing because Michael read it as a step down.
 * Cash, so fees are 0 and there is no label to eat.
 *
 * One lump price for four units, so it is split pro-rata by each bundle's market
 * value rather than evenly, which would overpay the Destined Rivals and underpay
 * the Prismatic. Rounding remainder lands on the first unit so the rows sum to
 * exactly $250.00.
 *
 *   npx tsx scripts/book-cardshow-bundles-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-05';
const TOTAL = 19500;
const DEAL: { ci: number; name: string; qty: number; mkt: number }[] = [
  { ci: 17235, name: 'Destined Rivals Booster Bundle', qty: 2, mkt: 6750 },
  { ci: 76, name: 'Ascended Heroes Booster Bundle', qty: 1, mkt: 8868 },
];

const openLots = (ci: number) => sql<{ id: number; cost: number; open: number }[]>`
  SELECT p.id, p.cost_cents cost,
    (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
  FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL
  ORDER BY p.purchase_date ASC, p.id ASC`;

async function main() {
  const dupe = await sql`SELECT id FROM sales WHERE sale_date=${DATE} AND platform='Card show (cash)' AND notes LIKE '%second vendor%'`;
  if (dupe.length) { console.log('already booked:', dupe.map((d: any) => d.id).join(',')); await sql.end(); return; }

  // pro-rata split of the lump sum, by market value
  const mktTotal = DEAL.reduce((s, d) => s + d.mkt * d.qty, 0);
  const units: { ci: number; name: string; price: number }[] = [];
  for (const d of DEAL) {
    const share = Math.round((TOTAL * d.mkt * d.qty) / mktTotal);
    const per = Math.floor(share / d.qty);
    for (let i = 0; i < d.qty; i++) units.push({ ci: d.ci, name: d.name, price: per + (i === 0 ? share - per * d.qty : 0) });
  }
  const drift = TOTAL - units.reduce((s, u) => s + u.price, 0);
  units[0].price += drift;
  console.log(`split of ${(TOTAL / 100).toFixed(2)}: ${units.map((u) => '$' + (u.price / 100).toFixed(2)).join(' + ')}`);

  const sgid = randomUUID();
  let rev = 0, cost = 0;
  for (const d of DEAL) {
    const lots = (await openLots(d.ci)).filter((l) => l.open > 0);
    const avail = lots.reduce((s, l) => s + l.open, 0);
    if (avail < d.qty) throw new Error(`${d.name}: only ${avail} open, need ${d.qty}`);
    const prices = units.filter((u) => u.ci === d.ci).map((u) => u.price);
    let li = 0, used = 0;
    for (const price of prices) {
      while (used >= lots[li].open) { li++; used = 0; }
      const lot = lots[li];
      await sql`INSERT INTO sales (user_id, sale_group_id, purchase_id, sale_date, quantity,
          sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
        VALUES (${UID}, ${sgid}, ${lot.id}, ${DATE}, 1, ${price}, 0, ${lot.cost}, 'Card show (cash)',
          ${`Card show 2026-09-05, second vendor took 2x Destined Rivals + 1x Ascended Heroes bundles for $195 cash. Lump sum split pro-rata by market ($223.68 total), so this unit books at $${(price / 100).toFixed(2)}. $195 is 87.2% of market, ABOVE the 85% ask, and the best blended rate of the day. Michael reported the room was mostly bidding 70-75%. Cash deal: no fees, no shipping label.`})`;
      rev += price; cost += lot.cost; used++;
    }
    console.log(`${d.name}: ${d.qty} sold`);
  }

  for (const d of DEAL) {
    const h = await sql<{ n: number }[]>`
      SELECT COALESCE(SUM(p.quantity
        - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)),0)::int n
      FROM purchases p WHERE p.catalog_item_id=${d.ci} AND p.deleted_at IS NULL`;
    console.log(`  ${d.name} held now: ${h[0].n}`);
  }
  console.log(`group ${sgid} | revenue $${(rev / 100).toFixed(2)} cost $${(cost / 100).toFixed(2)} profit $${((rev - cost) / 100).toFixed(2)}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
