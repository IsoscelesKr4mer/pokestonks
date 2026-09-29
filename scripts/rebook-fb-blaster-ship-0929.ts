/**
 * The blaster shipped cheaper than the buyer paid. Credit the surplus.
 *
 *   npx tsx scripts/rebook-fb-blaster-ship-0929.ts --apply
 *
 * "13 oz 8x8x4 it was $8 and change to ship so i could a couple extra shekels"
 *
 * Buyer paid $10.11 of calculated shipping; the label was about $8.50. That is
 * a SURPLUS, the mirror image of the Lorcana overrun, and it gets the mirror
 * treatment: only the difference moves, and here it moves in his favour.
 *
 *   booked   rev 39.99  fees 7.04 (ebay only)      cost 32.49  = +$0.46
 *   actual   rev 39.99  fees 7.04 - 1.61 surplus   cost 32.49  = +$2.07
 *
 * "$8 and change" is taken as $8.50; the true figure is somewhere in $8.01-8.99
 * so this is +/- 50 cents and the note says so.
 *
 * DO NOT "CORRECT" THE DECLARED WEIGHT DOWN. The box is 13 oz packed in his
 * 8x8x4 and the listing declares 1 lb. That padding is exactly why he collected
 * $10.11 against an $8.50 label, and on calculated shipping the padding is free
 * to him and protects against a heavier-than-expected package
 * ([[reference_shipping_package_specs]]). Trimming the declaration to 13 oz
 * would hand the difference to the buyer and shrink a margin that is already
 * two dollars.
 *
 * The mega's 1 lb 8 oz is still unmeasured and still the open risk, because
 * two of them quote as a combined 3 lb.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const SALE = 625;
const SURPLUS = 161;   // $10.11 collected less an assumed $8.50 label

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });
  const [s] = await sql`select id, sale_price_cents r, fees_cents f, matched_cost_cents c, notes
    from sales where id = ${SALE}`;
  if (!s) throw new Error('sale ' + SALE + ' missing');
  if (s.f !== 704) throw new Error('unexpected fees ' + s.f + ', already adjusted?');

  const nf = s.f - SURPLUS;
  console.log('sale#' + SALE + '  fees $' + (s.f / 100).toFixed(2) + ' -> $' + (nf / 100).toFixed(2)
    + '   profit $' + ((s.r - s.f - s.c) / 100).toFixed(2)
    + ' -> $' + ((s.r - nf - s.c) / 100).toFixed(2));
  if (!APPLY) { console.log('  dry run'); await sql.end(); return; }

  await sql`update sales set fees_cents = ${nf},
    notes = ${String(s.notes).replace(
      'WARNING: the $0.46 margin assumes the label matches the $10.11 quoted off a 9x7x3 '
      + 'at 1 lb declaration that was never weighed. Anything over $10.57 and this is a loss.',
      'SHIPPING SURPLUS: he weighed it at 13 oz packed in an 8x8x4 and the label ran "$8 and '
      + 'change" against $10.11 collected, so about $1.61 came back to him. Taken as an $8.50 '
      + 'label, which is +/- 50 cents. The 1 lb declaration is deliberately padded and should '
      + 'stay that way: on calculated shipping the padding is free to him and is what produced '
      + 'the surplus.')}
    where id = ${SALE}`;
  const [a] = await sql`select sale_price_cents r, fees_cents f, matched_cost_cents c from sales where id = ${SALE}`;
  console.log('  now: rev $' + (a.r / 100).toFixed(2) + '  fees $' + (a.f / 100).toFixed(2)
    + '  cost $' + (a.c / 100).toFixed(2) + '  = $' + ((a.r - a.f - a.c) / 100).toFixed(2));
  await sql.end();
})();
