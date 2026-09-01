import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  console.log('EVERY catalog item that could be a DR bundle:');
  const ci:any = await sql`SELECT id, name, product_type FROM catalog_items
    WHERE name ILIKE '%destined rivals%' ORDER BY id`;
  ci.forEach((c:any)=>console.log(`  ci${c.id} | ${c.product_type} | ${c.name}`));

  console.log('\nPURCHASES on ci17235 (DR Booster Bundle):');
  const p:any = await sql`SELECT id, purchase_date::text d, quantity q, cost_cents c, source,
      deleted_at::text del, source_rip_id, source_decomposition_id, left(notes,60) n
    FROM purchases WHERE catalog_item_id=17235 ORDER BY purchase_date, id`;
  p.forEach((r:any)=>console.log(`  pu${r.id} ${r.d} x${r.q} $${(r.c/100).toFixed(2)} ${r.source}${r.del?'  DELETED '+r.del:''}${r.source_rip_id?'  from rip '+r.source_rip_id:''}${r.source_decomposition_id?'  from decomp '+r.source_decomposition_id:''}\n       ${r.n}`));

  console.log('\nSALES against those lots:');
  const s:any = await sql`SELECT s.id, s.sale_date::text d, s.quantity q, s.sale_price_cents pr, s.platform, s.purchase_id, left(s.notes,70) n
    FROM sales s JOIN purchases pu ON pu.id=s.purchase_id WHERE pu.catalog_item_id=17235 ORDER BY s.sale_date`;
  s.forEach((r:any)=>console.log(`  sale#${r.id} ${r.d} x${r.q} $${(r.pr/100).toFixed(2)} ${r.platform} (lot pu${r.purchase_id})\n       ${r.n}`));

  console.log('\nRIPS / DECOMPOSITIONS consuming DR bundles:');
  const r1:any = await sql`SELECT id, catalog_item_id, quantity, created_at::text FROM rips WHERE catalog_item_id=17235`;
  console.log('  rips:', r1.length?JSON.stringify(r1):'none');
  const r2:any = await sql`SELECT id, catalog_item_id, quantity, created_at::text FROM box_decompositions WHERE catalog_item_id=17235`;
  console.log('  decompositions:', r2.length?JSON.stringify(r2):'none');
  await sql.end();
})();
