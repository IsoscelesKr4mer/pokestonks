import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  const before = (await sql`SELECT id, catalog_item_id, cost_cents FROM purchases WHERE id=412`)[0];
  if (!before) { console.error('lot 412 not found'); process.exit(1); }
  if (Number(before.catalog_item_id) !== 5241 || Number(before.cost_cents) !== 500) {
    console.error('safety check failed:', JSON.stringify(before)); process.exit(1);
  }
  await sql`UPDATE purchases SET cost_cents=3000 WHERE id=412`;
  const after = (await sql`SELECT id, cost_cents FROM purchases WHERE id=412`)[0];
  console.log(`lot 412 cost: $${(Number(before.cost_cents)/100).toFixed(2)} -> $${(Number(after.cost_cents)/100).toFixed(2)}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
