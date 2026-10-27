import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
(async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { prepare: false });

  console.log('=== every card row for Kade Anderson, any product ===');
  const c = await sql`
    SELECT c.id, p.year, p.product_name, ce.card_number, pa.name parallel,
           c.serial_number, c.quantity,
           (SELECT count(*)::int FROM card_photos ph WHERE ph.card_id=c.id) photos,
           (SELECT string_agg(ph.side, ',') FROM card_photos ph WHERE ph.card_id=c.id) sides
    FROM cards c JOIN checklist_entries ce ON ce.id=c.checklist_entry_id
    JOIN products p ON p.id=c.product_id LEFT JOIN parallels pa ON pa.id=c.parallel_id
    WHERE ce.player ILIKE '%kade anderson%' ORDER BY c.id`;
  for (const x of c)
    console.log(`  [${x.id}] ${x.year} ${String(x.product_name).padEnd(26)} #${String(x.card_number).padEnd(9)} ${String(x.parallel ?? 'base').padEnd(18)} ${x.serial_number ?? ''}  photos=${x.photos} (${x.sides ?? '-'})`);

  console.log('\n=== review_items for Kade (unresolved reshoot leftovers?) ===');
  const r = await sql`
    SELECT ri.id, ri.batch_id, ri.pair_index, ri.status, ri.reasons, ri.resolved_card_id,
           ri.front_photo_id, ri.back_photo_id
    FROM review_items ri WHERE ri.scanned::text ILIKE '%kade%'`;
  for (const x of r) console.log(`  item ${x.id} batch ${x.batch_id} pair ${x.pair_index} status=${x.status} resolved=${x.resolved_card_id} front=${x.front_photo_id} back=${x.back_photo_id}`);
  if (!r.length) console.log('  (none)');

  console.log('\n=== photos in batch 5029 (the PC reshoot) whose card has BCP-19 ===');
  const ph = await sql`
    SELECT p.id, p.batch_id, p.side, p.pair_index, p.original_filename,
           (SELECT count(*)::int FROM card_photos cp WHERE cp.source_hash = p.content_hash) linked
    FROM photos p WHERE p.batch_id = 5029 ORDER BY p.pair_index LIMIT 4`;
  console.log(`  (sample of batch 5029 photos, ${ph.length} shown)`);
  for (const x of ph) console.log(`    photo ${x.id} pair ${x.pair_index} ${x.side} ${x.original_filename} linked=${x.linked}`);
  await sql.end(); process.exit(0);
})();
