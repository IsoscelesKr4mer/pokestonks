/**
 * Make it structurally impossible to list the same physical card twice.
 *
 *   npx tsx scripts/apply-duplicate-guard-ddl.ts --apply
 *
 * WHY A CONSTRAINT AND NOT ANOTHER CHECK IN A SCRIPT. list-single-cards.ts has
 * had a duplicate guard since 2026-08-14 and this still happened a third time,
 * because that guard compares `parallel` with an exact lower() match and the two
 * Wyatt Sanford rows disagreed on the text ("Green Mojo Refractor (approx /399)"
 * vs "Green Mojo Refractor /399 (227/399)"). A note in `notes` saying "removed
 * from sale" is documentation; a boolean anyone can flip is not a guarantee.
 *
 * `duplicate_of_id` says "this row is a second record of the card in row N, not
 * a second card". The CHECK then makes for_sale=true impossible on such a row,
 * so ANY script that tries to relist it fails loudly instead of quietly minting
 * a rival listing.
 *
 * Deliberately NOT a unique index on (player, number, parallel): he genuinely
 * owns duplicate cards sometimes — two Misiorowski #196 X-Fractors, rows #268
 * and #347 — and both of those are legitimately sellable.
 */
import { config } from 'dotenv'; import postgres from 'postgres';
config({ path: '.env.local' });
const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const DDL = `
ALTER TABLE "baseball_cards" ADD COLUMN IF NOT EXISTS "duplicate_of_id" bigint;

DO $$ BEGIN
  ALTER TABLE "baseball_cards" ADD CONSTRAINT "baseball_cards_duplicate_of_fk"
    FOREIGN KEY ("duplicate_of_id") REFERENCES "baseball_cards"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "baseball_cards" ADD CONSTRAINT "baseball_cards_duplicate_not_self"
    CHECK ("duplicate_of_id" IS NULL OR "duplicate_of_id" <> "id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "baseball_cards" ADD CONSTRAINT "baseball_cards_duplicate_not_for_sale"
    CHECK ("duplicate_of_id" IS NULL OR "for_sale" = false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "baseball_cards_duplicate_of_idx"
  ON "baseball_cards" USING btree ("duplicate_of_id");
`;
(async()=>{
  const [before]:any = await sql`SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='baseball_cards' AND column_name='duplicate_of_id'`;
  console.log(`duplicate_of_id exists before: ${before.n > 0}`);
  if(!APPLY){ console.log('\nDDL to run:\n' + DDL); await sql.end(); return; }
  await sql.unsafe(DDL);
  const [after]:any = await sql`SELECT COUNT(*)::int n FROM information_schema.columns WHERE table_name='baseball_cards' AND column_name='duplicate_of_id'`;
  const cons:any = await sql`SELECT conname FROM pg_constraint WHERE conrelid='baseball_cards'::regclass AND conname LIKE '%duplicate%' ORDER BY conname`;
  console.log(`column now exists: ${after.n > 0}`);
  console.log('constraints:', cons.map((c:any)=>c.conname).join(', '));

  // Backfill the one known duplicate: #171 is a second record of card #4.
  await sql`UPDATE baseball_cards SET duplicate_of_id=4, updated_at=now() WHERE id=171 AND duplicate_of_id IS NULL`;
  const [r]:any = await sql`SELECT id, duplicate_of_id, for_sale, status FROM baseball_cards WHERE id=171`;
  console.log(`#171 -> duplicate_of_id=${r.duplicate_of_id}, for_sale=${r.for_sale}, status=${r.status}`);

  // Prove the constraint actually bites.
  try {
    await sql`UPDATE baseball_cards SET for_sale=true WHERE id=171`;
    console.error('  ❌ CONSTRAINT DID NOT FIRE — a duplicate row was made sellable');
    process.exit(1);
  } catch (e:any) {
    console.log(`  ✅ constraint fired: ${String(e.message).slice(0,90)}`);
  }
  await sql.end();
})().catch(e=>{console.error(String(e).slice(0,700));process.exit(1);});
