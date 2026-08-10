import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const pb = await sql`SELECT id, name, product_type, set_name FROM catalog_items WHERE name ILIKE '%pitch black%' AND product_type ILIKE '%elite%' ORDER BY id`;
  console.log('Pitch Black ETBs:', JSON.stringify(pb, null, 2));
  // standard Pitch Black ETB = 53864 (retail; PC exclusive is 53866)
  const [p] = await sql`UPDATE purchases SET catalog_item_id=53864,
      notes='Pitch Black ETB $59.99 ($66 tax-in), bought for friend Brandon'
      WHERE id=477 RETURNING id, catalog_item_id`;
  console.log('updated purchase:', JSON.stringify(p));
  const [s] = await sql`UPDATE sales SET notes='Sold Pitch Black ETB to friend Brandon; Venmo $88'
      WHERE id=396 RETURNING id`;
  console.log('updated sale:', JSON.stringify(s));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
