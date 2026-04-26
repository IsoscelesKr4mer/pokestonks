import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  const profiles = await sql<{ id: string; display_name: string | null; created_at: Date }[]>`
    SELECT id, display_name, created_at FROM profiles ORDER BY created_at DESC
  `;

  if (profiles.length === 0) {
    console.log('✗ No profile rows found. Trigger may not have fired.');
    process.exit(1);
  }

  console.log(`✓ ${profiles.length} profile row(s) found:`);
  for (const p of profiles) {
    console.log(`  ${p.id} | ${p.display_name ?? '(no name)'} | created ${p.created_at.toISOString()}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
