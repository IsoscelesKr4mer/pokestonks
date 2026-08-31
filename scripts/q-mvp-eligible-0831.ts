/**
 * Which cards he owns are eligible for the 2026 Topps Chrome MVP Buyback?
 * Credit: base $20/15/15, refractor $40/30/35, #d>100 $100/75/85, #d<100 $200/150/175.
 * AL: Alvarez is a -20000 favourite. NL: Pete Crow-Armstrong leads, Ohtani second.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const NAMES = ['Alvarez','Crow-Armstrong','Ohtani','Caminero','Witt'];
(async()=>{
  for (const n of NAMES) {
    const r:any = await sql`
      SELECT id, player, year, set_name, card_number, parallel, status, for_sale,
             asking_price_cents p, ebay_item_id
      FROM baseball_cards
      WHERE player ILIKE ${'%'+n+'%'} AND set_name ILIKE '%2026 Topps Chrome%'
      ORDER BY card_number, id`;
    if (!r.length) { console.log(`${n}: none`); continue; }
    console.log(`\n=== ${n} — ${r.length} card(s) in 2026 Topps Chrome ===`);
    for (const c of r)
      console.log(`  #${String(c.id).padEnd(4)} ${String(c.card_number).padEnd(9)} ${String(c.parallel??'base').padEnd(34)} ${c.status.padEnd(11)} $${c.p?(c.p/100).toFixed(2):'-'}  ${c.ebay_item_id??''}`);
  }
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,400));process.exit(1);});
