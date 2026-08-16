/**
 * Settle one price per 2026 Topps Chrome insert card, ready for per-set
 * multi-variation listings.
 *
 *   npx tsx scripts/settle-insert-prices.ts           # dry run
 *   npx tsx scripts/settle-insert-prices.ts --apply
 *
 * A dropdown variation is one card at one price with a quantity, so two rows of
 * the same card holding two different prices cannot both be right.
 *
 * Three things get fixed, in this order:
 *
 * 1. DUPLICATES INHERIT. Where a card has more than one row, every row takes the
 *    highest price any of them carried. The price can always be cut later; the
 *    reverse leaves money behind. This also fills the six bag-counted copies
 *    that have no photo and never had a price.
 *
 * 2. THIN-COMP PRICES ARE THROWN AWAY. price-cards.ts now refuses to price on
 *    fewer than 5 active comps, but four cards were priced before that guard
 *    existed, off 1-3 comps each, and the results were nonsense against sets
 *    whose median is about $2: Ohtani BTP-3 $27.49 off ONE comp, Torkelson
 *    WC-19 $15.49 off three spanning $1.74-$35, Yelich RVA-24 $24.99 off three
 *    spanning $2.00-$29.99, Ohtani WC-2 $9.99 off two.
 *
 * 3. WHAT IS LEFT GETS THE SET MEDIAN, FLAGGED. Cards with no twin and no
 *    usable comps are defaulted to the median of their own insert set, which is
 *    a real signal for these $2 commons, and every one is written into
 *    comp_note as a default so it can be found and overridden.
 *
 * Nothing here touches a live listing.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

/** Priced off too few comps to be believable; discard and re-default. */
const THIN = [
  { id: 374, code: 'BTP-3', why: '1 comp' },
  { id: 365, code: 'WC-19', why: '3 comps spanning $1.74-$35' },
  { id: 377, code: 'RVA-24', why: '3 comps spanning $2.00-$29.99' },
  { id: 363, code: 'WC-2', why: '2 comps' },
];

async function main() {
  // baseball_cards.id is a bigint, and postgres.js hands bigints back as
  // STRINGS. Comparing them against numeric literals silently fails: the first
  // version of this script never matched a single THIN id, so all four bad
  // prices survived a run that reported success. Coerce once, here.
  const rows: any = (await sql`
    SELECT id, player, set_name, card_number, asking_price_cents AS ask, status
    FROM baseball_cards
    WHERE set_name LIKE '2026 Topps Chrome (%insert)' AND status <> 'sold'`)
    .map((r: any) => ({ ...r, id: Number(r.id) }));

  const thinIds = new Set(THIN.map((t) => t.id));
  const seen = new Set(rows.map((r: any) => r.id));
  const missing = THIN.filter((t) => !seen.has(t.id));
  if (missing.length) { console.error(`THIN ids not found in the insert rows: ${missing.map((m) => m.id).join(', ')}`); process.exit(1); }
  const plan = new Map<number, { to: number; why: string }>();

  // group by set + card number
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.set_name}||${r.card_number}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  // set medians, computed from prices we still trust
  const bySet = new Map<string, number[]>();
  for (const r of rows) {
    if (r.ask == null || thinIds.has(r.id)) continue;
    if (!bySet.has(r.set_name)) bySet.set(r.set_name, []);
    bySet.get(r.set_name)!.push(r.ask);
  }
  const median = (s: string) => {
    const a = (bySet.get(s) ?? []).slice().sort((x, y) => x - y);
    return a.length ? a[Math.floor(a.length / 2)] : 249;
  };

  for (const [, g] of groups) {
    const trusted = g.filter((r: any) => r.ask != null && !thinIds.has(r.id)).map((r: any) => r.ask);
    if (trusted.length) {
      const best = Math.max(...trusted);
      for (const r of g) {
        if (r.ask !== best) plan.set(r.id, { to: best, why: g.length > 1 ? `matched to the other copy of ${r.card_number}` : 'thin-comp price discarded' });
      }
    } else {
      const med = median(g[0].set_name);
      for (const r of g) {
        const t = THIN.find((x) => x.id === r.id);
        plan.set(r.id, { to: med, why: `DEFAULTED to the ${g[0].set_name.replace('2026 Topps Chrome (', '').replace(' insert)', '')} median${t ? `, previous price came off only ${t.why}` : ', no usable comps'}` });
      }
    }
  }

  if (!plan.size) { console.log('nothing to settle'); await sql.end(); return; }
  const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]));
  console.log(`${plan.size} rows to settle:\n`);
  for (const [id, p] of [...plan].sort((a, b) => String(byId.get(a[0])!.card_number).localeCompare(String(byId.get(b[0])!.card_number)))) {
    const r: any = byId.get(id);
    const from = r.ask == null ? '(none)' : `$${(r.ask / 100).toFixed(2)}`;
    console.log(`  #${String(id).padEnd(4)} ${String(r.card_number).padEnd(9)} ${r.player.padEnd(30)} ${from.padStart(8)} -> $${(p.to / 100).toFixed(2)}   ${p.why}`);
  }
  if (!APPLY) { console.log('\ndry run'); await sql.end(); return; }

  for (const [id, p] of plan) {
    await sql`UPDATE baseball_cards
      SET asking_price_cents = ${p.to},
          status = CASE WHEN status = 'photographed' THEN 'priced' ELSE status END,
          comp_note = ${`Price settled 2026-08-16 for the per-insert dropdown: ${p.why}.`},
          updated_at = now()
      WHERE id = ${id}`;
  }
  console.log(`\n${plan.size} rows settled.`);
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
