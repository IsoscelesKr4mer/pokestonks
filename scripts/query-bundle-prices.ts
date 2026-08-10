import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async () => {
  const ids = [19776, 5241, 31604, 183, 19845, 76];
  const r = await sql`
    WITH lp AS (
      SELECT DISTINCT ON (catalog_item_id) catalog_item_id, market_price_cents, snapshot_date
      FROM market_prices ORDER BY catalog_item_id, snapshot_date DESC
    )
    SELECT c.id, c.name, lp.market_price_cents AS mkt, lp.snapshot_date
    FROM catalog_items c LEFT JOIN lp ON lp.catalog_item_id = c.id
    WHERE c.id = ANY(${ids}) ORDER BY c.id`;
  for (const it of r) {
    const m = it.mkt != null ? `$${(it.mkt/100).toFixed(2)}` : '—';
    console.log(`[${it.id}] ${it.name}  mkt=${m}  (${it.snapshot_date})`);
  }
  await sql.end();
})();
