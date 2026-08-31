/**
 * Write today's TCGCSV price for the three First Partner Illustration
 * Collections. Their group was not being picked up by the nightly sync: the
 * newest snapshot for Series 2 was 2026-05-01, 111 days stale, and it read
 * $99.15 when the live market is $29.92. Quoting the vault would have
 * overstated a 5-box position by more than 3x.
 *
 *   npx tsx scripts/refresh-fpic-prices-0820.ts --apply
 *
 * Group 24584 "First Partner Collection 2026" in TCGCSV category 3 carries all
 * three and returns prices fine, so this is a sync coverage gap, not a missing
 * upstream feed.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const WANT: Record<number, number> = { 673436: 193, 688712: 196, 695400: 135080 };

async function main() {
  // tcgcsv answers a bare fetch with an HTML greeting, not JSON. It needs a
  // browser User-Agent, same as the curl calls elsewhere in this repo.
  const res: any = await (await fetch('https://tcgcsv.com/tcgplayer/3/24584/prices', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  })).json();
  let n = 0;
  for (const p of res.results) {
    const ci = WANT[p.productId];
    if (!ci || p.subTypeName !== 'Normal') continue;
    const mkt = Math.round((p.marketPrice ?? 0) * 100);
    const lo = Math.round((p.lowPrice ?? 0) * 100);
    const hi = Math.round((p.highPrice ?? p.midPrice ?? 0) * 100);
    if (!mkt) continue;
    const [old]: any = await sql`SELECT snapshot_date::text d, market_price_cents m FROM market_prices WHERE catalog_item_id=${ci} ORDER BY snapshot_date DESC LIMIT 1`;
    console.log(`  ci${ci} tcg#${p.productId}: was ${old ? `$${(old.m/100).toFixed(2)} (${old.d})` : 'never priced'} -> $${(mkt/100).toFixed(2)} low $${(lo/100).toFixed(2)}`);
    if (APPLY) {
      // the unique index is (catalog_item_id, snapshot_date, condition, source),
      // so `condition` has to be in the conflict target or the upsert 42P10s.
      await sql`INSERT INTO market_prices (catalog_item_id, snapshot_date, market_price_cents, low_price_cents, high_price_cents, source, condition)
                VALUES (${ci}, '2026-08-20', ${mkt}, ${lo}, ${hi}, 'tcgcsv', 'Normal')
                ON CONFLICT (catalog_item_id, snapshot_date, condition, source) DO UPDATE
                SET market_price_cents=EXCLUDED.market_price_cents, low_price_cents=EXCLUDED.low_price_cents, high_price_cents=EXCLUDED.high_price_cents`;
      n++;
    }
  }
  console.log(APPLY ? `\n${n} snapshots written for 2026-08-20` : '\ndry run');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
