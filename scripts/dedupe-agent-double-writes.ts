/**
 * Two agent sessions are currently bridged to the same Discord channel, so each
 * reported buy can get logged twice, seconds apart. This removes the twin.
 *
 *   npx tsx scripts/dedupe-agent-double-writes.ts            # report only
 *   npx tsx scripts/dedupe-agent-double-writes.ts --apply    # soft-delete twins
 *
 * Rule: same catalog item, same purchase_date, same quantity, same cost, and
 * created within 5 minutes of each other. Keeps the lowest id. Two genuinely
 * separate identical buys inside five minutes is not a thing here, the machines
 * drop on 30-minute marks and Michael reports each one as it happens. Wider
 * clusters (bulk entry sessions like 5/11 and 5/13) are deliberately left alone.
 *
 * Retire this once only one session is listening.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

async function main() {
  const pairs: any = await sql`
    SELECT a.id AS keep_id, b.id AS drop_id, a.purchase_date::text AS d,
           a.quantity, a.cost_cents, ci.name,
           extract(epoch from (b.created_at - a.created_at))::int AS gap_s,
           a.notes AS keep_notes, b.notes AS drop_notes
    FROM purchases a
    JOIN purchases b ON b.catalog_item_id = a.catalog_item_id
                    AND b.purchase_date  = a.purchase_date
                    AND b.quantity       = a.quantity
                    AND b.cost_cents     = a.cost_cents
                    AND b.id > a.id
                    AND b.created_at - a.created_at < interval '5 minutes'
    JOIN catalog_items ci ON ci.id = a.catalog_item_id
    WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      AND a.purchase_date >= current_date - 2
    ORDER BY a.created_at`;

  if (!pairs.length) { console.log('no double-writes found'); await sql.end(); return; }

  for (const p of pairs) {
    console.log(`dupe: keep lot${p.keep_id}, drop lot${p.drop_id} | ${p.d} qty${p.quantity} $${(p.cost_cents / 100).toFixed(2)} ${p.name} | ${p.gap_s}s apart`);
    console.log(`   keep: ${p.keep_notes}`);
    console.log(`   drop: ${p.drop_notes}`);
  }
  if (!APPLY) { console.log(`\n${pairs.length} pair(s) - pass --apply to soft-delete the twins`); await sql.end(); return; }

  const ids = pairs.map((p: any) => p.drop_id);
  const done: any = await sql`
    UPDATE purchases SET deleted_at = now(),
      notes = coalesce(notes,'') || ' | DELETED: duplicate write from the second agent session'
    WHERE id = ANY(${ids}) AND deleted_at IS NULL
    RETURNING id`;
  console.log('soft-deleted:', done.map((x: any) => 'lot' + x.id).join(', '));
  await sql.end();
}

main().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
