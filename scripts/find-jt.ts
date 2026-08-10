import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r=await sql`SELECT id,name,product_type FROM catalog_items WHERE name ILIKE '%journey together%' ORDER BY name`;
  for(const x of r) console.log(`ci${x.id} [${x.product_type}] ${x.name}`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
