/**
 * Normalise accented player names, then re-run the duplicate guard.
 *
 *   npx tsx scripts/fix-accented-player-names-1005.ts [--apply]
 *
 * The box 5 collision check flagged "2026 Bowman Chrome #35 -> Julio Rodriguez |
 * Julio Rodríguez". That is ONE player stored under two spellings, and it is not
 * cosmetic:
 *
 *   - id615 "Julio Rodriguez" #35 base is LIVE on eBay (168680135269,
 *     BOWCH-YP-35-58).
 *   - id791 "Julio Rodríguez" #35 base went in from box 5 with for_sale=true and
 *     NO duplicate_of_id, because the duplicate lookup matches on `player` and
 *     the accent made the two strings unequal.
 *
 * So the accent silently defeated the one guard that stops a single physical card
 * being listed twice. Exactly the failure the comp script hit three times tonight
 * (Rodriguez, Owusu-Asiedu, Tibbs III): a name compared without normalising BOTH
 * sides is a name that does not match itself.
 *
 * The vault's own convention is UNACCENTED - every pre-existing row (id49, id64,
 * id615, from July and September) spells it "Julio Rodriguez", and eBay titles do
 * too. Boxes 1-5 introduced the accented spellings. So normalise toward the older
 * form rather than the newer one.
 *
 * Three names are affected: Jesus Made, Jose Ramirez, Julio Rodriguez.
 *
 * After renaming, every touched row is re-checked against the duplicate rule and
 * gets duplicate_of_id + for_sale=false where an earlier non-duplicate row for the
 * same player/set/number/parallel already exists.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const ACCENTS = 'áéíóúÁÉÍÓÚñÑüÜçÇ';
const PLAIN = 'aeiouAEIOUnNuUcC';

(async () => {
  // only names that exist in BOTH spellings - do not mass-rewrite every accent
  const pairs = await sql`SELECT translate(player, ${ACCENTS}, ${PLAIN}) AS norm,
      string_agg(DISTINCT player, ' | ') AS variants
    FROM baseball_cards
    GROUP BY 1 HAVING count(DISTINCT player) > 1`;

  if (!pairs.length) { console.log('no split names, nothing to do'); await sql.end(); return; }
  console.log(`${pairs.length} name(s) stored under two spellings:`);
  pairs.forEach((p: any) => console.log(`  ${p.norm}  <-  ${p.variants}`));

  const targets = (pairs as any[]).map((p) => p.norm);
  const rows = await sql`SELECT id, player, card_number, set_name, parallel, status, for_sale, ebay_item_id
    FROM baseball_cards
    WHERE translate(player, ${ACCENTS}, ${PLAIN}) = ANY(${targets})
      AND player <> translate(player, ${ACCENTS}, ${PLAIN})
    ORDER BY id`;
  console.log(`\n${rows.length} row(s) carry the accented spelling and will be renamed:`);
  rows.forEach((r: any) => console.log(`  id${r.id} "${r.player}" #${r.card_number} ${r.parallel} | ${r.status} fs=${r.for_sale}`));

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  let renamed = 0;
  for (const r of rows as any[]) {
    const res = await sql`UPDATE baseball_cards
      SET player = translate(player, ${ACCENTS}, ${PLAIN}),
          notes = coalesce(notes, '') || ${' | Player name normalised 2026-10-05: the vault already held this player '
            + 'unaccented, and the mismatch was hiding duplicates from the duplicate_of_id guard.'},
          updated_at = now()
      WHERE id = ${r.id} AND player = ${r.player}
      RETURNING id`;
    renamed += res.length;
  }
  console.log(`\nrenamed ${renamed} row(s)`);

  // now that the names match, re-apply the duplicate rule to the renamed rows
  let marked = 0;
  for (const r of rows as any[]) {
    const prior = await sql`SELECT id, ebay_item_id, ebay_sku FROM baseball_cards
      WHERE id <> ${r.id}
        AND player = translate(${r.player}, ${ACCENTS}, ${PLAIN})
        AND set_name = ${r.set_name} AND card_number = ${r.card_number}
        AND parallel = ${r.parallel} AND duplicate_of_id IS NULL
        AND id < ${r.id}
      ORDER BY id LIMIT 1`;
    if (!prior.length) continue;
    const p = prior[0] as any;
    const res = await sql`UPDATE baseball_cards
      SET duplicate_of_id = ${p.id}, for_sale = false,
          notes = coalesce(notes, '') || ${' | SECOND PHYSICAL COPY of id ' + p.id
            + '. Caught only after the name was normalised; the accented spelling had hidden it. '
            + 'Held off sale - raise the quantity on the existing listing instead.'},
          updated_at = now()
      WHERE id = ${r.id} AND duplicate_of_id IS NULL
      RETURNING id`;
    if (res.length) {
      marked++;
      console.log(`  id${r.id} -> duplicate of id${p.id}` + (p.ebay_item_id ? `  (QTY BUMP: item ${p.ebay_item_id} sku ${p.ebay_sku})` : ''));
    }
  }
  console.log(`marked ${marked} newly-visible duplicate(s)`);

  const chk = await sql`SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') AS p
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1, 2 HAVING count(DISTINCT player) > 1`;
  console.log(chk.length ? '\nCOLLISIONS REMAIN:' : '\ncollision check clean');
  chk.forEach((r: any) => console.log('  ' + r.set_name + ' #' + r.card_number + ' -> ' + r.p));

  const split = await sql`SELECT count(*)::int n FROM (
      SELECT 1 FROM baseball_cards GROUP BY translate(player, ${ACCENTS}, ${PLAIN})
      HAVING count(DISTINCT player) > 1) t`;
  console.log(`names still stored under two spellings: ${split[0].n}`);
  await sql.end();
})();
