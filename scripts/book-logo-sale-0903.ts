/**
 * Book the 11-card Logofractor order 14-15109-89335 (2026-09-03).
 *
 * Prices are the eBay per-line item cost, never the order total.
 * Re-comped first: every card sold within pennies of today's median, so this is
 * a clean sale at market rather than a leak.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const ITEM = '168654621848';
const DATE = '2026-09-03';
const ORDER = '14-15109-89335';
const LINES: [string, string, number][] = [
  ['139','Coby Mayo',299], ['86','Trey Yesavage',525], ['294','Luis Morales',199],
  ['19','Heriberto Hernandez',199], ['154','Manny Machado',300], ['115','Owen Caissie',299],
  ['65','Trevor Story',200], ['84','Maikel Garcia',199], ['166','Lourdes Gurriel Jr.',200],
  ['212','Sean Murphy',199], ['296','Chris Sale',299],
];
(async () => {
  let booked = 0, missing: string[] = [];
  for (const [num, player, cents] of LINES) {
    const rows: any = await sql`
      SELECT id FROM baseball_cards
      WHERE card_number=${num} AND player=${player} AND ebay_item_id=${ITEM}
        AND coalesce(sold_price_cents,0)=0 ORDER BY id LIMIT 1`;
    if (!rows.length) { missing.push(`#${num} ${player}`); continue; }
    console.log(`  #${String(num).padEnd(4)} ${player.padEnd(20)} $${(cents/100).toFixed(2)}  -> id${rows[0].id}`);
    if (!APPLY) continue;
    await sql`UPDATE baseball_cards
      SET sold_price_cents=${cents}, sold_date=${DATE}, status='sold', for_sale=false,
          notes = coalesce(notes,'') || ' SOLD on eBay order ' || ${ORDER} || ' (' || ${DATE} ||
                  '), one of 11 Logofractors taken by a single buyer in one order.'
      WHERE id=${rows[0].id}`;
    booked++;
  }
  if (missing.length) console.log('\nNO UNSOLD ROW FOUND:', missing.join(', '));
  console.log(APPLY ? `\nbooked ${booked}` : '\ndry run');
  await sql.end();
})();
