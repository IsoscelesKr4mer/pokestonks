import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  const r=await sql`UPDATE baseball_cards SET status='sold', sold_price_cents=2949, sold_date='2026-07-25',
    notes='Sold via eBay order 10-14944-26765 ($29.49, Ground Advantage). Note: likely underpriced - Topps MVP buyback gives $40 store credit for a parallel MVP (Yordan MVP candidate)'
    WHERE id=152 AND status='listed' RETURNING id,player`;
  console.log(r.length? `id152 ${r[0].player} -> sold $29.49` : 'id152 not in listed status');
  const dup=await sql`SELECT 1 FROM ebay_synced_orders WHERE ebay_order_id='10-14944-26765'`;
  if(!dup.length) await sql`INSERT INTO ebay_synced_orders (user_id,ebay_order_id,sale_group_id,skipped) VALUES (${UID},'10-14944-26765',${randomUUID()},true)`;
  console.log('order flagged handled (non-vault)');
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
