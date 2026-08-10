import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const ids = [33558, 33551, 19840, 1645];
  const r = await sql`
    SELECT c.id, c.name, c.last_market_cents, p.id AS purchase_id, p.quantity, p.cost_cents, p.purchase_date
    FROM catalog_items c
    LEFT JOIN purchases p ON p.catalog_item_id = c.id AND p.deleted_at IS NULL
    WHERE c.id = ANY(${ids})
    ORDER BY c.id, p.purchase_date
  `;
  console.log(JSON.stringify(r, null, 2));
  await sql.end();
})();
