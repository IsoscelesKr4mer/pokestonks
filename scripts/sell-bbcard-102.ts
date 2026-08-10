import { config } from 'dotenv';
import postgres from 'postgres';
import { randomUUID } from 'crypto';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID='66200525-2237-4cc3-948f-aaafd3253d4b';
async function main(){
  await sql`UPDATE baseball_cards SET status='sold', sold_price_cents=199, sold_date='2026-07-25',
    notes='Sold via eBay order 21-14922-03164 (first baseball card sale!)' WHERE id=102 AND status='listed'`;
  // mark the order handled so the vault sync ignores this non-vault (baseball card) order
  const dup=await sql`SELECT 1 FROM ebay_synced_orders WHERE ebay_order_id='21-14922-03164'`;
  if(!dup.length) await sql`INSERT INTO ebay_synced_orders (user_id, ebay_order_id, sale_group_id, skipped) VALUES (${UID},'21-14922-03164',${randomUUID()},true)`;
  const r=await sql`SELECT id,player,card_number,status,sold_price_cents,sold_date FROM baseball_cards WHERE id=102`;
  console.log('id102',r[0].player,'#'+r[0].card_number,'->',r[0].status,'$'+(r[0].sold_price_cents/100).toFixed(2),r[0].sold_date);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
