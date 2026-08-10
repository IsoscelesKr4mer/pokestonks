import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  await sql.unsafe(`ALTER TABLE "baseball_cards" ADD COLUMN IF NOT EXISTS "needs_back_photo" boolean NOT NULL DEFAULT true;`);
  // seed indices with a real BACK photo -> needs_back_photo = false
  const hasBack = ['00','01','02','03','04','05','06','07','08','09','10','12','13','14','15','16','17','18','59','66'];
  const re = `bbcard_(${hasBack.join('|')})_`;
  const res = await sql`UPDATE baseball_cards SET needs_back_photo=false
    WHERE (photo_urls->>0) ~ ${re} RETURNING id`;
  const counts = await sql`SELECT needs_back_photo, COUNT(*)::int AS c FROM baseball_cards GROUP BY needs_back_photo ORDER BY needs_back_photo`;
  const sellableNeedsBack = await sql`SELECT COUNT(*)::int AS c FROM baseball_cards WHERE for_sale=true AND needs_back_photo=true`;
  console.log('column added; set needs_back_photo=false on', res.length, 'cards (have backs)');
  console.log('counts:', JSON.stringify(counts));
  console.log('sellable + needs back (will show badge):', sellableNeedsBack[0].c);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
