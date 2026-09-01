/**
 * Set prices on the four cards held back for thin comps. Michael: "list those
 * 4 it's fine."
 *
 * Each price is the median of its handful of live asks. The comp_note keeps the
 * ask count on the row so nobody later reads $99.00 as a market price: it is
 * one seller's ask, and it is the reason this card gets its own listing with a
 * Best Offer rather than a slot in a dropdown.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const PRICES: [number, string, number][] = [
  [523, 'George Valera Logofractor Gold /50', 9900],
  [522, 'C.J. Kayfus Blue Logofractor /150', 1999],
  [533, 'Ryan Ritter Pink Logofractor /250', 1069],
  [545, 'Zach Neto Pink Logofractor /250', 599],
];
(async () => {
  for (const [id, label, cents] of PRICES) {
    const r: any = await sql`UPDATE baseball_cards SET asking_price_cents=${cents},
      notes = replace(notes, 'NO PRICE SET: comp rests on', 'Priced at his go-ahead 2026-09-01 despite a comp resting on')
      WHERE id=${id} AND asking_price_cents IS NULL RETURNING id, asking_price_cents a`;
    console.log(r.length ? `  id${id} ${label} -> $${(r[0].a/100).toFixed(2)}` : `  id${id} already priced, skipped`);
  }
  await sql.end();
})();
