/**
 * Edmonds Safeway 10:58 drop, 2026-08-16.
 *
 *   npx tsx scripts/log-drop-0816-1058.ts           # dry run
 *   npx tsx scripts/log-drop-0816-1058.ts --apply
 *
 * Voice: "Just got a Prismatic at the 1058 Prismatic Booster Bundle, Edmunds
 * Safeway, left a Pitch Black Bundle and a Chaos Rising Booster Pack."
 *
 * Bought 1x Prismatic Evolutions Booster Bundle. Left a Pitch Black bundle and
 * a Chaos Rising pack, which go in the CSV as `seen` rows with qty 0 and no
 * cost, per the existing convention.
 *
 * 10:58 is ON the mark: Edmonds Safeway runs :28:30 / :58:30.
 *
 * $30.00 is the standard vending bundle price, not an assumption: every prior
 * vending bundle has come in at exactly $30.00, including both previous
 * Prismatic bundles (lots #552 and #571). Flagged in the reply so it can be
 * corrected if this one differed.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, appendFileSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG_ITEM = 19776;          // Prismatic Evolutions Booster Bundle
const DATE = '2026-08-16';
const DAY = 'Sunday';
const TIME = '10:58';
const LOCATION = 'Edmonds Safeway';
const COST = 3000;
const SOURCE = 'Vending Machine';
const NOTE = 'Edmonds Safeway 10:58, ON the :58. Standard $30 vending bundle price. A Pitch Black bundle and a Chaos Rising booster pack were out on the same drop and deliberately left.';

const CSV_ROWS = [
  `${DATE},${DAY},${TIME},${LOCATION},hit,Prismatic Evolutions Booster Bundle,1,30.00,"ON the :58. Pitch Black bundle and Chaos Rising pack out on the same drop, both left"`,
  `${DATE},${DAY},${TIME},${LOCATION},seen,Pitch Black Booster Bundle,0,,"Out on the same :58 drop, left. Second bundle in one drop alongside the Prismatic"`,
  `${DATE},${DAY},${TIME},${LOCATION},seen,Chaos Rising Booster Pack,0,,"Out on the same :58 drop, left"`,
];

async function main() {
  const [ci]: any = await sql`SELECT id, name FROM catalog_items WHERE id=${CATALOG_ITEM}`;
  if (!ci) { console.error('catalog item missing'); process.exit(1); }
  const [u]: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;

  const before = await held();
  console.log(`${ci.name} (ci${ci.id})`);
  console.log(`  buy 1 @ $${(COST / 100).toFixed(2)}  ${SOURCE}  ${LOCATION} ${TIME} on ${DATE}`);
  console.log(`  held ${before} -> ${before + 1}`);
  console.log('  csv rows:');
  for (const r of CSV_ROWS) console.log(`    ${r.slice(0, 110)}`);

  // guard against logging the same drop twice
  const dupe: any = await sql`
    SELECT id FROM purchases WHERE catalog_item_id=${CATALOG_ITEM} AND purchase_date=${DATE}
      AND deleted_at IS NULL AND COALESCE(notes,'') LIKE ${'%' + TIME + '%'}`;
  if (dupe.length) { console.error(`  already logged as lot #${dupe[0].id}, refusing to double-log`); process.exit(1); }
  const csv = readFileSync('data/drop_log.csv', 'utf8');
  if (csv.includes(`${DATE},${DAY},${TIME},${LOCATION},hit,Prismatic`)) {
    console.error('  csv already has this hit row, refusing'); process.exit(1);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const [row]: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${u.user_id}, ${CATALOG_ITEM}, ${DATE}, 1, ${COST}, ${SOURCE}, ${LOCATION}, ${NOTE})
    RETURNING id`;
  console.log(`\n  logged lot #${row.id}`);
  appendFileSync('data/drop_log.csv', CSV_ROWS.join('\n') + '\n');
  console.log(`  appended ${CSV_ROWS.length} rows to drop_log.csv`);
  console.log(`  held now ${await held()}`);
  await sql.end();
}
async function held() {
  const [h]: any = await sql`
    WITH lots AS (SELECT p.id, p.quantity FROM purchases p WHERE p.catalog_item_id=${CATALOG_ITEM} AND p.deleted_at IS NULL)
    SELECT COALESCE(SUM(l.quantity),0)
      - COALESCE(SUM((SELECT COALESCE(SUM(s.quantity),0) FROM sales s WHERE s.purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM rips r WHERE r.source_purchase_id=l.id)),0)
      - COALESCE(SUM((SELECT COUNT(*) FROM box_decompositions d WHERE d.source_purchase_id=l.id)),0) AS held
    FROM lots l`;
  return Number(h.held);
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
