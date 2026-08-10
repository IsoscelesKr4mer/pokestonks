import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const userId = '66200525-2237-4cc3-948f-aaafd3253d4b';
const saleDate = '2026-06-20';

// per-unit allocated sale prices (cents), consumed FIFO
const groupA = {
  notes: 'Cash sale to returning eBay buyers: ME Gardevoir ETB + Perfect Order box + AH ETB + 4 Perfect Order bundles, $580 total',
  items: [
    { cid: 198,   prices: [9830] },                 // ME Gardevoir ETB
    { cid: 19841, prices: [19702] },                // Perfect Order Booster Box
    { cid: 65,    prices: [16468] },                // Ascended Heroes ETB (1 of 2)
    { cid: 19845, prices: [3000,3000,3000,3000] },  // 4 Perfect Order bundles at cost
  ],
};
const groupB = {
  notes: 'Card show cash sale: 3 Prismatic bundles + 2 White Flare bundles + 1 Ascended Heroes tin, $380 total',
  items: [
    { cid: 19776, prices: [7545,7545,7544] },       // 3 Prismatic Evolutions bundles
    { cid: 31604, prices: [6513,6512] },            // 2 White Flare bundles
    { cid: 69,    prices: [2341] },                 // 1 Ascended Heroes mini tin
  ],
};

async function openLots(cid:number) {
  return await sql`
    SELECT p.id AS purchase_id, p.cost_cents,
      (p.quantity - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0))::int AS qty_left
    FROM purchases p WHERE p.catalog_item_id=${cid} AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.created_at`;
}

async function buildRows(group:any, groupId:string) {
  const rows:any[] = [];
  for (const item of group.items) {
    const lots = (await openLots(item.cid)).filter((l:any)=>Number(l.qty_left)>0);
    let li = 0, used = 0;
    for (const price of item.prices) {
      while (li < lots.length && used >= Number(lots[li].qty_left)) { li++; used=0; }
      if (li >= lots.length) throw new Error(`Not enough held for catalog #${item.cid}`);
      rows.push({ user_id:userId, sale_group_id:groupId, purchase_id:Number(lots[li].purchase_id),
        sale_date:saleDate, quantity:1, sale_price_cents:price, fees_cents:0,
        matched_cost_cents:Number(lots[li].cost_cents), platform:'Cash', notes:group.notes });
      used++;
    }
  }
  return rows;
}

async function main() {
  const gA = randomUUID(), gB = randomUUID();
  const rowsA = await buildRows(groupA, gA);
  const rowsB = await buildRows(groupB, gB);
  await sql.begin(async (tx) => {
    await tx`INSERT INTO sales ${(tx as any)([...rowsA,...rowsB],'user_id','sale_group_id','purchase_id','sale_date','quantity','sale_price_cents','fees_cents','matched_cost_cents','platform','notes')}`;
  });
  const sum=(rs:any[])=>rs.reduce((a,r)=>a+r.sale_price_cents,0);
  const cost=(rs:any[])=>rs.reduce((a,r)=>a+r.matched_cost_cents,0);
  console.log(`Group A ($580): ${rowsA.length} rows, revenue $${(sum(rowsA)/100).toFixed(2)}, cost $${(cost(rowsA)/100).toFixed(2)}, profit $${((sum(rowsA)-cost(rowsA))/100).toFixed(2)}`);
  console.log(`Group B ($380): ${rowsB.length} rows, revenue $${(sum(rowsB)/100).toFixed(2)}, cost $${(cost(rowsB)/100).toFixed(2)}, profit $${((sum(rowsB)-cost(rowsB))/100).toFixed(2)}`);

  console.log('\n=== held after ===');
  for (const cid of [198,19841,65,19845,19776,31604,69]) {
    const h=(await sql`SELECT ci.name, COALESCE(SUM(p.quantity
        - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held
      FROM catalog_items ci LEFT JOIN purchases p ON p.catalog_item_id=ci.id AND p.deleted_at IS NULL
      WHERE ci.id=${cid} GROUP BY ci.name`)[0];
    console.log(`  #${cid} ${h.name}: held ${h.held}`);
  }
  await sql.end();
}
main();
