import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync } from 'fs';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const rows = await sql`SELECT id, player, parallel, card_number, set_name, photo_urls
    FROM baseball_cards
    WHERE set_name ILIKE '%2026 Topps Chrome%' AND jsonb_array_length(photo_urls) > 0
    ORDER BY id`;
  const list = rows.map(r=>({id:r.id, player:r.player, parallel:r.parallel, set:r.set_name, front:(r.photo_urls as string[])[0]}));
  console.log('collage cards:', list.length);
  for(const c of list) console.log(`  ${c.player} | ${c.parallel} | ${c.set}`);
  writeFileSync('scripts/collage-list.json', JSON.stringify(list,null,2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
