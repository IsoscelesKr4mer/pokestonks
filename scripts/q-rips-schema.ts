import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cols = await sql`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='rips' ORDER BY ordinal_position`;
  console.log('rips columns:');
  for (const c of cols) console.log(' ', c.column_name, c.data_type, c.is_nullable, c.column_default||'');
  const sample = await sql`SELECT * FROM rips ORDER BY id DESC LIMIT 2`;
  console.log('\nrecent rips:', JSON.stringify(sample, null, 2));
  // the PO pack purchase I just created
  const po = await sql`SELECT id, catalog_item_id, purchase_date, quantity, cost_cents, notes FROM purchases WHERE catalog_item_id=19843 AND deleted_at IS NULL ORDER BY id DESC LIMIT 3`;
  console.log('\nrecent PO purchases:', JSON.stringify(po, null, 2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
