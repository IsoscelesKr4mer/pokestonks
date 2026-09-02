/**
 * Which personal-collection cards are currently listed for sale.
 *
 * PC status lives only in free text in `notes`. There is no column for it, so
 * nothing in the listing path can check it: a card is protected only if whoever
 * is listing happens to read the note. Michael's Lazaro Montes BCP-58 had NO
 * note at all and sold for $4.99 the night he was called up.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
(async()=>{
  const listed:any = await sql`
    SELECT id, player, set_name, card_number, parallel, asking_price_cents a, ebay_item_id, left(notes,90) n
    FROM baseball_cards
    WHERE coalesce(sold_price_cents,0)=0 AND status='listed'
      AND (notes ILIKE '%keeper%' OR notes ILIKE '%\mPC\M%' OR notes ~ '\yPC\y')
    ORDER BY asking_price_cents DESC NULLS LAST`;
  console.log(`PC-noted cards CURRENTLY LISTED: ${listed.length}`);
  listed.forEach((r:any)=>console.log(`  id${r.id} ${r.player} | ${r.set_name} #${r.card_number??'-'} | ${r.parallel} | $${r.a!=null?(r.a/100).toFixed(2):'-'} | item ${r.ebay_item_id}\n      ${r.n}`));

  const pcTotal:any = await sql`SELECT count(*) c FROM baseball_cards
    WHERE coalesce(sold_price_cents,0)=0 AND (notes ILIKE '%keeper%' OR notes ~ '\yPC\y')`;
  const noNote:any = await sql`SELECT count(*) c FROM baseball_cards
    WHERE coalesce(sold_price_cents,0)=0 AND status='listed' AND (notes IS NULL OR notes='')`;
  console.log(`\nPC-noted cards in the vault at all: ${pcTotal[0].c}`);
  console.log(`Listed cards with NO note whatsoever (a PC card here is invisible): ${noNote[0].c}`);

  const cols:any = await sql`SELECT column_name FROM information_schema.columns
    WHERE table_name='baseball_cards' AND column_name ILIKE '%pc%' OR column_name ILIKE '%keep%'`;
  console.log('columns that could hold PC status:', cols.length?cols.map((c:any)=>c.column_name).join(', '):'NONE');
  await sql.end();
})();
