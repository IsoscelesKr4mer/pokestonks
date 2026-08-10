import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const before = (await sql`SELECT id, purchase_id, matched_cost_cents FROM sales WHERE id=376`)[0];
  if (!before || Number(before.purchase_id) !== 412 || Number(before.matched_cost_cents) !== 500) {
    console.error('safety check failed:', JSON.stringify(before)); process.exit(1);
  }
  await sql`UPDATE sales SET matched_cost_cents=3000 WHERE id=376`;
  const after = (await sql`SELECT id, matched_cost_cents FROM sales WHERE id=376`)[0];
  console.log(`sale 376 matched_cost: $${(Number(before.matched_cost_cents)/100).toFixed(2)} -> $${(Number(after.matched_cost_cents)/100).toFixed(2)}`);
  // recompute this group's realized P&L from stored snapshots (what the app uses)
  const g = await sql`SELECT SUM(sale_price_cents) rev, SUM(fees_cents) fees, SUM(matched_cost_cents) cost
    FROM sales WHERE sale_group_id='756fd9bf-052e-4b0f-8a06-53c313771d15'`;
  const {rev,fees,cost} = g[0] as any;
  const profit = Number(rev)-Number(fees)-Number(cost);
  console.log(`group realized: net=$${((Number(rev)-Number(fees))/100).toFixed(2)} cost=$${(Number(cost)/100).toFixed(2)} profit=$${(profit/100).toFixed(2)} ROI=${((profit/Number(cost))*100).toFixed(1)}%`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
