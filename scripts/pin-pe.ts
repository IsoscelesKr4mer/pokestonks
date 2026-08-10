import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  await sql`UPDATE catalog_items SET manual_market_cents=8036, manual_market_at=NOW() WHERE id=19776`;
  console.log('Prismatic pinned to $80.36 (live TCGplayer)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
