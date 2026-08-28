import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const ci:any = await sql`SELECT id,name,set_name FROM catalog_items WHERE name ILIKE '%shrouded fable%' AND name ILIKE '%bundle%' ORDER BY id`;
  for(const c of ci) console.log(`ci${c.id}  ${c.name}`);
  const ids = ci.map((c:any)=>c.id);
  if(!ids.length){ await sql.end(); return; }
  const p:any = await sql`SELECT p.id, p.purchase_date::text d, p.quantity q, p.cost_cents c, p.catalog_item_id
    FROM purchases p WHERE p.catalog_item_id = ANY(${ids}) AND p.deleted_at IS NULL ORDER BY p.purchase_date`;
  console.log(`\n${p.length} lots:`);
  let held=0;
  for(const x of p){
    const [s]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q FROM sales WHERE purchase_id=${x.id} `;
    const [r]:any = await sql`SELECT COUNT(*)::int n FROM rips WHERE source_purchase_id=${x.id}`;
    const rem = x.q - s.q - r.n;
    held += rem;
    console.log(`  pu${x.id} ${x.d} qty ${x.q} @ $${(x.c/100).toFixed(2)}  sold ${s.q} ripped ${r.n}  -> ${rem} held`);
  }
  console.log(`\nHELD: ${held} Shrouded Fable booster bundles`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
