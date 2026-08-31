import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const cols:any = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='baseball_cards' ORDER BY ordinal_position`;
  console.log('cols:', cols.map((c:any)=>c.column_name).join(', '));
  const r:any = await sql`SELECT * FROM baseball_cards WHERE player ILIKE '%murakami%' ORDER BY set_name, card_number`;
  console.log(`\n${r.length} Murakami rows in the vault:\n`);
  r.forEach((x:any)=>console.log(`  id${x.id} | ${x.set_name} | #${x.card_number} | ${x.parallel??'-'} | ${x.status??'-'} | ${x.price_cents!=null?'$'+(x.price_cents/100).toFixed(2):'no price'} | qty ${x.quantity??1} | ${x.notes??''}`));
  await sql.end();
}
main().catch(e=>{console.error(String(e).slice(0,600));process.exit(1);});
