import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE baseball_cards
    SET set_name='Bowman Chrome Sapphire', parallel='Gold Sapphire /50 (12/50)', for_sale=false
    WHERE player='Ryan Sloan' AND set_name='2026 Bowman Chrome Prospects'
    RETURNING id, player, set_name, parallel, for_sale`;
  console.log('fixed:', JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
