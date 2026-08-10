import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE baseball_cards
    SET parallel='Black and White Mini-Diamond Refractor',
        asking_price_cents=13999,
        comp_note='Last sold $129.49 (auction, 21 bids, 2026-06-18); none currently listed. Scarce B&W Mini-Diamond variation - auto-pricer wrongly averaged in common refractors.'
    WHERE player='Shohei Ohtani' AND set_name='2021 Topps Chrome'
    RETURNING id, asking_price_cents`;
  console.log('fixed:', JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
