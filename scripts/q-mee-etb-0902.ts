import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r:any = await sql`SELECT id, name, product_type FROM catalog_items
    WHERE name ILIKE '%mega evolution%' AND (name ILIKE '%elite trainer%' OR name ILIKE '%coin%')
    ORDER BY name`;
  console.log('Mega Evolution ETB variants in the catalogue:');
  r.forEach((x:any)=>console.log(`  ci${x.id} | ${x.product_type} | ${x.name}`));
  console.log('\nhis Mega Evolution ETB purchases:');
  const p:any = await sql`SELECT ci.name, sum(pu.quantity) q, max(pu.purchase_date)::text d
    FROM purchases pu JOIN catalog_items ci ON ci.id=pu.catalog_item_id
    WHERE pu.deleted_at IS NULL AND ci.name ILIKE '%mega evolution%elite trainer%'
    GROUP BY ci.name ORDER BY 1`;
  p.forEach((x:any)=>console.log(`  ${x.name} x${x.q} (last ${x.d})`));
  await sql.end();
})();
