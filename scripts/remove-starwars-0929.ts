/**
 * Take the two Star Wars blasters off the books entirely.
 *
 *   npx tsx scripts/remove-starwars-0929.ts --apply
 *
 * "just remove the star wars from the book"
 *
 * The eBay listing was already ended; this is the accounting half. They go to
 * his friend at exactly what they cost, $32.49 each, so the position is a
 * pass-through: $64.98 out, $64.98 back, zero P&L either way.
 *
 * Soft-deleting the lot is the treatment that produces that zero WITHOUT
 * leaving noise. The alternative - carry it as inventory, then book a $64.98
 * sale at zero profit - arrives at the same number through two entries that
 * both have to be remembered, and until the second one lands the vault shows
 * $64.98 of stock he does not really have available. He asked for it gone.
 *
 * This is the [[feedback_which_cards_enter_vault]] "like it never happened"
 * mechanic, and it is right here for the same reason it is right on a giveaway:
 * **no cost and no loss should ever be booked against these two boxes.** The
 * one thing that would be wrong is a $0 sale, which would show a phantom
 * $64.98 realised loss.
 *
 * Reversible: deleted_at is a soft delete, so if the friend backs out the lot
 * comes straight back with `update purchases set deleted_at = null where id = 635`.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const LOT = 635;

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, p.deleted_at, ci.name,
      coalesce((select sum(s.quantity)::int from sales s where s.purchase_id = p.id), 0) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = ${LOT}`;
  if (!p) throw new Error('pu' + LOT + ' missing');
  if (!p.name.includes('Star Wars')) throw new Error('pu' + LOT + ' is ' + p.name);
  if (p.sold) throw new Error('pu' + LOT + ' already has ' + p.sold + ' sold against it, do not delete');
  if (p.deleted_at) { console.log('already removed'); await sql.end(); return; }

  console.log('pu' + LOT + '  ' + p.name + '  x' + p.quantity + ' @ $' + (p.cost_cents / 100).toFixed(2)
    + '  = $' + ((p.quantity * p.cost_cents) / 100).toFixed(2));
  if (!APPLY) { console.log('  dry run'); await sql.end(); return; }

  await sql`update purchases set deleted_at = now(),
    notes = ${'REMOVED FROM THE BOOKS 2026-09-29 at his request: both boxes go to a friend at '
      + 'exactly cost, $32.49 each, so it is a pass-through with no P&L either way. Listing '
      + '168737029292 was ended the same night. NOTHING is booked against these - no sale, and '
      + 'above all not a $0 sale, which would show a phantom $64.98 loss. Soft delete, so '
      + 'set deleted_at = null to restore if the friend backs out.'}
    where id = ${LOT}`;
  console.log('  removed, $' + ((p.quantity * p.cost_cents) / 100).toFixed(2) + ' of cost basis out');

  const [inv] = await sql`select coalesce(sum(p.quantity * p.cost_cents), 0)::bigint c
    from purchases p where p.deleted_at is null`;
  console.log('  lifetime invested now $' + (Number(inv.c) / 100).toFixed(2));
  const [bn] = await sql`select coalesce(sum(p.quantity * p.cost_cents), 0)::bigint c,
      coalesce(sum(p.quantity), 0)::int n
    from purchases p where p.purchase_date = '2026-09-28' and p.deleted_at is null`;
  console.log('  the B&N buy is now ' + bn.n + ' boxes, $' + (Number(bn.c) / 100).toFixed(2)
    + ' (was 6, $270.78)');
  await sql.end();
})();
