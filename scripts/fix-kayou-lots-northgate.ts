import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
async function main(){
  // Receipt: Target Northgate, 302 NE Northgate Way, Seattle WA 98125, 08/19/2026 16:39.
  // 2 @ $9.99 = $19.98 + WA tax 10.55% $2.11 = $22.09 -> $11.05/box (11.045 rounded up).
  const n580 = 'Target NORTHGATE, 302 NE Northgate Way, Seattle WA 98125. There is no Edmonds Target; the earlier "Edmonds" on this lot was my assumption and was wrong. First Kayou buy of 2026-08-19 (morning). Unit cost corrected to $11.05: $9.99 shelf at the Northgate WA rate of 10.55% proven by the afternoon receipt from the same store, replacing my earlier 10.7% guess. No receipt photo for THIS lot specifically, the rate is carried over from the same-store same-day receipt. Box back: model NR-KP-DZJLH-002-5P-NA, 7 cards per pack x 5 packs = 35 cards, EAN 6937187418998. Not in TCGCSV, manual market only.';
  const n584 = 'Target NORTHGATE, 302 NE Northgate Way, Seattle WA 98125, 08/19/2026 04:39 PM. RECEIPTED: DPCI 361010108 Kayou, 2 @ $9.99 = $19.98, WA tax 10.55% = $2.11, total $22.09, so $11.05/box. Final sale, no return. QUANTITY IN QUESTION: Michael said by voice he bought "four more so I am six now", but this receipt covers only 2. Lot left at the receipted 2 pending his confirmation; if a second transaction exists, add it as its own lot rather than editing this one.';

  await sql`UPDATE purchases SET cost_cents=1105, location='Seattle, WA (Northgate)', notes=${n580} WHERE id=580`;
  await sql`UPDATE purchases SET cost_cents=1105, quantity=2, location='Seattle, WA (Northgate)', notes=${n584} WHERE id=584`;

  const rows = await sql`SELECT id, purchase_date::text d, quantity, cost_cents, location FROM purchases WHERE catalog_item_id=135082 AND deleted_at IS NULL ORDER BY id`;
  (rows as any[]).forEach(r=>console.log(`lot #${r.id} ${r.d} qty ${r.quantity} @ $${(r.cost_cents/100).toFixed(2)} ${r.location}`));
  const held = (await sql<{h:number}[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS h
    FROM purchases p WHERE p.catalog_item_id=135082 AND p.deleted_at IS NULL`)[0].h;
  const inv = (await sql<{t:number}[]>`SELECT SUM(quantity*cost_cents)::int t FROM purchases WHERE catalog_item_id=135082 AND deleted_at IS NULL`)[0].t;
  console.log(`HELD ${held} | invested $${(inv/100).toFixed(2)} | listing currently offers 6`);
  await sql.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
