import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  console.log('=== recent single-pack vending buys (any set) ===');
  const r:any = await sql`SELECT p.purchase_date::text d, p.quantity q, p.cost_cents c, ci.id, ci.name
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE p.deleted_at IS NULL AND p.source ILIKE '%vending%' AND ci.name ILIKE '%pack%'
      AND ci.name NOT ILIKE '%bundle%' AND ci.name NOT ILIKE '%box%'
    ORDER BY p.purchase_date DESC LIMIT 12`;
  for(const x of r) console.log(`${x.d} $${(x.c/100).toFixed(2)} x${x.q}  ci${x.id} ${x.name}`);
  console.log('\n=== every Surging Sparks catalog row ===');
  const s:any = await sql`SELECT id, name, set_name FROM catalog_items WHERE name ILIKE '%surging spark%' ORDER BY id`;
  for(const x of s) console.log(`  ci${x.id} ${x.name} | ${x.set_name ?? ''}`);
  console.log('\n=== Surging Sparks purchases ===');
  const sp:any = await sql`SELECT p.purchase_date::text d, p.quantity q, p.cost_cents c, ci.name, p.notes
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE p.deleted_at IS NULL AND ci.name ILIKE '%surging spark%' ORDER BY p.purchase_date DESC LIMIT 8`;
  for(const x of sp) console.log(`${x.d} $${(x.c/100).toFixed(2)} x${x.q} ${x.name} :: ${String(x.notes??'').slice(0,110)}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
