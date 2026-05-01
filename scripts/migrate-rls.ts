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

async function ensureAppliedTable(): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.rls_migrations_applied (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function isApplied(name: string): Promise<boolean> {
  const rows = await sql<{ name: string }[]>`
    SELECT name FROM public.rls_migrations_applied WHERE name = ${name}
  `;
  return rows.length > 0;
}

async function markApplied(name: string): Promise<void> {
  await sql`
    INSERT INTO public.rls_migrations_applied (name)
    VALUES (${name})
    ON CONFLICT (name) DO NOTHING
  `;
}

async function main() {
  await ensureAppliedTable();

  const dir = join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (await isApplied(file)) {
      console.log(`[skip] ${file} already applied`);
      continue;
    }
    const path = join(dir, file);
    const body = readFileSync(path, 'utf8');
    console.log(`> applying ${file}`);
    await sql.unsafe(body);
    await markApplied(file);
    console.log(`[ok] ${file} applied`);
  }
  console.log('done');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
