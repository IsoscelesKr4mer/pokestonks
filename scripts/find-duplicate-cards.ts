/**
 * Find baseball_cards rows that probably describe the SAME physical card.
 *
 *   npx tsx scripts/find-duplicate-cards.ts
 *
 * The guard already in list-single-cards.ts compares `parallel` with an exact
 * lower() match, which is why it missed Wyatt Sanford: one row said
 * "Green Mojo Refractor (approx /399)", the other "Green Mojo Refractor /399
 * (227/399)". Same card, different text, no match. This normalises first:
 * strip parentheticals, strip /N serials, collapse whitespace. Both of those
 * collapse to "green mojo refractor".
 *
 * It also does NOT match on set_name, because those two rows disagreed there
 * too — "2026 Bowman Chrome Prospects" vs "2026 Bowman Chrome" for the same
 * BCP-66 card.
 *
 * NO BACKSLASHES IN THE REGEXES ON PURPOSE. `'\('` and `'\\('` both arrive at
 * Postgres as a bare `(`, which silently turns the pattern into a capture group
 * that eats the whole string — the first version of this script normalised every
 * parallel to "" and reported 74 bogus groups. POSIX classes and bracket
 * literals cannot be mangled by JS string escaping.
 *
 * Owning two identical cards is legitimate — he has two Misiorowski #196
 * X-Fractors — so this REPORTS, it does not act. Confirmed same-card pairs get
 * `duplicate_of_id` set, which the CHECK constraint then keeps off sale.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const NORM = `btrim(regexp_replace(regexp_replace(regexp_replace(
  lower(coalesce(parallel,'base')), '[(][^)]*[)]', '', 'g'),
  '[[:space:]]*/[[:space:]]*[0-9]+', '', 'g'),
  '[[:space:]]+', ' ', 'g'))`;

async function main() {
  const groups: any = await sql.unsafe(`
    WITH norm AS (
      SELECT id, lower(player) AS p, card_number AS cn, ${NORM} AS pk
      FROM baseball_cards WHERE card_number IS NOT NULL
    )
    SELECT p, cn, pk, COUNT(*)::int n, array_agg(id ORDER BY id) AS ids
    FROM norm GROUP BY p, cn, pk HAVING COUNT(*) > 1
    ORDER BY n DESC, p`);

  // Owning several copies of the same card is NORMAL and correctly handled: the
  // rows all point at ONE listing whose quantity covers them (three Pete
  // Crow-Armstrong #45s share item 168584893860 at qty 3). Flagging those would
  // bury the real signal under ~57 false positives.
  //
  // The dangerous shape is the Wyatt Sanford one: several sellable rows for the
  // same card sitting on DIFFERENT listings, so one physical card is buyable in
  // two places.
  let risky = 0;
  const benign: string[] = [];
  for (const g of groups) {
    const rows: any = await sql`
      SELECT id, set_name, parallel, status, for_sale, asking_price_cents,
             sold_date::text sd, ebay_item_id, duplicate_of_id
      FROM baseball_cards WHERE id = ANY(${g.ids}) ORDER BY id`;
    const sellable = rows.filter((x: any) => x.for_sale);
    const listings = new Set(sellable.map((x: any) => x.ebay_item_id).filter(Boolean));
    if (sellable.length <= 1 || listings.size <= 1) {
      benign.push(`${g.p} #${g.cn} "${g.pk}" x${g.n} (${sellable.length} sellable on ${listings.size} listing)`);
      continue;
    }
    risky++;
    console.log(`*** ${g.p} #${g.cn} "${g.pk}" — ${sellable.length} sellable rows across ${listings.size} DIFFERENT listings`);
    for (const x of rows) {
      console.log(
        `   #${String(x.id).padEnd(4)} ${String(x.set_name ?? '').padEnd(30)} ` +
        `${String(x.parallel ?? 'base').padEnd(40)} ${String(x.status).padEnd(12)} ` +
        `for_sale=${String(x.for_sale).padEnd(5)} dup_of=${x.duplicate_of_id ?? '-'} item=${x.ebay_item_id ?? '-'}`
      );
    }
    console.log();
  }
  console.log(`${risky} group(s) have one card sellable across MORE THAN ONE listing. Those are real problems.`);
  console.log(`${benign.length} group(s) are multiple copies sharing a single listing, which is correct.`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
