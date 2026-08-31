import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows:any = await sql`
    SELECT id, player, card_number, status, for_sale, asking_price_cents a, sold_price_cents sp, sold_date::text sd
    FROM baseball_cards WHERE set_name ILIKE '%Perspectives%' ORDER BY status, card_number`;
  rows.forEach((r:any)=>console.log(`#${r.id} ${String(r.card_number).padEnd(6)} ${String(r.player).padEnd(24)} ${r.status.padEnd(7)} for_sale=${r.for_sale} ask ${r.a!=null?'$'+(r.a/100).toFixed(2):'—'} ${r.sp?'SOLD $'+(r.sp/100).toFixed(2)+' '+r.sd:''}`));
  const agg:any = await sql`
    SELECT status, COUNT(*)::int c FROM baseball_cards WHERE set_name ILIKE '%Perspectives%' GROUP BY status ORDER BY status`;
  console.log('by status:', agg.map((r:any)=>`${r.status} ${r.c}`).join(' | '));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
