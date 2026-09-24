/**
 * Log the 2026-09-23 non-Pokemon buys: One Piece DP-12 and two Lorcana bundles.
 *
 *   npx tsx scripts/log-op12-lorcana-0923.ts
 *
 * Neither product had a catalog row, so this creates both.
 *
 *   One Piece Double Pack Set Vol. 12   B&N Lynnwood   $12.99 + 10.50% = $14.35
 *   Lorcana Wilds Unknown Best Buddies  Costco Shoreline  2 x $39.99 + 10.50% = $88.38
 *
 * Lynnwood is 10.50%, receipt-confirmed 2026-09-23, NOT the 10.699% that was on
 * file. Shoreline is 10.50% as well, confirmed at this same Costco.
 *
 * COST ASSUMPTION ON THE LORCANA: he wrote "$39.99 for the Lorcana best buddies
 * bundle x2 ... for 39.99", repeating the number, which reads as a unit price
 * rather than a pair price. $39.99 for two would be $20 a bundle, below the
 * value of the six packs inside, so the unit reading is the only sane one.
 * If he says otherwise the fix is cost_cents -> 2210 on pu for qty 2.
 *
 * MARKET VALUES, and what they are:
 *
 *   DP-12         TCGplayer market $37.65 (TCGCSV 68/24736/704757, product is
 *                 real and priced). eBay sealed asks: 55 of them, delivered
 *                 median $40.52, low $28.99.
 *   Best Buddies  NOT IN TCGCSV AT ALL. It is a Costco exclusive and TCGplayer
 *                 does not carry the SKU, so manual_market_cents is the only
 *                 option. Set to $90.00, the delivered median of 91 sealed eBay
 *                 ASKS (low $71.50, 25th $85.00). **That is an ask median, not
 *                 a sold median** - Marketplace Insights is not approved on this
 *                 account. Treat it as an upper bound until sold comps confirm.
 *
 * Both comps excluded the parted-out listings, which is the whole game here:
 * the unfiltered DP-12 search is full of loose DON!! promos at $10 and the
 * unfiltered Lorcana search is full of binder-and-pin-only lots at $25-38.
 * Pricing off either would have understated these by half.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const DATE = '2026-09-23';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  // the id sequence has trailed max(id) before, after manual TCGplayer-id inserts
  const [seq] = await sql`select max(id) mx, (select last_value from catalog_items_id_seq) sq
    from catalog_items`;
  if (Number(seq.sq) < Number(seq.mx)) {
    await sql`select setval('catalog_items_id_seq', (select max(id) from catalog_items), true)`;
    console.log('  resynced catalog_items_id_seq ' + seq.sq + ' -> ' + seq.mx);
  }

  const items: [string, any][] = [
    ['op12', {
      kind: 'sealed',
      name: 'One Piece Card Game Double Pack Set Vol. 12',
      set_name: "The World's Strongest Warriors",
      set_code: 'OP-17',
      product_type: 'Double Pack Set',
      tcgplayer_product_id: 704757,
      pack_count: 2,
      msrp_cents: 1299,
      release_date: '2026-08-28',
      last_market_cents: 3765,
    }],
    ['lorcana', {
      kind: 'sealed',
      name: 'Disney Lorcana: Wilds Unknown Best Buddies Bundle',
      set_name: 'Wilds Unknown',
      product_type: 'Bundle',
      tcgplayer_product_id: null,
      pack_count: 6,
      msrp_cents: null,
      release_date: '2026-05-08',
      manual_market_cents: 9000,
    }],
  ];

  const ids: Record<string, number> = {};
  for (const [key, it] of items) {
    const [found] = await sql`select id from catalog_items where name = ${it.name}`;
    if (found) { ids[key] = Number(found.id); console.log('  catalog exists: ' + it.name); continue; }
    const [row] = await sql`insert into catalog_items ${sql(it)} returning id`;
    ids[key] = Number(row.id);
    console.log('  catalog#' + row.id + '  ' + it.name);
    if (it.last_market_cents)
      await sql`update catalog_items set last_market_at = now() where id = ${row.id}`;
    if (it.manual_market_cents)
      await sql`update catalog_items set manual_market_at = now() where id = ${row.id}`;
  }

  // catalog_item_id, qty, unit cents, source, location, notes
  const buys: [number, number, number, string, string, string][] = [
    [ids.op12, 1, 1435, 'Barnes & Noble', 'Lynnwood WA',
      '$12.99 shelf plus 10.50% Lynnwood tax. Bandai MSRP, and TCGplayer market is ' +
      '$37.65 with 55 sealed eBay asks at a $40.52 delivered median. 1 Special DON!! ' +
      'pack plus 2 OP-17 boosters; the OP-17 pack alone markets at $10.16.'],
    [ids.lorcana, 2, 4419, 'Costco', 'Shoreline WA',
      '2 at $39.99 plus 10.50% Shoreline tax, $88.38 for the pair. Costco exclusive, ' +
      'not carried by TCGplayer, so the $90.00 market on the catalog row is the ' +
      'delivered median of 91 sealed eBay ASKS (low $71.50), not sold comps. ' +
      'Each holds 1 portfolio, 6 Wilds Unknown boosters, foil Sulley + Violet Parr ' +
      'promos and a Mike Wazowski pin.'],
  ];

  for (const [cid, qty, cost, source, loc, notes] of buys) {
    const [dupe] = await sql`select count(*)::int n from purchases
      where catalog_item_id = ${cid} and purchase_date = ${DATE} and deleted_at is null`;
    if (dupe.n) { console.log('  already logged, catalog#' + cid); continue; }
    const [p] = await sql`insert into purchases (user_id, catalog_item_id, purchase_date,
        quantity, cost_cents, source, location, notes)
      values (${USER}, ${cid}, ${DATE}, ${qty}, ${cost}, ${source}, ${loc}, ${notes})
      returning id`;
    const [ci] = await sql`select name from catalog_items where id = ${cid}`;
    console.log('  pu' + p.id + '  x' + qty + ' @ $' + (cost / 100).toFixed(2) +
      ' = $' + ((cost * qty) / 100).toFixed(2) + '   ' + ci.name);
  }

  await sql.end();
})();
