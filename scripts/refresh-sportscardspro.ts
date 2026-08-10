/**
 * Prices SPORTS sealed catalog items from SportsCardsPro sold data.
 *
 * The Pokemon/TCG pipeline can't do this: TCGCSV has no sports categories, so
 * these items carry tcgplayer_product_id = NULL and are skipped entirely by
 * the daily cron (snapshotAllCatalogItems filters on isNotNull). They price
 * here instead, writing manual_market_cents plus a market_prices row with
 * source='manual' (the CHECK constraint allows only 'tcgcsv' | 'manual').
 *
 *   npx tsx scripts/refresh-sportscardspro.ts           # show quotes only
 *   npx tsx scripts/refresh-sportscardspro.ts --apply   # write to the vault
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { fetchQuote, singleUnitSales } from '../lib/services/sportscardspro';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

// catalog_item name -> SportsCardsPro slug. Add a row here when a new sports
// sealed product enters the vault.
const SLUGS: Record<string, string> = {
  '2026 Topps Chrome Baseball Mega Box': 'baseball-cards-2026-topps-chrome/mega-box',
  '2026 Topps Finest Baseball Mega Box': 'baseball-cards-2026-topps-finest/mega-box',
};

// Deliberately NOT auto-refreshed, with reasons. Re-enable by moving into
// SLUGS once the underlying page is trustworthy for the specific product.
const DISABLED: Record<string, string> = {
  // Page is slugged as base 2025-26 Topps Chrome Basketball, but as of
  // 2026-08-06 its sold rows are dominated by *Update* mega listings, so the
  // computed Ungraded value ($131.79) reads blended across two releases.
  //
  // On the Fanatics question (Michael pushed back, so it was verified against
  // the Updates checklist): a Fanatics configuration DOES exist for this
  // Updates release, listed as its own odds column beside Hobby/Jumbo/Breaker/
  // Blaster/Mega (e.g. Refractor 1:4 Mega vs 1:4 Fanatics). It is not the base
  // Chrome release being confused for Updates. But the practical effect is
  // small: release-day median was $126.00 excluding Fanatics rows, $129.49
  // including them, ~$3.50 apart. ci135078 sits at $125.00, conservative and
  // inside that band either way. Enabling auto-refresh would overwrite it with
  // the blended $131.79.
  '2025-26 Topps Chrome Update Basketball Mega Box': 'basketball-cards-2025-topps-chrome/mega-box',
  // No Update-specific comp exists yet. The value-box page carries base-release
  // sales from March 2026 ($56-$75), a different product. ci135079 is left
  // unpriced rather than seeded with a wrong number.
  '2025-26 Topps Chrome Update Basketball Value Box': 'basketball-cards-2025-topps-chrome/value-box',
};

async function main() {
  const items = await sql<{ id: number; name: string; manual_market_cents: number | null }[]>`
    SELECT id, name, manual_market_cents FROM catalog_items
    WHERE name = ANY(${Object.keys(SLUGS)}) ORDER BY id`;

  if (items.length === 0) {
    console.error('No matching catalog items. Run add-baseball-sealed-to-vault.ts first.');
    process.exit(1);
  }

  for (const item of items) {
    const q = await fetchQuote(SLUGS[item.name]);
    const clean = singleUnitSales(q.recentSales);
    const was = item.manual_market_cents;
    console.log(`[${item.id}] ${item.name}`);
    console.log(`   market $${(q.marketCents / 100).toFixed(2)}` +
      (was != null ? `  (was $${(was / 100).toFixed(2)}, ${q.marketCents >= was ? '+' : ''}$${((q.marketCents - was) / 100).toFixed(2)})` : ''));
    console.log(`   ${q.recentSales.length} sold rows, ${clean.length} after dropping lots and weighed packs`);

    if (!APPLY) continue;

    await sql`
      UPDATE catalog_items
      SET manual_market_cents = ${q.marketCents}, manual_market_at = NOW()
      WHERE id = ${item.id}`;
    await sql`
      INSERT INTO market_prices (catalog_item_id, snapshot_date, condition, market_price_cents, low_price_cents, high_price_cents, source)
      VALUES (${item.id}, CURRENT_DATE, NULL, ${q.marketCents}, NULL, NULL, 'manual')
      ON CONFLICT (catalog_item_id, snapshot_date, condition, source)
      DO UPDATE SET market_price_cents = excluded.market_price_cents`;
    console.log('   written');
  }

  const skipped = Object.keys(DISABLED);
  if (skipped.length) console.log(`\nnot auto-refreshed (see DISABLED, prices are hand-set): ${skipped.length}`);
  for (const n of skipped) console.log(`   ${n}`);

  if (!APPLY) console.log('\ndry run - pass --apply to write');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
