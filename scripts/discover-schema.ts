import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const t=await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log('tables:', t.map(r=>r.table_name).join(', '));
  // find market/price tables columns
  for(const name of ['price_snapshots','market_prices','prices','catalog_items','rips','box_decompositions','decompositions']){
    const c=await sql`SELECT column_name FROM information_schema.columns WHERE table_name=${name} AND table_schema='public' ORDER BY ordinal_position`;
    if(c.length) console.log(`\n${name}: ${c.map(r=>r.column_name).join(', ')}`);
  }
  // product types
  const pt=await sql`SELECT product_type, COUNT(*)::int n FROM catalog_items GROUP BY product_type ORDER BY n DESC`;
  console.log('\nproduct_types:', pt.map(r=>`${r.product_type}(${r.n})`).join(', '));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
