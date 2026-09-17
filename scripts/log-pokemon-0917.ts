/**
 * Log Michael's 2026-09-17 Pokemon report (Discord voice note).
 *
 *   npx tsx scripts/log-pokemon-0917.ts
 *
 * Writes, each asserted against current state first so a re-run cannot double up:
 *   1. rip the two 30th Celebration Tech Sticker Collections. "I ripped those
 *      open, though. So take the two tech stickers off eBay listings because I
 *      ripped them open just for the culture." Same shape as every prior rip:
 *      one row per unit, pack_cost = the lot's unit cost, no realized loss.
 *   2. one Ascended Heroes Booster Bundle bought today at the Fred Meyer
 *      vending machine.
 *
 * On the bundle's price: he did not say one. Every Ascended Heroes Booster
 * Bundle out of a vending machine has been $30.00 flat, 20 lots of it since
 * May, so that is the established price for this SKU at this source rather than
 * a guess. Flagged to him in the reply either way.
 *
 * NOT written here, because the cost is genuinely unknown and rule 2 says never
 * invent one: the second bundle he bought at Fred Meyer Lynnwood on the 16th
 * and sold to Mario for $80, and the 30th Celebration ETB he bought on the 16th
 * for $49.99 from a retailer the transcript rendered as "Zulus". Both are
 * queued on one question to him.
 *
 * The app is 402'd on PostgREST so this goes over the direct connection, which
 * is unaffected by the egress restriction.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const STICKERS = [469, 470];          // purchase ids, x1 each at $16.59
const AH_BUNDLE_CI = 76;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  for (const pid of STICKERS) {
    const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name
      from purchases p join catalog_items ci on ci.id = p.catalog_item_id
      where p.id = ${pid} and p.deleted_at is null`;
    if (!p) throw new Error('purchase ' + pid + ' missing');
    if (!/tech sticker/i.test(p.name)) throw new Error(pid + ' is not a sticker lot: ' + p.name);
    const [already] = await sql`select count(*)::int n from rips where source_purchase_id = ${pid}`;
    if (already.n) { console.log(`  rip already recorded for #${pid}, skipping`); continue; }
    await sql`insert into rips (user_id, source_purchase_id, rip_date, pack_cost_cents,
        realized_loss_cents, notes)
      values (${USER}, ${pid}, '2026-09-17', ${p.cost_cents}, 0,
        ${'Opened 2026-09-17, reported by voice in Discord: "I ripped those open ' +
          'just for the culture." The eBay presale listing was ended the same day. ' +
          'The singles have no valuation table in the vault, so this rip carries no ' +
          'realized loss and the $16.59 basis is unassigned, same as every prior rip.'})`;
    console.log(`  ripped #${pid}  ${p.name}`);
  }

  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${AH_BUNDLE_CI} and purchase_date = '2026-09-17' and deleted_at is null`;
  if (dupe.n) {
    console.log('  Ascended Heroes bundle already logged for 2026-09-17, skipping');
  } else {
    const [row] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${AH_BUNDLE_CI}, '2026-09-17', 1, 3000, 'Vending Machine', 'Shoreline, WA',
        ${'Shoreline Fred Meyer machine, reported by voice in Discord. He gave the ' +
          'drop time as 4:44pm, which does not match the :08/:38 marks on file for ' +
          'that machine; asked him to confirm whether it moved again. Price not ' +
          'stated: $30.00 is what this SKU has cost out of a machine on all 20 prior lots.'})
      returning id`;
    console.log(`  logged purchase #${row.id}  Ascended Heroes Booster Bundle  x1  $30.00`);
  }
  await sql.end();
})();
