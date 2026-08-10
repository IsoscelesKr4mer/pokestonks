import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== Meganium box (#7778) purchase lots ===');
  const lots = await sql`
    SELECT p.id, p.purchase_date, p.created_at, p.quantity, p.cost_cents, p.source,
      COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)::int AS sold_qty
    FROM purchases p WHERE p.catalog_item_id=7778 AND p.deleted_at IS NULL
    ORDER BY p.purchase_date, p.created_at`;
  for (const l of lots) console.log(`  lot#${l.id} | ${l.purchase_date} | qty ${l.quantity} @ $${(l.cost_cents/100).toFixed(2)} | sold ${l.sold_qty} | ${l.source ?? ''} | created ${l.created_at.toISOString()}`);
  console.log('=== Meganium sale rows ===');
  const s = await sql`
    SELECT s.id, s.purchase_id, s.quantity, s.sale_price_cents, s.fees_cents, s.matched_cost_cents, s.sale_group_id
    FROM sales s JOIN purchases p ON s.purchase_id=p.id
    WHERE p.catalog_item_id=7778 ORDER BY s.created_at DESC`;
  for (const r of s) console.log(`  sale#${r.id} | matched purchase#${r.purchase_id} | qty ${r.quantity} | sale $${(r.sale_price_cents/100).toFixed(2)} | matchedCost $${(r.matched_cost_cents/100).toFixed(2)} | grp ${String(r.sale_group_id).slice(0,8)}`);
  await sql.end();
}
main();
