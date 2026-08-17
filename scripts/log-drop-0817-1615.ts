/**
 * Shoreline Fred Meyer 16:15 drop, 2026-08-17.
 *
 *   npx tsx scripts/log-drop-0817-1615.ts           # dry run
 *   npx tsx scripts/log-drop-0817-1615.ts --apply
 *
 * Michael: "Just got a DR bundle from Fred Meyer at 4:15"
 *
 * 16:15 is ON the mark; Shoreline Fred Meyer runs :15:30 / :45:30. $30.00 is the
 * standard vending bundle price, matching every prior vending bundle.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, appendFileSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const CATALOG_ITEM = 17235;          // Destined Rivals Booster Bundle
const DATE = '2026-08-17';
const DAY = 'Monday';
const TIME = '16:15';
const LOCATION = 'Shoreline Fred Meyer';
const COST = 3000;
const NOTE = 'Shoreline Fred Meyer 16:15, ON the :15. Standard $30 vending bundle price.';
const CSV = `${DATE},${DAY},${TIME},${LOCATION},hit,Destined Rivals Booster Bundle,1,30.00,"ON the :15"`;

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
  console.log(`${ci.name}`);
  console.log(`  buy 1 @ $${(COST / 100).toFixed(2)}  ${LOCATION} ${TIME} on ${DATE}`);
  console.log(`  held ${before} -> ${before + 1}`);

  const dupe: any = await sql`
    SELECT id FROM purchases WHERE catalog_item_id=${CATALOG_ITEM} AND purchase_date=${DATE}
      AND deleted_at IS NULL AND COALESCE(notes,'') LIKE ${'%' + TIME + '%'}`;
  if (dupe.length) { console.error(`  already logged as lot #${dupe[0].id}, refusing`); process.exit(1); }
  if (readFileSync('data/drop_log.csv', 'utf8').includes(`${DATE},${DAY},${TIME},${LOCATION},hit,`)) {
    console.error('  csv already has this drop, refusing'); process.exit(1);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  const [row]: any = await sql`
    INSERT INTO purchases (user_id, catalog_item_id, purchase_date, quantity, cost_cents, source, location, notes)
    VALUES (${u.user_id}, ${CATALOG_ITEM}, ${DATE}, 1, ${COST}, 'Vending Machine', ${LOCATION}, ${NOTE})
    RETURNING id`;
  appendFileSync('data/drop_log.csv', CSV + '\n');
  console.log(`\n  logged lot #${row.id}, drop_log appended`);
  console.log(`  held now ${await held()}`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
