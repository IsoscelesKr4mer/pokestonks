import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const cols:any = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='rips' ORDER BY ordinal_position`;
  console.log('rips cols:', cols.map((c:any)=>c.column_name).join(', '));
  const c2:any = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='box_decompositions' ORDER BY ordinal_position`;
  console.log('box_decompositions cols:', c2.map((c:any)=>c.column_name).join(', '));
  console.log('\nETBs he has bought, and whether ripped:');
  const e:any = await sql`
    SELECT ci.id, ci.name, sum(p.quantity) bought, max(p.purchase_date)::text last
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE p.deleted_at IS NULL AND ci.product_type ILIKE '%elite trainer%'
    GROUP BY ci.id, ci.name ORDER BY max(p.purchase_date) DESC`;
  e.forEach((r:any)=>console.log(`  ci${r.id} ${r.name} | bought ${r.bought} | last ${r.last}`));
  await sql.end();
})();
