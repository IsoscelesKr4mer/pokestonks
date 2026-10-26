/**
 * 5x 30th Celebration Mini Tin from PokemonCenter.com, ordered 2026-10-15.
 *
 *   npx tsx scripts/add-pokemoncenter-tins-1015.ts           # dry run
 *   npx tsx scripts/add-pokemoncenter-tins-1015.ts --apply
 *
 * TWO orders an hour apart, and they have DIFFERENT cost bases, which is the
 * whole reason this is not one lot:
 *
 *   P0042197689, 10:20am, Michael: 4 tins, $39.96 + $4.28 tax + $0 shipping
 *     = $44.24, so $11.06 a tin. Free shipping because the subtotal cleared
 *     the threshold.
 *   second order, 11:25am, Charlotte: 1 Zapdos, $9.99 + $1.71 tax + $5.98
 *     shipping = $17.68. One tin on its own does not clear the threshold, so
 *     it paid a full shipping charge and then tax ON that shipping.
 *
 * $17.68 against $11.06 for the same object. Booking them as one averaged lot
 * would hide that, and the FIFO lot that actually sells has to be the real
 * one, per the cost-basis rule.
 *
 * Tax checks out at Edmonds 10.7% both times: 39.96 x 0.107 = 4.28, and
 * (9.99 + 5.98) x 0.107 = 1.71. Washington taxes shipping, which is why the
 * second order's tax is larger than 10.7% of the item alone.
 *
 * Catalogue note: PokemonCenter labels every tin Day or Night, but TCGplayer
 * only splits the Pikachu, so "Umbreon (Night)" and "Zapdos (Night)" map to
 * the plain [Umbreon] and [Zapdos] rows. Matched by Pokemon, not by the
 * Day/Night suffix.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';

type Lot = {
  catalogItemId: number;
  label: string;
  costCents: number;
  notes: string;
};

const DATE = '2026-10-15';
const SOURCE = 'Pokemon Center';
const LOCATION = 'Online';

const LOTS: Lot[] = [
  {
    catalogItemId: 133890,
    label: '30th Celebration Mini Tin [Umbreon]',
    costCents: 1106,
    notes:
      'Order P0042197689, 2026-10-15. 4 tins, $39.96 + $4.28 tax (Edmonds 10.7%) + $0.00 shipping = $44.24, spread evenly at $11.06 a tin. PokemonCenter SKU 10-10465-173, listed there as Umbreon (Night).',
  },
  {
    catalogItemId: 133891,
    label: '30th Celebration Mini Tin [Night Pikachu]',
    costCents: 1106,
    notes:
      'Order P0042197689, 2026-10-15. 4 tins at $11.06 each, free shipping. PokemonCenter SKU 10-10465-172, Pikachu (Night).',
  },
  {
    catalogItemId: 133889,
    label: '30th Celebration Mini Tin [Zapdos]',
    costCents: 1106,
    notes:
      'Order P0042197689, 2026-10-15. 4 tins at $11.06 each, free shipping. PokemonCenter SKU 10-10465-175, Zapdos (Night). He bought a SECOND Zapdos an hour later at $17.68; that is a separate lot.',
  },
  {
    catalogItemId: 133885,
    label: '30th Celebration Mini Tin [Day Pikachu]',
    costCents: 1106,
    notes:
      'Order P0042197689, 2026-10-15. 4 tins at $11.06 each, free shipping. PokemonCenter SKU 10-10465-167, Pikachu (Day).',
  },
  {
    catalogItemId: 133889,
    label: '30th Celebration Mini Tin [Zapdos]  (second, dearer lot)',
    costCents: 1768,
    notes:
      'Second order 2026-10-15 11:25am, under Charlotte Dixon. ONE tin: $9.99 + $5.98 shipping + $1.71 tax = $17.68. A single tin does not clear the free shipping threshold, so this cost $6.62 more than the identical tin in the 10:20am order. Kept as its own lot so the dearer basis is not averaged away.',
  },
];

async function main() {
  let total = 0;
  for (const l of LOTS) {
    const [ci] = await sql<{ id: number; name: string; manual_market_cents: number | null }[]>`
      SELECT id, name, manual_market_cents FROM catalog_items WHERE id = ${l.catalogItemId}`;
    if (!ci) {
      console.error(`ci${l.catalogItemId} not found, refusing`);
      process.exit(1);
    }
    const [snap] = await sql<{ market_price_cents: number | null }[]>`
      SELECT market_price_cents FROM market_prices
      WHERE catalog_item_id = ${l.catalogItemId}
      ORDER BY snapshot_date DESC LIMIT 1`;
    const mkt = ci.manual_market_cents ?? snap?.market_price_cents ?? null;
    total += l.costCents;
    console.log(
      `ci${ci.id}  ${ci.name.slice(0, 44).padEnd(44)} cost $${(l.costCents / 100).toFixed(2)}` +
        (mkt ? `   market $${(mkt / 100).toFixed(2)}   +$${((mkt - l.costCents) / 100).toFixed(2)}` : '   unpriced')
    );
    if (!APPLY) continue;
    const [p] = await sql<{ id: number }[]>`
      INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
      VALUES (${UID}, ${l.catalogItemId}, ${DATE}, 1, ${l.costCents}, ${SOURCE}, ${LOCATION}, ${l.notes})
      RETURNING id`;
    console.log(`     lot #${p.id}`);
  }
  console.log(`\n5 tins, $${(total / 100).toFixed(2)} all in`);
  if (!APPLY) console.log('\ndry run - pass --apply to write');
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
