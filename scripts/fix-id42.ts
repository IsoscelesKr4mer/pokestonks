import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE baseball_cards SET player='George Kirby', set_name='Bowman Chrome Sapphire', card_number=null
    WHERE id=42 RETURNING id, player`;
  console.log('fixed:', JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
