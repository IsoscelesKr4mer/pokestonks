/** Where did the 99 Surging Sparks packs go? Pure SQL so bigint-as-string can't bite. */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const [x]:any = await sql`
    WITH lots AS (SELECT id, quantity FROM purchases WHERE catalog_item_id=19928 AND deleted_at IS NULL)
    SELECT (SELECT COALESCE(SUM(quantity),0) FROM lots)::int purchased,
           (SELECT COUNT(*) FROM rips WHERE source_purchase_id IN (SELECT id FROM lots))::int ripped,
           (SELECT COUNT(*) FROM box_decompositions WHERE source_purchase_id IN (SELECT id FROM lots))::int decomposed,
           (SELECT COALESCE(SUM(quantity),0) FROM sales WHERE purchase_id IN (SELECT id FROM lots))::int sold`;
  console.log(`purchased ${x.purchased}`);
  console.log(`  - sold        ${x.sold}`);
  console.log(`  - ripped      ${x.ripped}`);
  console.log(`  - decomposed  ${x.decomposed}`);
  console.log(`  = held        ${x.purchased - x.sold - x.ripped - x.decomposed}`);
  const s:any = await sql`SELECT s.sale_date::text d, s.quantity q, s.sale_price_cents p, s.platform
    FROM sales s WHERE s.purchase_id IN (SELECT id FROM purchases WHERE catalog_item_id=19928 AND deleted_at IS NULL)
    ORDER BY s.sale_date DESC LIMIT 6`;
  console.log(`\nlast sales:`); for(const r of s) console.log(`  ${r.d} qty ${r.q} $${(r.p/100).toFixed(2)} ${r.platform??''}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
