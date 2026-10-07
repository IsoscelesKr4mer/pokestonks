/**
 * Log the six 2026 Bowman Chrome mega boxes Michael ripped on 10-04 and 10-05.
 *
 *   npx tsx scripts/book-bowman-mega-rips-1005.ts [--apply]
 *
 * Found while checking the blaster inventory. The vault says he holds 14 sealed
 * Bowman Chrome megas; he opened six of them over the last two nights and all 216
 * cards are already in baseball_cards. Held should be 8.
 *
 * Only 3 rips exist for this product and they are from 2026-09-15 off lot 611.
 * The six from this rip were never logged, so $331.62 of cost basis is still
 * sitting in sealed inventory for boxes that are now cardboard.
 *
 * Source lot is 630: 14 at $55.27 from Target on 2026-09-23. Lot 611 is the
 * earlier Fred Meyer ten, already drawn down to its last unit by the 09-15 rips
 * and the TradePost sale, so FIFO does not apply here. These six came out of the
 * Target box.
 *
 * realized_loss_cents stays 0, matching every prior rip in the table: ripping is
 * a conversion out of sealed inventory, not a loss event. The cards themselves
 * are tracked separately in baseball_cards.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const LOT = 630;
const RIPS: [number, string][] = [
  [1, '2026-10-04'],
  [2, '2026-10-05'],
  [3, '2026-10-05'],
  [4, '2026-10-05'],
  [5, '2026-10-05'],
  [6, '2026-10-05'],
];

(async () => {
  const p = await sql`SELECT pu.id, pu.quantity, pu.cost_cents, pu.purchase_date::text d, pu.source,
      ci.name, pu.deleted_at
    FROM purchases pu JOIN catalog_items ci ON ci.id = pu.catalog_item_id WHERE pu.id = ${LOT}`;
  if (!p.length) { console.log('ABORT, lot not found'); await sql.end(); return; }
  const lot = p[0] as any;
  if (lot.deleted_at) { console.log('ABORT, lot is soft-deleted'); await sql.end(); return; }
  console.log(`lot ${lot.id}: ${lot.name}`);
  console.log(`  ${lot.quantity} @ $${(lot.cost_cents / 100).toFixed(2)} from ${lot.source} on ${lot.d}`);

  const already = await sql`SELECT count(*)::int n FROM rips WHERE source_purchase_id = ${LOT}`;
  const sold = await sql`SELECT coalesce(sum(quantity),0)::int n FROM sales WHERE purchase_id = ${LOT}`;
  const held = lot.quantity - already[0].n - sold[0].n;
  console.log(`  rips already logged on this lot: ${already[0].n}`);
  console.log(`  sold off this lot: ${sold[0].n}`);
  console.log(`  HELD NOW: ${held}`);

  // the cards are already in the vault; that is the proof the boxes were opened
  const cards = await sql`SELECT count(*)::int n FROM baseball_cards
    WHERE notes LIKE '%of 6, 2026 Bowman Chrome mega%'`;
  console.log(`  cards catalogued from this rip: ${cards[0].n} (expect ${RIPS.length * 36})`);
  if (cards[0].n !== RIPS.length * 36) {
    console.log('  ABORT: card count does not match 6 boxes of 36, not logging rips off a guess.');
    await sql.end(); return;
  }

  if (already[0].n >= RIPS.length) { console.log('\nAlready logged.'); await sql.end(); return; }
  if (held < RIPS.length) { console.log(`\nABORT: need ${RIPS.length} on hand, only ${held}.`); await sql.end(); return; }

  console.log(`\n  will log ${RIPS.length} rips at $${(lot.cost_cents / 100).toFixed(2)} each`);
  console.log(`  cost basis leaving sealed inventory: $${((lot.cost_cents * RIPS.length) / 100).toFixed(2)}`);
  console.log(`  held after: ${held - RIPS.length}`);

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  let n = 0;
  for (const [box, date] of RIPS) {
    const r = await sql`INSERT INTO rips
      (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
      VALUES (${UID}, ${LOT}, ${date}::date, ${lot.cost_cents}, 0,
        ${'Box ' + box + ' of 6, 2026 Bowman Chrome mega, ripped ' + date + '. All 36 cards catalogued '
          + 'into baseball_cards the same night (see catalog-bowman-mega-box' + box + '-'
          + date.slice(5).replace('-', '') + '.ts). Logged 2026-10-05 after Michael spotted the blasters '
          + 'still showing as held: these six were opened but never drawn out of sealed inventory. '
          + 'No loss booked, same as every prior rip.'})
      RETURNING id`;
    n += r.length;
  }
  console.log(`\nlogged ${n} rips`);

  const after = await sql`SELECT count(*)::int n FROM rips WHERE source_purchase_id = ${LOT}`;
  console.log(`held after: ${lot.quantity - after[0].n - sold[0].n}`);
  await sql.end();
})();
