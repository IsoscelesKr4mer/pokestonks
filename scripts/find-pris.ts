import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const c=await sql`SELECT id,name,set_name,product_type FROM catalog_items WHERE name ILIKE '%prismatic%' AND (name ILIKE '%bundle%' OR product_type ILIKE '%bundle%') ORDER BY name`;
  for(const x of c) console.log(JSON.stringify(x));
  console.log('--- recent prismatic bundle purchases (price reference) ---');
  const p=await sql`SELECT id,catalog_item_id,purchase_date,quantity,cost_cents,notes FROM purchases WHERE catalog_item_id IN (SELECT id FROM catalog_items WHERE name ILIKE '%prismatic%bundle%') AND deleted_at IS NULL ORDER BY id DESC LIMIT 4`;
  for(const x of p) console.log(JSON.stringify(x));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,300));process.exit(1);});
