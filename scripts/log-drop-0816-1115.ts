/**
 * Shoreline Fred Meyer 11:15 drop, 2026-08-16.
 *
 *   npx tsx scripts/log-drop-0816-1115.ts           # dry run
 *   npx tsx scripts/log-drop-0816-1115.ts --apply
 *
 * Voice: "I just got to the Shoreline Fred Meyer 15. It's a Pitch Black Booster
 * Pack, Mega Evolution Booster Pack, Destined Rivals Booster Pack, and a Journey
 * Together Booster Bundle. I'm buying the Destined Rivals Booster Pack."
 *
 * Four products out on one drop, he took one. 11:15 is ON the mark; Shoreline
 * Fred Meyer runs :15:30 / :45:30.
 *
 * $5.00 is the flat vending single-pack price, not an estimate: $4.49 plus tax,
 * and it has been exactly $5.00 every time.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, appendFileSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG_ITEM = 17236;          // Destined Rivals Booster Pack
const DATE = '2026-08-16';
const DAY = 'Sunday';
const TIME = '11:15';
const LOCATION = 'Shoreline Fred Meyer';
const COST = 500;
const NOTE = 'Shoreline Fred Meyer 11:15, ON the :15. Standard $5.00 vending single-pack price. Four products out on the one drop: also a Pitch Black pack, a Mega Evolution pack and a Journey Together booster bundle, all left.';

const CSV_ROWS = [
  `${DATE},${DAY},${TIME},${LOCATION},hit,Destined Rivals Booster Pack,1,5.00,"ON the :15. Four products out on one drop, took the DR pack"`,
  `${DATE},${DAY},${TIME},${LOCATION},seen,Pitch Black Booster Pack,0,,"Out on the same :15 drop, left"`,
  `${DATE},${DAY},${TIME},${LOCATION},seen,Mega Evolution Booster Pack,0,,"Out on the same :15 drop, left"`,
  `${DATE},${DAY},${TIME},${LOCATION},seen,Journey Together Booster Bundle,0,,"Out on the same :15 drop, left. JT bundle market $47.06 against $30 vending, roughly $10 net, his thinnest bundle"`,
];

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

async function main() {
  const [ci]: any = await sql`SELECT id, name FROM catalog_items WHERE id=${CATALOG_ITEM}`;
  const [u]: any = await sql`SELECT user_id FROM purchases WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 1`;
  const before = await held();
  console.log(`${ci.name} (ci${ci.id})`);
  console.log(`  buy 1 @ $${(COST / 100).toFixed(2)}  ${LOCATION} ${TIME} on ${DATE}`);
  console.log(`  held ${before} -> ${before + 1}`);
  for (const r of CSV_ROWS) console.log(`    ${r.slice(0, 100)}`);

  const dupe: any = await sql`
    SELECT id FROM purchases WHERE catalog_item_id=${CATALOG_ITEM} AND purchase_date=${DATE}
      AND deleted_at IS NULL AND COALESCE(notes,'') LIKE ${'%' + TIME + '%'}`;
  if (dupe.length) { console.error(`  already logged as lot #${dupe[0].id}, refusing`); process.exit(1); }
  if (readFileSync('data/drop_log.csv', 'utf8').includes(`${DATE},${DAY},${TIME},${LOCATION},hit,`)) {
    console.error('  csv already has a hit for this drop, refusing'); process.exit(1);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const [row]: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${u.user_id}, ${CATALOG_ITEM}, ${DATE}, 1, ${COST}, 'Vending Machine', ${LOCATION}, ${NOTE})
    RETURNING id`;
  console.log(`\n  logged lot #${row.id}`);
  appendFileSync('data/drop_log.csv', CSV_ROWS.join('\n') + '\n');
  console.log(`  appended ${CSV_ROWS.length} rows to drop_log.csv`);
  console.log(`  held now ${await held()}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
