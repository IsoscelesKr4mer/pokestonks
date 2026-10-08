/**
 * Target Northgate (302 NE Northgate Way, Seattle), 2026-10-07, four receipts
 * between 16:46 and 17:02.
 *
 *   npx tsx scripts/log-target-northgate-1007.ts
 *
 * Michael: "I got lucky on a target restock today. Go 8 30th anniversary
 * bundles, 4 30th tins, and 4 bowman chrome mega boxes." All four receipts
 * photographed (IMG_0808) and they reconcile exactly, so nothing here is
 * estimated.
 *
 * RECEIPTS, read off the photo:
 *   16:46  bag 0.12 | 2x12.99 = 25.98 | 2x31.99 = 63.98 | 2x49.99 = 99.98
 *          subtotal 190.06, tax 20.05, total 210.11
 *   16:50  bag 0.12 | 2x31.99 = 63.98 | 2x12.99 = 25.98 | 2x49.99 = 99.98
 *          subtotal 190.06, tax 20.05, total 210.11
 *   16:54  2x31.99 = 63.98, subtotal 63.98, tax 6.75, total 70.73
 *   17:02  2x31.99 = 63.98, subtotal 63.98, tax 6.75, total 70.73
 *
 * UNITS, summed across the four: 8 at $31.99, 4 at $12.99, 4 at $49.99.
 * That matches his stated 8 / 4 / 4 exactly, so the split is confirmed rather
 * than inferred.
 *
 * TAX is "WA TAX 10.55000" on every receipt, Seattle's rate. Unit cost is
 * sticker x 1.1055:
 *   $31.99 -> $35.36   30th Celebration Booster Bundle
 *   $12.99 -> $14.36   a 30th Celebration Mini Tin, variant UNKNOWN
 *   $49.99 -> $55.26   2026 Bowman Chrome Baseball Mega Box
 *
 * The mega figure is corroborated: catalog 135610's two prior lots cost
 * $55.27 and $55.34, so 10.55% on a $49.99 sticker is the right model.
 *
 * WHAT THIS SCRIPT LOGS, AND WHAT IT DELIBERATELY DOES NOT:
 *
 *  - 8 Booster Bundles. Logged.
 *  - 4 Bowman Chrome Mega Boxes. NOT logged, at his instruction: "dont worry
 *    about logging the megas tho cause im gonna rip them." Consistent with
 *    how the two ledgers divide: pokestonks tracks sealed product bought to
 *    resell sealed, and a box leaves that business the moment it is opened.
 *    Their cost ($55.26 each, $221.06 for the four) belongs on the RIP.
 *  - 4 Mini Tins. NOT logged, because the catalog holds TEN mini tin variants
 *    (Day Pikachu, Espeon, Greninja, Lapras, Mew, Mewtwo, Moltres, Night
 *    Pikachu, Umbreon, Zapdos) and Target rings every one of them under the
 *    single DPCI 361000053, so the receipt cannot say which four he has.
 *    Asked rather than guessed. $14.36 each when the variants are known.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-10-07';

const BUNDLE_ID = 133883; // 30th Celebration Booster Bundle
const BUNDLE_QTY = 8;
const BUNDLE_CENTS = 3536; // $31.99 x 1.1055 Seattle

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!, {
    ssl: 'require',
    connect_timeout: 20,
    max: 1,
  });

  const [ci] = await sql`select id, name from catalog_items where id = ${BUNDLE_ID}`;
  if (!ci) throw new Error(`catalog item ${BUNDLE_ID} missing`);
  if (!ci.name.includes('30th Celebration Booster Bundle')) {
    throw new Error(`catalog ${BUNDLE_ID} is "${ci.name}", not the 30th bundle`);
  }

  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${BUNDLE_ID} and purchase_date = ${DATE} and deleted_at is null`;
  if (dupe.n) {
    console.log('already logged for ' + DATE + ', nothing written');
    await sql.end();
    return;
  }

  const [r] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
      quantity, cost_cents, source, location, notes)
    values (${USER}, ${BUNDLE_ID}, ${DATE}, ${BUNDLE_QTY}, ${BUNDLE_CENTS}, 'Target', 'Seattle, WA',
      ${'Target Northgate, 302 NE Northgate Way. Restock. Four receipts 16:46 to 17:02, all ' +
        'photographed (IMG_0808) and reconciling exactly. Sticker $31.99 x 1.1055 for Seattle ' +
        "10.55%. Bought alongside 4 Bowman Chrome mega boxes (NOT logged, he is ripping them, " +
        'cost $55.26 each belongs on the rip) and 4 30th mini tins (NOT logged, variants ' +
        'unknown: Target rings all ten mini tin variants under one DPCI).'})
    returning id`;

  console.log(
    `logged pu#${r.id}  x${BUNDLE_QTY} @ $${(BUNDLE_CENTS / 100).toFixed(2)}` +
      `  = $${((BUNDLE_QTY * BUNDLE_CENTS) / 100).toFixed(2)}  ${ci.name}`
  );

  const [held] = await sql`select coalesce(sum(quantity), 0)::int q
    from purchases where catalog_item_id = ${BUNDLE_ID} and deleted_at is null`;
  console.log(`lifetime lots of this SKU: ${held.q} unit(s)`);
  console.log('\nNOT logged, deliberately: 4 mega boxes (ripping) and 4 mini tins (variants unknown).');
  await sql.end();
})();
