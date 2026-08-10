import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main() {
  console.log('=== sales columns ===');
  const cols = await sql`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='sales' ORDER BY ordinal_position`;
  for (const c of cols) console.log(`  ${c.column_name} | ${c.data_type} | null=${c.is_nullable} | def=${c.column_default??''}`);

  console.log('\n=== a recent sales row (shape reference) ===');
  const ex = await sql`SELECT * FROM sales ORDER BY created_at DESC LIMIT 1`;
  console.log(JSON.stringify(ex[0], null, 1));

  console.log('\n=== open lots to consume ===');
  for (const id of [19776, 31604]) {
    const lots = await sql`
      SELECT p.id AS purchase_id, p.purchase_date, p.cost_cents,
        (p.quantity - COALESCE((SELECT COUNT(*) FROM rips rr WHERE rr.source_purchase_id=p.id),0)
        - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
        - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)) AS qty_left
      FROM purchases p WHERE p.catalog_item_id=${id} AND p.deleted_at IS NULL
      ORDER BY p.purchase_date, p.created_at`;
    console.log(`item #${id}:`); 
    for (const l of lots) if (Number(l.qty_left)>0) console.log(`  purchase#${l.purchase_id} ${l.purchase_date instanceof Date?l.purchase_date.toISOString().slice(0,10):l.purchase_date} $${(l.cost_cents/100).toFixed(2)} qtyLeft ${l.qty_left}`);
  }
  await sql.end();
}
main();
