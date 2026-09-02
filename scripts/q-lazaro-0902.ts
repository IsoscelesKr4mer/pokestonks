import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const r:any = await sql`SELECT id, player, set_name, card_number, parallel, status, for_sale,
      ebay_item_id, ebay_sku, asking_price_cents a, sold_price_cents s, sold_date::text d,
      updated_at::text u, created_at::text c, left(notes,300) n
    FROM baseball_cards WHERE player ILIKE '%lazaro%' OR player ILIKE '%montes%' ORDER BY id`;
  console.log(`${r.length} Lazaro Montes rows:\n`);
  r.forEach((x:any)=>console.log(
    `id${x.id} | ${x.set_name} #${x.card_number??'-'} | ${x.parallel}\n` +
    `   status ${x.status} / ${x.for_sale?'for sale':'not for sale'} | item ${x.ebay_item_id??'-'} sku ${x.ebay_sku??'-'}\n` +
    `   ask ${x.a!=null?'$'+(x.a/100).toFixed(2):'-'} | sold ${x.s?'$'+(x.s/100).toFixed(2)+' on '+x.d:'no'}\n` +
    `   created ${x.c?.slice(0,10)} updated ${x.u?.slice(0,10)}\n   notes: ${x.n}\n`));
  await sql.end();
})();
