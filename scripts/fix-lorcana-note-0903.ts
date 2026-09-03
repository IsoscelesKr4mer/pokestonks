/**
 * Correct the Lorcana sale note. My shipping warning was wrong.
 *
 * Michael: "it's not a thick envelope it defaulted to a 9x7x4 4lb 12oz package."
 *
 * He is right and the arithmetic backs him: 4 x 1 lb 3 oz is exactly 4 lb 12 oz,
 * so eBay multiplied the per-unit weight correctly rather than quoting for one.
 * I read the per-unit packageType off GetItem and treated it as the shipped
 * package, then priced a label at USPS retail rates for a weight I had guessed
 * at. eBay's commercial rate for 4 lb 12 oz in a 9x7x4 to Illinois is plausibly
 * the $9.69 collected.
 *
 * What is still worth him checking is the DIMENSIONS, not the weight: a Trove is
 * roughly 8x6x3, so four of them do not obviously fit a 9x7x4.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const NOTE = 'eBay order 02-15133-80366, 4x Illumineer\'s Trove @ $79.99 (item subtotal $319.96, order total ' +
  '$329.65 incl $9.69 shipping). Fees 13.25% of the full order total plus $0.40 once = $44.08, $11.02 a unit. ' +
  'SHIPPING: eBay shipped it as a 9x7x4 package at 4 lb 12 oz, which is exactly 4x the 1 lb 3 oz per-unit ' +
  'declaration, so the $9.69 calculated is a correct multiply at eBay commercial rates. My earlier note claiming ' +
  'a thick-envelope misdeclaration and a $7-8 shortfall was WRONG - Michael corrected it. Label cost still ' +
  'excluded from fees_cents until he confirms the actual figure.';
(async () => {
  const r: any = await sql`UPDATE sales SET notes=${NOTE}
    WHERE purchase_id=507 AND sale_date='2026-09-03' RETURNING id`;
  console.log(`corrected the note on ${r.length} sale rows: ${r.map((x: any) => 'sale#' + x.id).join(', ')}`);
  const tot: any = await sql`SELECT sum(sale_price_cents) rev, sum(fees_cents) f, sum(matched_cost_cents) c
    FROM sales WHERE purchase_id=507 AND sale_date='2026-09-03'`;
  const profit = (Number(tot[0].rev) - Number(tot[0].f) - Number(tot[0].c)) / 100;
  console.log(`revenue $${(tot[0].rev/100).toFixed(2)} - fees $${(tot[0].f/100).toFixed(2)} - cost $${(tot[0].c/100).toFixed(2)} = $${profit.toFixed(2)} before the label`);
  await sql.end();
})();
