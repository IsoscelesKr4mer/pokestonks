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
  const policies = await sql<{ tablename: string; policyname: string }[]>`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `;
  console.log(`\nPolicies (${policies.length}):`);
  for (const p of policies) console.log(`  ${p.tablename}.${p.policyname}`);

  const rlsTables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log(`\nRLS status:`);
  for (const t of rlsTables) console.log(`  ${t.rowsecurity ? '✓' : '✗'} ${t.tablename}`);

  const fn = await sql<{ proname: string }[]>`
    SELECT proname FROM pg_proc WHERE proname = 'handle_new_user'
  `;
  console.log(`\nProfile trigger function: ${fn.length > 0 ? '✓ present' : '✗ MISSING'}`);

  const trig = await sql<{ tgname: string }[]>`
    SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created'
  `;
  console.log(`Profile trigger on auth.users: ${trig.length > 0 ? '✓ present' : '✗ MISSING'}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
