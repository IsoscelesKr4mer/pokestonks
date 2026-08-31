import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const c:any = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='sales' ORDER BY ordinal_position`;
  console.log('sales cols:', c.map((x:any)=>x.column_name).join(', '));
  const b:any = await sql`SELECT COALESCE(SUM(quantity),0) q FROM purchases WHERE catalog_item_id=76 AND deleted_at IS NULL`;
  const s:any = await sql`SELECT COALESCE(SUM(s.quantity),0) q FROM sales s JOIN purchases p ON p.id=s.purchase_id WHERE p.catalog_item_id=76`;
  console.log(`AH bundle: bought ${b[0].q}, sold ${s[0].q}, on hand ${b[0].q - s[0].q}`);
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
