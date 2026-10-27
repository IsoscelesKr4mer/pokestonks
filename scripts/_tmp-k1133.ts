import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';
(async () => {
  const sql = postgres(process.env.DATABASE_URL as string, { prepare: false });
  for (const id of [1133, 968, 925]) {
    const [c] = await sql`SELECT quantity, notes FROM cards WHERE id=${id}`;
    console.log(`\ncard ${id}  qty ${c.quantity}`);
    console.log(`  notes: ${String(c.notes ?? '(none)').slice(0, 220)}`);
    const ph = await sql`SELECT id, side, is_primary, url, storage_path FROM card_photos WHERE card_id=${id} ORDER BY id`;
    for (const x of ph) console.log(`    ${x.id}\t${x.side}\t${x.url ?? x.storage_path}`);
  }
  await sql.end(); process.exit(0);
})();
