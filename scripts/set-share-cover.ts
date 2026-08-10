import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // undo the wrong hide
  await sql`UPDATE baseball_cards SET hidden_from_share=false WHERE id IN (31,38)`;
  // cover-image flag
  await sql`ALTER TABLE baseball_cards ADD COLUMN IF NOT EXISTS is_share_cover boolean NOT NULL DEFAULT false`;
  await sql`UPDATE baseball_cards SET is_share_cover=false`; // clear any
  await sql`UPDATE baseball_cards SET is_share_cover=true WHERE id=31`; // Kade Anderson Blue Sapphire (1st Bowman)
  const r=await sql`SELECT id,player,parallel,hidden_from_share,is_share_cover,photo_urls->>0 photo FROM baseball_cards WHERE id IN (31,38)`;
  r.forEach((x:any)=>console.log(`id${x.id} ${x.player} [${x.parallel}] hidden=${x.hidden_from_share} cover=${x.is_share_cover} photo=${x.photo?.slice(-40)}`));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
