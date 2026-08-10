/**
 * Gives the sports sealed catalog items a cover image and a value, so they
 * stop rendering as a broken placeholder with "UNPRICED / $0.00" in the vault.
 *
 * Value = the current eBay ask, per Michael. For these items that is the more
 * useful number than a sold-market figure: it is what he expects to realise,
 * and two of the four have no reliable sold market at all.
 *
 *   npx tsx scripts/set-sports-vault-display.ts           # dry run
 *   npx tsx scripts/set-sports-vault-display.ts --apply
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const BASE = 'https://domjsqtvxnuxyuwngpog.supabase.co/storage/v1/object/public/ebay-listings/';

const ROWS: { id: number; label: string; image: string; askCents: number; note: string }[] = [
  {
    id: 135077, label: '2026 Topps Chrome Baseball Mega Box',
    image: 'ToppsChrome2026_MegaBox_reshoot_01_front.JPEG',
    askCents: 10999,
    note: 'live ask $109.99; sold market was $118.91, so this is conservative',
  },
  {
    id: 135076, label: '2026 Topps Finest Baseball Mega Box',
    image: 'ToppsFinest2026_MegaBox_02_front.jpg',
    askCents: 9999,
    note: 'live ask $99.99; sold market $90.50, so this is above sold',
  },
  {
    id: 135078, label: '2025-26 Topps Chrome Update Basketball Mega Box',
    image: 'ToppsChromeUpdateNBA_MegaBox_01_front.JPEG',
    askCents: 12999,
    note: 'twofer lists at $259.99, so $129.99 per box',
  },
  {
    id: 135079, label: '2025-26 Topps Chrome Update Basketball Value Box',
    image: 'ToppsChromeUpdateNBA_ValueBox_01_front.JPEG',
    askCents: 6499,
    note: 'twofer lists at $129.99, so $64.99 per box; no sold comp exists yet',
  },
];

async function main() {
  for (const r of ROWS) {
    const [before] = await sql<{ image_url: string | null; manual_market_cents: number | null }[]>`
      SELECT image_url, manual_market_cents FROM catalog_items WHERE id = ${r.id}`;
    console.log(`[${r.id}] ${r.label}`);
    console.log(`   image  ${before.image_url ? 'set' : 'MISSING'} -> ${r.image}`);
    console.log(`   value  ${before.manual_market_cents != null ? '$' + (before.manual_market_cents / 100).toFixed(2) : 'UNPRICED'} -> $${(r.askCents / 100).toFixed(2)}  (${r.note})`);
    if (!APPLY) continue;
    await sql`
      UPDATE catalog_items
      SET image_url = ${BASE + r.image},
          manual_market_cents = ${r.askCents},
          manual_market_at = NOW()
      WHERE id = ${r.id}`;
  }

  if (APPLY) {
    console.log('\n--- vault after ---');
    const rows = await sql`
      SELECT c.id, c.name, c.manual_market_cents AS mk, (c.image_url IS NOT NULL) AS has_img,
        COALESCE(SUM(p.quantity
          - COALESCE((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=p.id),0)
          - COALESCE((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=p.id),0)
          - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)),0)::int AS held,
        COALESCE(SUM((p.quantity - COALESCE((SELECT SUM(quantity) FROM sales s WHERE s.purchase_id=p.id),0)) * p.cost_cents),0)::int AS basis
      FROM catalog_items c LEFT JOIN purchases p ON p.catalog_item_id=c.id AND p.deleted_at IS NULL
      WHERE c.id = ANY(${ROWS.map((r) => r.id)})
      GROUP BY c.id, c.name, c.manual_market_cents, c.image_url ORDER BY c.id`;
    let v = 0, b = 0;
    for (const row of rows) {
      const val = row.held * row.mk;
      v += val; b += row.basis;
      console.log(`  ${row.name}`);
      console.log(`     img:${row.has_img ? 'yes' : 'NO'} qty ${row.held} x $${(row.mk / 100).toFixed(2)} = $${(val / 100).toFixed(2)} | cost $${(row.basis / 100).toFixed(2)} | ${val - row.basis >= 0 ? '+' : ''}$${((val - row.basis) / 100).toFixed(2)}`);
    }
    console.log(`\n  sports sealed total: value $${(v / 100).toFixed(2)} | cost $${(b / 100).toFixed(2)} | unrealized ${v - b >= 0 ? '+' : ''}$${((v - b) / 100).toFixed(2)}`);
  } else {
    console.log('\ndry run - pass --apply');
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
