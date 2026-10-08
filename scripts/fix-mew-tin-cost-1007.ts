/**
 * Correct pu641's cost. $11.99 at Zulu's, not $12.99.
 *
 *   npx tsx scripts/fix-mew-tin-cost-1007.ts
 *
 * Michael: "well it was actually 11.99 at zulus".
 *
 * The mistake, which is the same shape as the date one an hour earlier: he
 * said "for the same price", and I read that as the same STICKER as the Target
 * tins and carefully applied the right city's tax to a number he never gave
 * me. A derived tax rate on an assumed sticker is still an assumed cost.
 * "The same price" is a loose phrase and it needed confirming, not parsing.
 *
 * $11.99 x 1.10699 (Lynnwood 10.699%) = $13.27.
 *
 * Asserts the current value before writing, so a stale fix cannot clobber a
 * corrected row.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const PURCHASE_ID = 641;
const WRONG_CENTS = 1438;
const RIGHT_CENTS = 1327; // $11.99 x 1.10699

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [row] = await sql`
    select p.id, p.cost_cents, p.purchase_date::text d, c.name
    from purchases p join catalog_items c on c.id = p.catalog_item_id
    where p.id = ${PURCHASE_ID} and p.deleted_at is null`;
  if (!row) throw new Error(`purchase ${PURCHASE_ID} not found`);
  if (!row.name.includes('Mini Tin [Mew]')) {
    throw new Error(`pu${PURCHASE_ID} is "${row.name}", not the Mew tin`);
  }
  if (row.cost_cents !== WRONG_CENTS) {
    console.log(`pu${PURCHASE_ID} is already $${(row.cost_cents / 100).toFixed(2)}. Nothing to do.`);
    await sql.end();
    return;
  }

  await sql`
    update purchases
    set cost_cents = ${RIGHT_CENTS},
        notes = ${"Bought at Zulu's Board Games, Lynnwood, on 30th Celebration retail release " +
          'day 2026-10-02, reported 2026-10-07 alongside the Target restock. $11.99 sticker x ' +
          '1.10699 for Lynnwood 10.699%. TWO CORRECTIONS on 2026-10-07, both mine: the date was ' +
          'first derived as 2026-07-15 from the earliest 30th lots, which are all Pokemon Center ' +
          'and so a preorder window rather than a retail release; and the cost was first derived ' +
          'as $12.99 x tax because he said "the same price" as the Target tins, which he then ' +
          'corrected to $11.99. A derived tax rate on an assumed sticker is still an assumed ' +
          'cost.'}
    where id = ${PURCHASE_ID}`;

  const [after] = await sql`
    select purchase_date::text d, cost_cents from purchases where id = ${PURCHASE_ID}`;
  console.log(
    `pu${PURCHASE_ID}: $${(WRONG_CENTS / 100).toFixed(2)} -> $${(after.cost_cents / 100).toFixed(2)}, ` +
      `date ${after.d} unchanged`
  );
  await sql.end();
})();
