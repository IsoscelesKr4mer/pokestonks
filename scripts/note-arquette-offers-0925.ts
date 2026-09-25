/**
 * Record the offer history on the Arquette Orange Shimmer /25.
 *
 * "I declined - realized I've already declined a $110 offer. That $75 was a
 * lowball"
 *
 * The $110 is the single most valuable number on this card and it existed only
 * in his head. eBay's GetBestOffers returns ONE offer on this listing, the $75
 * now marked Declined; the $110 has aged off the API entirely. If it is not
 * written down here it is gone.
 *
 * Why it matters more than any ask: every other figure on this card is an ask,
 * and there is still no live ask anywhere for BCP-174 Orange Shimmer /25. A
 * real offer is the closest thing to a sold comp this card has ever produced,
 * and at $110 it sits at the TOP of the $70-$118 band the nearest asks imply.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const ADD = ' | OFFER HISTORY (the only real demand data on this card, both via'
  + ' eBay 168680124149): $110 DECLINED, date not recorded, reported by Michael'
  + ' 2026-09-25 and already aged off the eBay API. $75 DECLINED 2026-09-25 as a'
  + ' lowball. $110 is the high-water mark of actual demand and sits at the top of'
  + ' the $70-$118 band the nearest asks imply, so treat $110 as the number to'
  + ' take rather than to beat. Ask has been $129.99 since 2026-09-11 with 1'
  + ' watcher and no sale in 14 days.';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });
  const [c] = await sql`select id, player, parallel, comp_note from baseball_cards where id = 560`;
  if (!c) throw new Error('card 560 missing');
  if (!/Arquette/i.test(c.player) || !/Orange Shimmer/i.test(c.parallel))
    throw new Error('card 560 is ' + c.player + ' / ' + c.parallel);
  if ((c.comp_note ?? '').includes('OFFER HISTORY')) { console.log('already noted'); await sql.end(); return; }
  await sql`update baseball_cards set comp_note = ${(c.comp_note ?? '') + ADD}, updated_at = now()
    where id = 560`;
  console.log('card 560  ' + c.player + '  ' + c.parallel);
  console.log('  offer history appended to comp_note');
  await sql.end();
})();
