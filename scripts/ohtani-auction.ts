import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const r = await sql`UPDATE baseball_cards
    SET asking_price_cents=NULL,
        comp_note='Last sold $129.49 (auction, 21 bids, 2026-06-18); none currently listed.',
        notes='AUCTION candidate - too volatile to fix-price; Shohei market spiking since the last sale (per Michael). List as auction when ready.'
    WHERE player='Shohei Ohtani' AND set_name='2021 Topps Chrome'
    RETURNING id`;
  console.log('updated:', JSON.stringify(r));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
