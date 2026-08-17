/**
 * Pull TCGCSV market prices for a whole TCGplayer category into market_prices.
 *
 *   npx tsx scripts/sync-market-prices-category.ts 71            # dry run, Lorcana
 *   npx tsx scripts/sync-market-prices-category.ts 71 --apply
 *   npx tsx scripts/sync-market-prices-category.ts 71 --all      # not just what he holds
 *
 * WHY THIS EXISTS. The nightly price sync only covers Pokemon (category 3), so
 * every Lorcana product in the vault had `market no snapshot`. That turned into
 * a real gap: asked whether he had margin on an Illumineer's Trove, the vault
 * could not answer and the only market number in the conversation was one
 * Michael supplied himself. Michael: "theyre on TCG and you can look at comps on
 * ebay" - he was right, TCGCSV is already the project's primary sealed-price
 * source and it carries Lorcana as category 71. Nothing needed inventing, only
 * pointing at the right category.
 *
 * Categories: 3 Pokemon, 71 Lorcana TCG, 85 Pokemon Japan.
 * catalog_items.tcgplayer_product_id is the join, and it was already populated.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const CATEGORY = process.argv[2];
const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * TCGCSV intermittently answers with a plain-text greeting ("Ahoy! CptS...")
 * instead of JSON, and a bare .json() then throws and kills the whole sync.
 * Send a UA, retry, and only accept a parsed object.
 */
async function get(u: string, tries = 4): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'pokestonks/1.0 (price sync)', Accept: 'application/json' } });
      const t = await r.text();
      if (r.ok && t.trimStart().startsWith('{')) return JSON.parse(t);
    } catch { /* retry */ }
    await sleep(400 * (i + 1));
  }
  return null;
}

async function main() {
  if (!/^\d+$/.test(CATEGORY ?? '')) {
    console.error('usage: sync-market-prices-category.ts <categoryId> [--apply] [--all]');
    process.exit(1);
  }

  // Only items we actually track, unless --all. Held-only keeps it honest: a
  // price for something he does not own is noise.
  const items: any = ALL
    ? await sql`SELECT id, name, tcgplayer_product_id FROM catalog_items WHERE tcgplayer_product_id IS NOT NULL`
    : await sql`
        SELECT DISTINCT ci.id, ci.name, ci.tcgplayer_product_id
        FROM catalog_items ci
        JOIN purchases p ON p.catalog_item_id = ci.id AND p.deleted_at IS NULL
        WHERE ci.tcgplayer_product_id IS NOT NULL`;
  const byProduct = new Map<string, any>();
  for (const i of items) byProduct.set(String(i.tcgplayer_product_id), i);
  console.log(`${byProduct.size} tracked catalog items with a TCGplayer id`);

  const groupsRes = await get(`https://tcgcsv.com/tcgplayer/${CATEGORY}/groups`);
  if (!groupsRes) { console.error('TCGCSV would not return the group list'); process.exit(1); }
  const groups = groupsRes.results ?? [];
  console.log(`category ${CATEGORY}: ${groups.length} groups`);

  const today = new Date().toISOString().slice(0, 10);
  const found: { id: number; name: string; market: number; low: number | null; high: number | null }[] = [];
  let skipped = 0;

  for (const g of groups) {
    const res = await get(`https://tcgcsv.com/tcgplayer/${CATEGORY}/${g.groupId}/prices`);
    if (!res) { skipped++; continue; }
    const prices: any[] = res.results ?? [];
    await sleep(120);
    for (const pr of prices) {
      const item = byProduct.get(String(pr.productId));
      if (!item) continue;
      // A product can price under several sub-types; take the one with a market
      // price and prefer the highest, which is the sealed/English line.
      const market = Number(pr.marketPrice ?? 0);
      if (!(market > 0)) continue;
      const prev = found.find((f) => Number(f.id) === Number(item.id));
      if (prev && prev.market >= market * 100) continue;
      const row = {
        id: Number(item.id), name: item.name, market: Math.round(market * 100),
        low: pr.lowPrice ? Math.round(Number(pr.lowPrice) * 100) : null,
        high: pr.highPrice ? Math.round(Number(pr.highPrice) * 100) : null,
      };
      if (prev) Object.assign(prev, row); else found.push(row);
    }
  }

  console.log(`\n${found.length} tracked items priced in this category:`);
  for (const f of found.sort((a, b) => b.market - a.market)) {
    console.log(`  ci${String(f.id).padEnd(7)} $${(f.market / 100).toFixed(2).padStart(8)}  low ${f.low ? '$' + (f.low / 100).toFixed(2) : '--'}   ${f.name.slice(0, 52)}`);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  for (const f of found) {
    await sql`
      INSERT INTO market_prices (catalog_item_id, snapshot_date, condition, market_price_cents, low_price_cents, high_price_cents, source)
      VALUES (${f.id}, ${today}, 'Near Mint', ${f.market}, ${f.low}, ${f.high}, 'tcgcsv')
      ON CONFLICT DO NOTHING`;
    await sql`UPDATE catalog_items SET last_market_cents = ${f.market}, last_market_at = now() WHERE id = ${f.id}`;
  }
  console.log(`\n${found.length} snapshots written for ${today}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
