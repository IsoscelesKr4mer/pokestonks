/**
 * Book the Sylveon ex Box sale, and record the Meowth giveaway.
 *
 *   npx tsx scripts/book-sylveon-sale-0923.ts
 *
 * eBay order 06-15211-93648, buyer electrochards, the one who asked about
 * combined shipping. He took ONE box, not both, so the $114-for-the-pair offer
 * and the combined-shipping work both went unused.
 *
 *   subtotal   $61.99
 *   shipping   $ 5.90  (buyer paid)
 *   total      $67.89
 *   eBay fee   $ 9.40
 *   to seller  $58.49
 *
 * THE MEOWTH EX WAS GIVEN AWAY, NOT SOLD. Michael threw it in with the box as a
 * thank-you. Per the standing rule, a giveaway is never booked as a $0 sale,
 * because that would show a phantom realized loss. There is also nothing to
 * decrement: the card came out of a ripped pack (pu628, rip 32) whose basis was
 * already written off with the rip, and Pokemon singles are not vault-tracked.
 * The ONLY thing that needed doing was ending its listing, 168705487104, so
 * nobody could buy a card he no longer has. Done.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';

(async () => {
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
    { ssl: 'require', connect_timeout: 20, max: 1 });

  const [p] = await sql`select p.id, p.quantity, p.cost_cents, ci.name,
      (select coalesce(sum(s.quantity),0)::int from sales s where s.purchase_id=p.id) sold
    from purchases p join catalog_items ci on ci.id = p.catalog_item_id
    where p.id = 627 and p.deleted_at is null`;
  if (!p || !p.name.includes('Sylveon ex Box')) throw new Error('pu627 is ' + (p && p.name));
  if (p.cost_cents !== 3314) throw new Error('cost moved: ' + p.cost_cents);
  console.log('pu627  ' + p.name + '  x' + p.quantity + ' @ $33.14, already sold ' + p.sold);

  if (p.sold >= 1) console.log('  sale already booked');
  else {
    const [s] = await sql`insert into sales (user_id, purchase_id, sale_date, quantity,
        sale_price_cents, fees_cents, matched_cost_cents, platform, notes)
      values (${USER}, 627, '2026-09-23', 1, 6199, 940, 3314, 'eBay',
        ${'eBay order 06-15211-93648, item 168705237986, buyer electrochards. He had ' +
          'asked about combined shipping for both boxes and then took one. Subtotal ' +
          '$61.99 plus $5.90 buyer-paid shipping, eBay fee $9.40, $58.49 due to ' +
          'seller. A Meowth ex was included free as a thank-you and is NOT part of ' +
          'this sale; its listing 168705487104 was ended rather than booked.'})
      returning id`;
    console.log('  booked sale#' + s.id + '  $61.99 rev, $9.40 fees, $33.14 cost -> profit $19.45');
  }

  // dedup rows so the sync cannot re-import either order when Supabase returns
  for (const [order, note] of [
    ['06-15211-93648', 'booked by hand'],
    ['27-15155-78619', 'Arceus VSTAR single, no catalog row, cannot be booked'],
  ] as [string, string][]) {
    const [seen] = await sql`select count(*)::int n from ebay_synced_orders where ebay_order_id = ${order}`;
    if (seen.n) { console.log('  dedup exists: ' + order); continue; }
    await sql`insert into ebay_synced_orders (user_id, ebay_order_id, skipped, synced_at)
      values (${USER}, ${order}, ${order === '27-15155-78619'}, now())`;
    console.log('  dedup row ' + order + '  (' + note + ')');
  }

  const [left] = await sql`select p.quantity - coalesce((select sum(s.quantity)::int from sales s
      where s.purchase_id=p.id),0) as remaining from purchases p where p.id = 627`;
  console.log('\n  Sylveon still on hand: ' + left.remaining);
  await sql.end();
})();
