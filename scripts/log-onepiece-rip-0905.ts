/**
 * Michael ripped one One Piece Illustration Box Vol. 7 on 2026-09-05.
 *
 * One rips row per unit opened, matching the 2026-08-27 Earth Scroll rips:
 * pack_cost_cents is the per-unit basis, realized_loss_cents is 0 because the
 * resulting singles have no valuation table, so the basis is simply unassigned
 * rather than written off.
 *
 *   npx tsx scripts/log-onepiece-rip-0905.ts
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const USER = '66200525-2237-4cc3-948f-aaafd3253d4b';
const LOT = 526;          // 2026-08-03 Fred Meyer, qty 4 @ $26.56
const CID = 135075;

async function main() {
  const dupe = await sql`SELECT id FROM rips WHERE source_purchase_id=${LOT} AND rip_date='2026-09-05'`;
  if (dupe.length) { console.log('rip already logged:', dupe.map((d: any) => d.id)); await sql.end(); return; }

  const lot = await sql<any[]>`SELECT quantity, cost_cents FROM purchases WHERE id=${LOT} AND deleted_at IS NULL`;
  if (!lot.length) throw new Error(`lot ${LOT} missing`);

  const r = await sql`INSERT INTO rips (user_id, source_purchase_id, rip_date, pack_cost_cents, realized_loss_cents, notes)
    VALUES (${USER}, ${LOT}, '2026-09-05', ${lot[0].cost_cents}, 0,
      ${'Ripped 2026-09-05, reported via Discord. Box cost $26.56; One Piece singles have no valuation table in the vault, so this rip carries no realized loss and the basis is unassigned.'})
    RETURNING id, rip_date::text d, pack_cost_cents`;
  console.log('logged rip:', r[0]);

  const h = await sql<{ n: number }[]>`
    SELECT COALESCE(SUM(p.quantity
      - COALESCE((SELECT COUNT(*) FROM rips x WHERE x.source_purchase_id=p.id),0)
      - COALESCE((SELECT COUNT(*) FROM box_decompositions x WHERE x.source_purchase_id=p.id),0)
      - COALESCE((SELECT SUM(s.quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS n
    FROM purchases p WHERE p.catalog_item_id=${CID} AND p.deleted_at IS NULL`;
  console.log(`held now: ${h[0].n}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
