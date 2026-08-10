import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  console.log('=== catalog items: Pitch Black / Destined Rivals PACKS ===');
  const c=await sql`SELECT id,name,set_name,product_type FROM catalog_items WHERE (name ILIKE '%pitch black%' OR name ILIKE '%destined rivals%') AND (name ILIKE '%pack%' OR product_type ILIKE '%pack%') ORDER BY name`;
  for(const x of c) console.log(JSON.stringify(x));
  console.log('=== recent vending pack purchases (pattern) ===');
  const p=await sql`SELECT id,catalog_item_id,purchase_date,quantity,cost_cents,source,location,notes FROM purchases WHERE source ILIKE '%vending%' AND deleted_at IS NULL ORDER BY id DESC LIMIT 6`;
  for(const x of p) console.log(JSON.stringify(x));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
