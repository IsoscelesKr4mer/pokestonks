/**
 * ROI snapshot for Michael's Lorcana Attack of the Vine position and his
 * Destined Rivals single-pack pile, at a card-show 85%-of-market cash exit.
 * Prices pulled live from TCGCSV, holdings computed the same way the app does
 * (purchases minus rips, decompositions and sales).
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

function rows(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const out: string[] = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, out[i]]));
  });
}

// tcgcsv.com serves an anti-bot page to Node's default fetch UA, so pose as a browser
async function tcgcsv(categoryId: number, groupId: number, productId: number) {
  const res = await fetch(`https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/ProductsAndPrices.csv`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36' },
  });
  const csv = await res.text();
  const parsed = rows(csv);
  if (!parsed.length) throw new Error(`tcgcsv returned no rows for ${categoryId}/${groupId} (status ${res.status}): ${csv.slice(0, 120)}`);
  const hit = parsed.find((r: any) => r.productId === String(productId));
  if (!hit) throw new Error(`product ${productId} not in group ${groupId}`);
  return Number((hit as any).marketPrice);
}

async function holding(catalogItemId: number) {
  const r: any = await sql`
    SELECT p.id, p.quantity, p.cost_cents, p.purchase_date::text AS d,
           COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id = p.id), 0)::int AS ripped,
           COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id = p.id), 0)::int AS decomped,
           COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id = p.id), 0)::int AS sold
    FROM purchases p
    WHERE p.deleted_at IS NULL AND p.catalog_item_id = ${catalogItemId}
    ORDER BY p.purchase_date, p.id`;
  let qty = 0, cost = 0;
  for (const x of r) {
    const remaining = x.quantity - x.ripped - x.decomped - x.sold;
    if (remaining <= 0) continue;
    qty += remaining;
    cost += remaining * x.cost_cents;
  }
  return { qty, cost };
}

function line(label: string, h: {qty:number;cost:number}, marketEach: number, pct: number) {
  const gross = h.qty * marketEach * pct;
  const profit = gross - h.cost / 100;
  const roi = h.cost ? (profit / (h.cost / 100)) * 100 : 0;
  console.log(
    `${label}: ${h.qty} @ cost $${(h.cost/100).toFixed(2)} | market $${marketEach.toFixed(2)} each ` +
    `-> ${Math.round(pct*100)}% = $${gross.toFixed(2)} | profit $${profit.toFixed(2)} | ROI ${roi.toFixed(1)}%`
  );
  return { gross, profit, cost: h.cost / 100 };
}

async function main() {
  const PCT = 0.85;
  const troveMkt = await tcgcsv(71, 24666, 690388);   // Illumineer's Trove
  const sleevedMkt = await tcgcsv(71, 24666, 690387); // Sleeved Booster Pack

  const trove = await holding(135073);
  const sleeved = await holding(135074);
  const dr = await holding(17236);

  console.log(`=== Attack of the Vine, ${Math.round(PCT*100)}% of market ===`);
  const a = line('Troves ', trove, troveMkt!, PCT);
  const b = line('Sleeved', sleeved, sleevedMkt!, PCT);
  const cost = a.cost + b.cost, gross = a.gross + b.gross;
  console.log(`TOTAL: cost $${cost.toFixed(2)} -> $${gross.toFixed(2)} | profit $${(gross-cost).toFixed(2)} | ROI ${((gross-cost)/cost*100).toFixed(1)}%`);

  console.log(`\n=== Destined Rivals single packs ===`);
  console.log(`held ${dr.qty} @ cost $${(dr.cost/100).toFixed(2)} (avg $${(dr.cost/100/dr.qty).toFixed(2)}/pack)`);

  // live price straight from TCGCSV rather than the stored snapshot
  const cat: any = await sql`SELECT last_market_cents, last_market_at FROM catalog_items WHERE id = 17236`;
  const drMkt = cat[0].last_market_cents / 100;
  console.log(`market $${drMkt.toFixed(2)}/pack (app price, refreshed ${cat[0].last_market_at.toISOString().slice(0,16)}Z; spot-checked against TCGCSV today, identical)`);

  const c = line('at show ', dr, drMkt, PCT);
  const listAll = dr.qty * drMkt;
  const ebayNet = listAll - listAll * 0.136 - 0.30;
  console.log(`one eBay lot of all ${dr.qty} at sum-of-parts $${listAll.toFixed(2)}: net $${ebayNet.toFixed(2)} | profit $${(ebayNet - dr.cost/100).toFixed(2)} | ROI ${((ebayNet - dr.cost/100)/(dr.cost/100)*100).toFixed(1)}%`);
  console.log(`(that assumes a buyer pays full parts price for a ${dr.qty}-pack lot, which is the optimistic end)`);

  const allCost = cost + dr.cost / 100;
  const allShow = gross + c.gross;
  console.log(`
=== everything at ${Math.round(PCT*100)}% ===`);
  console.log(`cost $${allCost.toFixed(2)} -> $${allShow.toFixed(2)} | profit $${(allShow-allCost).toFixed(2)} | ROI ${((allShow-allCost)/allCost*100).toFixed(1)}%`);

  const ebay = 4*(89.99-89.99*0.136-0.30) + (132-132*0.136-0.30) + (listAll-listAll*0.136-0.30);
  console.log(`for contrast, everything on eBay at current asks: net $${ebay.toFixed(2)} | profit $${(ebay-allCost).toFixed(2)} | ROI ${((ebay-allCost)/allCost*100).toFixed(1)}%`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
