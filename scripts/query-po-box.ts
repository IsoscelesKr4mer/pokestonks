import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const r = await sql`SELECT id, name, set_name, product_type, pack_count, release_date, last_market_cents FROM catalog_items WHERE id = 19841`;
  console.log(JSON.stringify(r, null, 2));
  await sql.end();
})();
