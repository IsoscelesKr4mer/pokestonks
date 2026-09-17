/**
 * Mickey Mantle DM-9 Diamond Moments Purple Refractor /75 (70/75), card #220,
 * sold for $25 cash at the 2026-09-05 card show.
 *
 * Standalone listing (168584893847 carried this card and nothing else), so it
 * was ended outright rather than having a variation quantity zeroed.
 *
 *   npx tsx scripts/book-mantle-sale-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const before = await sql<any[]>`SELECT id, status, asking_price_cents, sold_price_cents FROM baseball_cards WHERE id=220`;
  if (!before.length) throw new Error('card 220 missing');
  if (before[0].sold_price_cents != null) { console.log('already booked'); await sql.end(); return; }

  const r = await sql`UPDATE baseball_cards SET
      status='sold', for_sale=false, sold_price_cents=2500, sold_date='2026-09-05',
      notes = notes || ' | Sold $25 cash at the 2026-09-05 card show, well under the $64.99 ask and under the $41-60 sold-comp range. eBay listing 168584893847 ended the same day.',
      updated_at = NOW()
    WHERE id=220
    RETURNING id, player, status, for_sale, sold_price_cents, sold_date::text d`;
  console.log('booked:', r[0]);

  const stillListed = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int n FROM baseball_cards WHERE ebay_item_id='168584893847' AND status <> 'sold'`;
  console.log(`other cards still pointing at that ended listing: ${stillListed[0].n}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
