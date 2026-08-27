import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const CI=135082;
  const [p]:any = await sql`SELECT COALESCE(SUM(quantity),0)::int q, COALESCE(SUM(quantity*cost_cents),0)::int c FROM purchases WHERE catalog_item_id=${CI} AND deleted_at IS NULL`;
  console.log(`purchased: ${p.q} boxes, $${(p.c/100).toFixed(2)} total`);
  for (const t of ['rips','sales']) {
    try { const r:any = await sql.unsafe(`SELECT COALESCE(SUM(quantity),0)::int q FROM ${t} WHERE catalog_item_id=${CI}`+(t==='sales'?' AND deleted_at IS NULL':'')); console.log(`${t}: ${r[0].q}`);} catch(e:any){ console.log(`${t}: ${String(e.message).slice(0,90)}`);}
  }
  const m:any = await sql`SELECT ebay_item_id, mappings FROM ebay_listing_mappings WHERE mappings::text LIKE ${'%'+CI+'%'}`;
  console.log('\nmappings:'); for(const x of m) console.log(`  ${x.ebay_item_id} ${JSON.stringify(x.mappings)}`);
  const cols:any = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='rips' ORDER BY ordinal_position`;
  console.log('\nrips columns: '+cols.map((c:any)=>c.column_name).join(', '));
  const recent:any = await sql`SELECT * FROM rips ORDER BY id DESC LIMIT 2`;
  for(const r of recent) console.log('  sample: '+JSON.stringify(r).slice(0,300));
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,500));process.exit(1);});
