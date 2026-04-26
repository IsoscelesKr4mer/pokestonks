import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

const expected = [
  'profiles',
  'catalog_items',
  'market_prices',
  'purchases',
  'sales',
  'user_graded_values',
  'refresh_runs',
];

async function main() {
  const rows = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  const found = new Set(rows.map((r) => r.table_name));
  let ok = true;
  for (const name of expected) {
    if (found.has(name)) {
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ✗ MISSING: ${name}`);
      ok = false;
    }
  }
  await sql.end();
  if (!ok) process.exit(1);
  console.log(`\nAll ${expected.length} tables present.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
