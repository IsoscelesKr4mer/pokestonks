/**
 * Reusable booker for the 2026-09-05 card show. Cash deals, FIFO lot matching,
 * one sales row per unit, lump sums split pro-rata by each product's market
 * value so a mixed basket does not overpay the cheap line.
 *
 *   npx tsx scripts/book-cardshow-0905.ts <total_dollars> <catalogId>:<qty> [...]
 *   npx tsx scripts/book-cardshow-0905.ts 90 135075:3
 *
 * Market comes from the vault, not from a number typed at the prompt, so the
 * percent-of-market it reports back is always against live TCGCSV data.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-05';

const [totalArg, ...itemArgs] = process.argv.slice(2);
if (!totalArg || !itemArgs.length) {
  console.error('usage: book-cardshow-0905.ts <total_dollars> <catalogId>:<qty> [...]');
  process.exit(1);
}
const TOTAL = Math.round(parseFloat(totalArg) * 100);
const WANT = itemArgs.map((a) => {
  const [ci, qty] = a.split(':').map(Number);
  return { ci, qty };
});

const openLots = (ci: number) => sql<{ id: number; cost: number; open: number }[]>`
  SELECT p.id, p.cost_cents cost,
    (p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0))::int open
  FROM purchases p WHERE p.catalog_item_id=${ci} AND p.deleted_at IS NULL
  ORDER BY p.purchase_date ASC, p.id ASC`;

async function main() {
  const deal = [];
  for (const w of WANT) {
    const c = await sql<{ name: string; mkt: number }[]>`
      SELECT name, COALESCE(manual_market_cents, last_market_cents) mkt
      FROM catalog_items WHERE id=${w.ci}`;
    if (!c.length || c[0].mkt == null) throw new Error(`catalog ${w.ci} missing or unpriced`);
    deal.push({ ...w, name: c[0].name, mkt: c[0].mkt });
  }

  const mktTotal = deal.reduce((s, d) => s + d.mkt * d.qty, 0);
  const units: { ci: number; price: number }[] = [];
  for (const d of deal) {
    const share = Math.round((TOTAL * d.mkt * d.qty) / mktTotal);
    const per = Math.floor(share / d.qty);
    for (let i = 0; i < d.qty; i++) units.push({ ci: d.ci, price: per + (i === 0 ? share - per * d.qty : 0) });
  }
  units[0].price += TOTAL - units.reduce((s, u) => s + u.price, 0);

  const pct = ((TOTAL / mktTotal) * 100).toFixed(1);
  const sgid = randomUUID();
  const basket = deal.map((d) => `${d.qty}x ${d.name}`).join(' + ');
  let rev = 0, cost = 0;
  for (const d of deal) {
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
          ${`Card show 2026-09-05: ${basket} for $${(TOTAL / 100).toFixed(2)} cash, ${pct}% of the $${(mktTotal / 100).toFixed(2)} TCGplayer market. Lump sum split pro-rata by market, so this unit books at $${(price / 100).toFixed(2)}. Cash: no fees, no shipping label.`})`;
      rev += price; cost += lot.cost; used++;
    }
    const h = await sql<{ n: number }[]>`
      SELECT COALESCE(SUM(p.quantity
        - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)),0)::int n
      FROM purchases p WHERE p.catalog_item_id=${d.ci} AND p.deleted_at IS NULL`;
    console.log(`${d.name}: sold ${d.qty} @ mkt $${(d.mkt / 100).toFixed(2)}, held now ${h[0].n}`);
  }
  console.log(`\n${basket}`);
  console.log(`$${(rev / 100).toFixed(2)} revenue, $${(cost / 100).toFixed(2)} cost, $${((rev - cost) / 100).toFixed(2)} profit, ${pct}% of market`);

  const day = await sql<{ rev: number; cost: number; n: number }[]>`
    SELECT COALESCE(SUM(sale_price_cents - fees_cents),0)::int rev,
           COALESCE(SUM(matched_cost_cents),0)::int cost, COUNT(*)::int n
    FROM sales WHERE sale_date=${DATE} AND platform='Card show (cash)'`;
  console.log(`DAY: ${day[0].n} units, $${(day[0].rev / 100).toFixed(2)} in, $${(day[0].cost / 100).toFixed(2)} cost, $${((day[0].rev - day[0].cost) / 100).toFixed(2)} profit`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
