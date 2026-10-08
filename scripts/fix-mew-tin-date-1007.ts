/**
 * Correct pu641's date. I derived 2026-07-15 and was wrong.
 *
 *   npx tsx scripts/fix-mew-tin-date-1007.ts
 *
 * Michael: "no tins were released on 10/2 w/ bundles".
 *
 * What I got wrong and why it is worth writing down: I reasoned that the
 * earliest 30th Celebration purchases in the ledger were release day. Those
 * six lots are all dated 2026-07-15 and all sourced "Pokemon Center", which is
 * the clue I walked past. **A Pokemon Center date is not a retail release
 * date.** It is a preorder or an early-access window, routinely months ahead,
 * and the mini tins did not exist at retail then at all.
 *
 * So the rule to keep: do not infer a product's release date from the earliest
 * purchase of its FAMILY, and treat a Pokemon Center lot as evidence about
 * Pokemon Center, not about the shelves.
 *
 * Asserts the current value before writing, so a stale fix cannot clobber a
 * corrected row.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const PURCHASE_ID = 641;
const WRONG_DATE = '2026-07-15';
const RIGHT_DATE = '2026-10-02';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [row] = await sql`
    select p.id, p.purchase_date::text d, p.cost_cents, p.quantity, c.name
    from purchases p join catalog_items c on c.id = p.catalog_item_id
    where p.id = ${PURCHASE_ID} and p.deleted_at is null`;
  if (!row) throw new Error(`purchase ${PURCHASE_ID} not found`);
  if (!row.name.includes('Mini Tin [Mew]')) {
    throw new Error(`pu${PURCHASE_ID} is "${row.name}", not the Mew tin`);
  }
  if (row.d !== WRONG_DATE) {
    console.log(`pu${PURCHASE_ID} is already ${row.d}, not ${WRONG_DATE}. Nothing to do.`);
    await sql.end();
    return;
  }

  await sql`
    update purchases
    set purchase_date = ${RIGHT_DATE},
        notes = ${'Bought at Zulu\'s Board Games, Lynnwood, on 30th Celebration retail release ' +
          'day, reported 2026-10-07 alongside the Target restock. Cost is $12.99 x 1.10699 for ' +
          'Lynnwood 10.699%, since he said "the same price" as the Target tins and Zulu\'s is ' +
          'not in Seattle. DATE CORRECTED 2026-10-07: I first derived 2026-07-15 from the ' +
          'earliest 30th lots in the ledger, which are all Pokemon Center. A Pokemon Center date ' +
          'is a preorder window, not a retail release; Michael: "no tins were released on 10/2 ' +
          'w/ bundles".'}
    where id = ${PURCHASE_ID}`;

  const [after] = await sql`select purchase_date::text d, cost_cents from purchases where id = ${PURCHASE_ID}`;
  console.log(`pu${PURCHASE_ID}: ${WRONG_DATE} -> ${after.d}, $${(after.cost_cents / 100).toFixed(2)} unchanged`);
  await sql.end();
})();
