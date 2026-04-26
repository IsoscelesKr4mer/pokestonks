import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const url = process.env.DATABASE_URL_DIRECT;
if (!url) {
  console.error('DATABASE_URL_DIRECT is required');
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

async function main() {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const path = join(dir, file);
    const body = readFileSync(path, 'utf8');
    console.log(`> applying ${file}`);
    await sql.unsafe(body);
  }
  console.log('done');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
