import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE baseball_cards
    SET set_name='Bowman Chrome', parallel='Atomic Refractor', for_sale=true, needs_back_photo=true
    WHERE id=42 RETURNING id, player, set_name, parallel, for_sale`;
  console.log('id 42 ->', JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
