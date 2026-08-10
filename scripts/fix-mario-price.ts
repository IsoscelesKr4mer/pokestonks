import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE sales SET sale_price_cents=8500, notes='Mario - AH Booster Bundle $85 cash'
    WHERE notes='Mario - AH Booster Bundle $80 cash' AND sale_price_cents=8000 RETURNING id, sale_price_cents`;
  console.log('updated rows:', r.length, r.map((x:any)=>`sale#${x.id} -> $${(x.sale_price_cents/100).toFixed(2)}`).join(', '));
  await sql.end();
}
main();
