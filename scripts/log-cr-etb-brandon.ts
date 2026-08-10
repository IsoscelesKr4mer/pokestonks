import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const uid=(await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL LIMIT 1`)[0].user_id;
  // 1) purchase: Chaos Rising ETB (186), $66 tax-in, Fred Meyer, bought for Brandon
  const [pur] = await sql`INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, notes)
    VALUES (${uid}, 186, '2026-07-20', 1, 6600, 'Fred Meyer', 'Chaos Rising ETB $59.99 ($66 tax-in), bought for friend Brandon')
    RETURNING id`;
  console.log('purchase id:', pur.id);
  // 2) sale: to Brandon for $88, no fees (Venmo/local), matched cost $66
  const [sale] = await sql`INSERT INTO sales (user_id, purchase_id, sale_date, quantity, sale_price_cents, fees_cents, matched_cost_cents, platform, notes, sale_group_id)
    VALUES (${uid}, ${pur.id}, '2026-07-20', 1, 8800, 0, 6600, 'Venmo (local)', 'Sold Chaos Rising ETB to friend Brandon; Venmo $88', gen_random_uuid())
    RETURNING id, sale_price_cents, matched_cost_cents, fees_cents`;
  const profit = (sale.sale_price_cents - sale.matched_cost_cents - sale.fees_cents)/100;
  console.log(`sale id ${sale.id}: $${(sale.sale_price_cents/100).toFixed(2)} - $${(sale.matched_cost_cents/100).toFixed(2)} cost = +$${profit.toFixed(2)} realized`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
