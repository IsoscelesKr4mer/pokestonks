import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const p:any = await sql`SELECT p.id, p.purchase_date::text d, p.quantity q, p.cost_cents c, p.source, p.notes,
      ci.id ci, ci.name, ci.set_name
    FROM purchases p JOIN catalog_items ci ON ci.id=p.catalog_item_id
    WHERE ci.name ILIKE '%naruto%' OR ci.set_name ILIKE '%naruto%' OR p.notes ILIKE '%naruto%'
    ORDER BY p.purchase_date`;
  console.log('=== NARUTO PURCHASES ===');
  for(const x of p) console.log(`${x.d} ci${x.ci} qty${x.q} $${(x.c/100).toFixed(2)} | ${x.name} | ${x.set_name ?? ''} | ${x.notes ?? ''}`);
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
