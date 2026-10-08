/**
 * Prismatic Evolutions Booster Bundle, Edmonds Safeway, 2026-10-07 15:42 PDT.
 *
 *   npx tsx scripts/log-prismatic-1007.ts
 *
 * Voice note: "I just found a Prismatic Booster Bundle at the Safeway in
 * Edmonds at 3.42 ... there was a Chaos Rising single pack, a Perfect Order
 * Booster Bundle, and a Prismatic Booster Bundle. I bought it, the Prismatic,
 * and then a Perfect Order single pack came up after that."
 *
 * "3.42" IS THE TIME, NOT A PRICE. Sixth occurrence of this transcription
 * shape. The message is stamped 2026-10-07T22:44:22Z = 15:44 Pacific, two
 * minutes after 15:42, and no vending bundle has ever cost $3.42.
 *
 * $30.00 is not estimated and not invented: it is what every vending bundle
 * has cost across 96+ prior lots, and what this exact SKU (catalog 19776) cost
 * on all four of its most recent lots (pu571, pu575, pu583, pu599). Flagged to
 * him in the reply anyway, because he has never stated a price for this one.
 *
 * NOT a fresh drop. Edmonds Safeway's marks are :01-:02 and :31-:32 (as
 * reported 2026-09-03), and 15:42 is eleven minutes past :31, so this was
 * stock already sitting on the screen. Same shape as pu599 on 08-26. That he
 * found THREE items sitting, and a fourth appeared while he stood there, is
 * the interesting part and is logged in drop_log.csv rather than here.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-10-07';
const CATALOG_ID = 19776; // Prismatic Evolutions Booster Bundle, his own prior lots
const QTY = 1;
const CENTS = 3000;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [ci] = await sql`select id, name from catalog_items where id = ${CATALOG_ID}`;
  if (!ci) throw new Error(`catalog item ${CATALOG_ID} missing`);
  if (!ci.name.includes('Prismatic Evolutions Booster Bundle')) {
    throw new Error(`catalog ${CATALOG_ID} is "${ci.name}", not the Prismatic bundle`);
  }

  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${CATALOG_ID} and purchase_date = ${DATE} and deleted_at is null`;
  if (dupe.n) {
    console.log('already logged for ' + DATE + ', nothing written');
    await sql.end();
    return;
  }

  const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
      quantity, cost_cents, source, location, notes)
    values (${USER}, ${CATALOG_ID}, ${DATE}, ${QTY}, ${CENTS}, 'Vending Machine', 'Edmonds, WA',
      ${'Edmonds Safeway 15:42 PDT. SITTING STOCK, not a fresh drop: the machine marks are ' +
        ':01-:02 and :31-:32, and 15:42 is eleven minutes past. Three items were on the screen ' +
        'when he arrived (this bundle, a Perfect Order bundle, a Chaos Rising single pack) and ' +
        'a Perfect Order single pack appeared while he stood there. He did not state a price; ' +
        '$30.00 is the flat vending bundle rate across 96+ prior lots and all four prior lots ' +
        'of this SKU. Voice note "at 3.42" is the TIME, sixth time that shape has come up.'})
    returning id`;

  console.log(
    `logged pu#${r.id}  x${QTY} @ $${(CENTS / 100).toFixed(2)}  ${ci.name}`
  );

  const [held] = await sql`select coalesce(sum(quantity), 0)::int q
    from purchases where catalog_item_id = ${CATALOG_ID} and deleted_at is null`;
  console.log(`lifetime lots of this SKU: ${held.q} unit(s)`);
  await sql.end();
})();
