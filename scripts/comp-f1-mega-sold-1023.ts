/**
 * SOLD comps for the 2026 Topps Chrome Formula 1 mega box, read by eye off
 * Michael's eBay "Sold listings" screenshot of 2026-10-23 (page 1 of 8, sorted
 * Ended Recently, 442 results for "topps f1 mega box").
 *
 * This exists because the Browse API only exposes live ASKS, so the ask book
 * said median $135.99 with a $105 floor. These are real completed sales and
 * they tell a different and tighter story.
 *
 * Prices are the ITEM price. Shipping is tracked separately because nearly
 * every single-box sale charged $5-$10 on top, which matters when setting his
 * own ask: he never offers free shipping, so he is competing against the
 * item price of the "+delivery" rows, not against the free-shipping rows.
 *
 * Auctions are kept but flagged. They are a different mechanism and the comp
 * tooling elsewhere filters them out entirely, so mixing them into a BIN
 * median would quietly distort it.
 */

type Sale = {
  item: number;
  ship: number;
  boxes: number;
  date: string;
  auction?: boolean;
  note?: string;
};

const SALES: Sale[] = [
  // --- single boxes, Buy It Now / Best Offer ---
  { item: 130.0, ship: 7.41, boxes: 1, date: '10-23' },
  { item: 129.99, ship: 8.29, boxes: 1, date: '10-23' },
  { item: 118.0, ship: 7.5, boxes: 1, date: '10-23' },
  { item: 100.0, ship: 8.12, boxes: 1, date: '10-23', note: 'seller 0% positive (2)' },
  { item: 184.99, ship: 8.29, boxes: 1, date: '10-23', note: 'seller 0% positive (3)' },
  { item: 110.0, ship: 10.15, boxes: 1, date: '10-23' },
  { item: 138.99, ship: 0, boxes: 1, date: '10-21' },
  { item: 124.99, ship: 5.99, boxes: 1, date: '10-23' },
  { item: 119.0, ship: 7.76, boxes: 1, date: '10-23' },
  { item: 118.0, ship: 7.1, boxes: 1, date: '10-23' },
  { item: 126.99, ship: 6.99, boxes: 1, date: '10-23' },
  { item: 119.99, ship: 7.95, boxes: 1, date: '10-23' },
  { item: 115.0, ship: 10.15, boxes: 1, date: '10-23' },
  { item: 118.0, ship: 4.0, boxes: 1, date: '10-23' },
  { item: 122.99, ship: 10.15, boxes: 1, date: '10-23' },
  { item: 129.89, ship: 0, boxes: 1, date: '10-23' },
  { item: 118.99, ship: 7.96, boxes: 1, date: '10-23' },
  { item: 118.99, ship: 7.75, boxes: 1, date: '10-22' },
  { item: 118.99, ship: 7.75, boxes: 1, date: '10-22' },
  { item: 119.99, ship: 7.18, boxes: 1, date: '10-22' },
  { item: 125.0, ship: 7.58, boxes: 1, date: '10-22' },
  { item: 118.0, ship: 7.1, boxes: 1, date: '10-22' },
  { item: 114.99, ship: 8.28, boxes: 1, date: '10-22' },
  { item: 116.0, ship: 8.29, boxes: 1, date: '10-22' },
  { item: 139.0, ship: 5.0, boxes: 1, date: '10-22' },
  { item: 149.95, ship: 0, boxes: 1, date: '10-22' },
  { item: 118.0, ship: 8.0, boxes: 1, date: '10-22' },
  { item: 114.99, ship: 7.96, boxes: 1, date: '10-22' },
  { item: 120.0, ship: 10.15, boxes: 1, date: '10-22' },
  { item: 135.99, ship: 0, boxes: 1, date: '10-22' },
  { item: 134.99, ship: 0, boxes: 1, date: '10-22', note: 'free returns' },
  { item: 130.0, ship: 8.12, boxes: 1, date: '10-22' },
  { item: 145.0, ship: 7.75, boxes: 1, date: '10-22' },
  { item: 189.99, ship: 13.65, boxes: 1, date: '10-22' },
  { item: 110.0, ship: 7.57, boxes: 1, date: '10-22' },
  { item: 119.0, ship: 10.15, boxes: 1, date: '10-22' },
  { item: 129.99, ship: 9.99, boxes: 1, date: '10-22' },
  { item: 129.99, ship: 0, boxes: 1, date: '10-22' },

  // --- single boxes sold at auction ---
  { item: 128.0, ship: 10.0, boxes: 1, date: '10-22', auction: true, note: '1 bid' },
  { item: 174.5, ship: 6.99, boxes: 1, date: '10-22', auction: true, note: '21 bids' },

  // --- pre-release presale, a different market ---
  { item: 209.99, ship: 0, boxes: 1, date: '10-04', note: 'PRESALE, 11 days before release' },

  // --- multi-box lots ---
  { item: 239.95, ship: 0, boxes: 2, date: '10-23' },
  { item: 238.95, ship: 0, boxes: 2, date: '10-23' },
  { item: 250.0, ship: 10.15, boxes: 2, date: '10-23' },
  { item: 240.0, ship: 0, boxes: 2, date: '10-23' },
  { item: 229.99, ship: 10.15, boxes: 2, date: '10-23' },
  { item: 240.0, ship: 0, boxes: 2, date: '10-23' },
  { item: 225.0, ship: 7.58, boxes: 2, date: '10-23' },
  { item: 215.99, ship: 8.17, boxes: 2, date: '10-22' },
  { item: 259.99, ship: 0, boxes: 2, date: '10-22' },
  { item: 459.99, ship: 0, boxes: 4, date: '10-22' },
  { item: 480.0, ship: 0, boxes: 4, date: '10-22' },
  { item: 500.0, ship: 0, boxes: 5, date: '10-22' },
  { item: 745.0, ship: 0, boxes: 6, date: '10-23' },
  { item: 955.0, ship: 11.3, boxes: 8, date: '10-23' },
  { item: 940.0, ship: 0, boxes: 8, date: '10-22' },
  { item: 1499.99, ship: 5.75, boxes: 12, date: '10-22' },
  { item: 2149.99, ship: 12.97, boxes: 20, date: '10-22' },
];

const COST_PER_BOX = 77.37;
const HELD = 8;
const FEE_RATE = 0.1325;
const FEE_FIXED = 0.4;

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const usd = (n: number) => `$${n.toFixed(2)}`;

/** eBay takes 13.25% of the FULL order total, shipping and tax included. */
const net = (item: number, ship: number) => item + ship - (item + ship) * FEE_RATE - FEE_FIXED - ship;

function main() {
  const singlesBin = SALES.filter((s) => s.boxes === 1 && !s.auction && !s.note?.includes('PRESALE'));
  const auctions = SALES.filter((s) => s.auction);
  const lots = SALES.filter((s) => s.boxes > 1);

  const sp = singlesBin.map((s) => s.item);
  console.log(`SINGLE BOX, fixed price: ${sp.length} sales`);
  console.log(
    `  low ${usd(Math.min(...sp))}   p25 ${usd(pct(sp, 0.25))}   median ${usd(med(sp))}` +
      `   p75 ${usd(pct(sp, 0.75))}   high ${usd(Math.max(...sp))}`
  );
  const shipped = singlesBin.filter((s) => s.ship > 0).map((s) => s.ship);
  console.log(
    `  ${shipped.length} of ${sp.length} charged shipping, median ${usd(med(shipped))}` +
      `  (so a free-ship ask has to carry that)`
  );

  console.log(`\n  at the median ${usd(med(sp))} + ${usd(med(shipped))} ship:`);
  console.log(
    `     net ${usd(net(med(sp), med(shipped)))}  cost ${usd(COST_PER_BOX)}  ` +
      `profit ${usd(net(med(sp), med(shipped)) - COST_PER_BOX)}/box`
  );

  console.log(`\nAUCTION: ${auctions.length} sales`);
  for (const a of auctions) console.log(`  ${usd(a.item)}  ${a.note}`);

  console.log(`\nMULTI-BOX LOTS, per box:`);
  const byCount = new Map<number, number[]>();
  for (const l of lots) {
    const per = l.item / l.boxes;
    if (!byCount.has(l.boxes)) byCount.set(l.boxes, []);
    byCount.get(l.boxes)!.push(per);
  }
  for (const n of [...byCount.keys()].sort((a, b) => a - b)) {
    const v = byCount.get(n)!;
    console.log(
      `  ${String(n).padStart(2)}-box x${v.length}:  ` +
        v.map((x) => usd(x)).join('  ') +
        `   median ${usd(med(v))}`
    );
  }
  const allPer = lots.map((l) => l.item / l.boxes);
  console.log(`  ALL lots: median ${usd(med(allPer))} per box`);

  console.log(`\n--- the question: 8 singles or one lot of 8? ---`);
  const singleAsk = 129.99;
  const singleShip = 8.0;
  const perSingle = net(singleAsk, singleShip);
  console.log(`  8 singles at ${usd(singleAsk)} + ${usd(singleShip)} ship:`);
  console.log(
    `     ${usd(perSingle)}/box net x ${HELD} = ${usd(perSingle * HELD)}, ` +
      `profit ${usd(perSingle * HELD - COST_PER_BOX * HELD)}`
  );

  const lotAsks = [940, 955];
  for (const la of lotAsks) {
    const n8 = net(la, 15);
    console.log(`  one lot of 8 at ${usd(la)} (a real comp):`);
    console.log(`     ${usd(n8)} net, profit ${usd(n8 - COST_PER_BOX * HELD)}, ${usd(n8 / HELD)}/box`);
  }
}

main();
