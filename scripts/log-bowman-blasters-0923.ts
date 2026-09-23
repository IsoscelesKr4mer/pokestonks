/**
 * Log 8 x 2025-26 Bowman Basketball Blaster Box, Fred Meyer Lynnwood 09-23.
 *
 *   npx tsx scripts/log-bowman-blasters-0923.ts
 *
 * Receipt: 2902 164th St SW, Lynnwood, 09/23/26. 8 x TRADE CARDS @ $29.99 =
 * $239.92, checkout bag $0.08, tax $25.19, balance $265.19, 8 items.
 *
 * Tax is $25.19 on $240.00, which is 10.496%, NOT the 10.699% recorded in memory
 * for Lynnwood. Unit cost is therefore $33.15 ($29.99 x 1.105), and 8 x $33.15 =
 * $265.20 against $265.19 paid, a one-cent rounding gap left unallocated.
 *
 * No catalog row existed for the blaster; only the Mega Box (ci135081). Sports
 * sealed is not on TCGCSV so the row is created by hand with no tcgplayer id.
 *
 * catalog_items.id is NOT a clean serial: most rows carry TCGplayer product ids
 * inserted explicitly, which leaves the sequence behind them. The first insert
 * here failed on catalog_items_pkey with "Key (id)=(135611) already exists"
 * because nextval handed back an id a hand-made row already held. Resyncing the
 * sequence past max(id) before inserting avoids it.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  let [ci] = await sql`select id, name from catalog_items
    where name = '2025-26 Bowman Basketball Blaster Box'`;
  if (!ci) {
    await sql`select setval('catalog_items_id_seq',
      (select max(id) from catalog_items), true)`;
    const [m] = await sql`select set_name, release_date from catalog_items where id = 135081`;
    const [r] = await sql`insert into catalog_items (kind, name, set_name, product_type,
        msrp_cents, release_date)
      values ('sealed', '2025-26 Bowman Basketball Blaster Box', ${m?.set_name ?? null},
        'Blaster Box', 2999, ${m?.release_date ?? null})
      returning id, name`;
    ci = r;
    console.log('created catalog item ci' + ci.id + '  ' + ci.name);
  } else console.log('catalog item exists: ci' + ci.id);

  const [dupe] = await sql`select count(*)::int n from purchases
    where catalog_item_id = ${ci.id} and purchase_date = '2026-09-23' and deleted_at is null`;
  if (dupe.n) { console.log('already logged'); await sql.end(); return; }

  const [p] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
      quantity, cost_cents, source, location, notes)
    values (${USER}, ${ci.id}, '2026-09-23', 8, 3315, 'Fred Meyer', 'Lynnwood, WA',
      ${'2902 164th St SW. Receipt: 8 x $29.99 = $239.92 plus $0.08 bag plus $25.19 ' +
        'tax = $265.19. That tax is 10.496% on $240.00, not the 10.699% on file for ' +
        'Lynnwood, so this store bills the same 10.50% as Shoreline. TradePost was ' +
        'quoting $42.04 and up 14.77% over 30 days at the time of purchase.'})
    returning id`;
  console.log('logged pu' + p.id + '  x8 @ $33.15  = $265.20  (receipt $265.19, 1c rounding)');
  await sql.end();
})();
