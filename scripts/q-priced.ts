import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  const byStatus = await sql`SELECT status, COUNT(*)::int c FROM baseball_cards WHERE for_sale=true GROUP BY status ORDER BY status`;
  console.log('sellable by status:', JSON.stringify(byStatus));
  const nocomp = await sql`SELECT id, player, set_name, card_number, parallel FROM baseball_cards WHERE for_sale=true AND status='photographed'`;
  console.log('no-comp (still photographed):', JSON.stringify(nocomp));
  const agg = await sql`SELECT MIN(asking_price_cents) lo, MAX(asking_price_cents) hi, ROUND(AVG(asking_price_cents))::int avg, SUM(asking_price_cents) total FROM baseball_cards WHERE for_sale=true AND status='priced'`;
  console.log('priced $ range: low $'+(agg[0].lo/100).toFixed(2)+' / avg $'+(agg[0].avg/100).toFixed(2)+' / high $'+(agg[0].hi/100).toFixed(2)+' / total sticker $'+(agg[0].total/100).toFixed(2));
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
