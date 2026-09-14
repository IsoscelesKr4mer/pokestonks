/**
 * Log the 10 NBA Chrome Update megas from the Fred Meyer restock.
 *
 *   npx tsx scripts/log-fredmeyer-nba-megas-0914.ts --apply
 *
 * Michael: "i just bought 10 NBA Topps Chrome Update mega boxes at fred meyer
 * i caught a crazy restock and they let me buy them all. 84.99 msrp."
 *
 * Unit cost is PROVISIONAL. He gave the shelf price, not the receipt total.
 * $84.99 + 10.55% is the exact arithmetic on all four of his earlier mega
 * lots, so $93.96 is his own number applied to his own stated price rather
 * than a guess, but it assumes tax was charged and no reward certificate was
 * used. Same shape as the "PROVISIONAL COUNT of 2" note he already has on
 * purchase 540. Confirm against the receipt.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG = 135078;          // 2025-26 Topps Chrome Update Basketball Mega Box
const QTY = 10;
const SHELF = 84.99;
const TAX = 0.1055;              // the rate on every prior lot of this exact box
const UNIT = Math.round(SHELF * (1 + TAX) * 100);   // 9396

(async () => {
  const [ci]: any = await sql`select id, name from catalog_items where id = ${CATALOG}`;
  if (!ci) throw new Error('catalog item ' + CATALOG + ' not found');
  const [{ user_id }]: any = await sql`select user_id from purchases where catalog_item_id = ${CATALOG} limit 1`;

  console.log(ci.name);
  console.log('qty ' + QTY + ' @ $' + (UNIT/100).toFixed(2) + '  =  $' + (UNIT*QTY/100).toFixed(2));
  console.log('  ($' + SHELF.toFixed(2) + ' shelf + ' + (TAX*100).toFixed(2) + '% tax, PROVISIONAL)');
  if (!APPLY) { console.log('\nDRY RUN, pass --apply'); await sql.end(); return; }

  const [ins]: any = await sql`insert into purchases
      (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    values (${user_id}, ${CATALOG}, '2026-09-14', ${QTY}, ${UNIT}, 'Fred Meyer', null,
      ${'Caught a restock and they let him take all 10. $' + SHELF.toFixed(2) +
        ' shelf price stated by Michael. PROVISIONAL unit cost: ' + (TAX*100).toFixed(2) +
        '% tax applied, which is the exact rate on all four earlier mega lots, so $' + (UNIT/100).toFixed(2) +
        '/box. Assumes tax was charged and no reward certificate. Confirm against the receipt. ' +
        'Market context at logging: he sold 7 of these in August at $119.99 to $134.99, avg $126.42; ' +
        'live asks that day ran $180 low, $229.99 median.'})
    returning id`;
  console.log('\nlogged purchase ' + ins.id);

  const tot: any = await sql`select sum(quantity) bought,
      coalesce((select sum(s.quantity) from sales s join purchases p2 on p2.id=s.purchase_id
        where p2.catalog_item_id=${CATALOG}),0) sold
    from purchases where catalog_item_id=${CATALOG} and deleted_at is null`;
  console.log('mega boxes: bought ' + tot[0].bought + ', sold ' + tot[0].sold + ', on hand ' + (tot[0].bought - tot[0].sold));
  await sql.end();
})();
