/**
 * Price the 2026 Topps Chrome inserts one price per CARD, ready for the
 * per-insert dropdown listings.
 *
 *   npx tsx scripts/price-insert-variations.ts           # dry run
 *   npx tsx scripts/price-insert-variations.ts --apply
 *
 * Why this exists rather than price-cards.ts:
 *
 *  - A dropdown variation is one card at one price with a quantity, so the unit
 *    of pricing is the CARD, not the row. Two rows of the same card must not
 *    hold two prices, which they did (BTP-23 at $4.49 and $2.49 simultaneously).
 *  - price-cards.ts skips anything already `listed`, so the 49 insert cards
 *    sitting in the Chrome you-pick could never be re-comped. They are being
 *    relisted, so they all need a fresh number.
 *  - It also refuses to cut an existing price by more than a third, which is the
 *    right guard against clobbering a hand-set price but wrong here, where the
 *    old numbers came from the three comp bugs documented in lib/card-comps.ts.
 *
 * One Browse call per distinct card, applied to every row of that card.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { browseToken, comps, pct, buildQuery } from './lib/card-comps';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const MIN_COMPS = 5;

const TC = '2026 Topps Chrome';
/** The seven sets getting their own dropdown listing. */
const DROPDOWN_SETS = [
  `${TC} (1991 Topps Baseball insert)`,
  `${TC} (Wrecking Crew insert)`,
  `${TC} (Big Ticket Players insert)`,
  `${TC} (Chrome Rivals insert)`,
  `${TC} (Past to Present insert)`,
  `${TC} (Future Stars insert)`,
  `${TC} (Perspectives insert)`,
];
/**
 * Cards that stay on their own listing and must NOT be re-priced here, or the
 * DB would drift away from a live eBay listing this script never touches.
 * Diamond Moments and Static Noise are single-card sets and are excluded by
 * DROPDOWN_SETS above; this covers the one card inside a dropdown set that is
 * over the $10 you-pick cutoff.
 */
const STAY_STANDALONE = ['91CB-22']; // Munetaka Murakami, $13.49, item 168561671901
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Round to a clean .49/.99, floored at $1.49. */
function tidy(cents: number) {
  const d = Math.max(1.49, cents / 100);
  const whole = Math.floor(d), frac = d - whole;
  return Math.round((whole + (frac < 0.5 ? 0.49 : 0.99)) * 100);
}

async function main() {
  // bigint ids arrive as strings from postgres.js
  const rows: any = (await sql`
    SELECT id, player, set_name, year, card_number, parallel, status, asking_price_cents AS ask
    FROM baseball_cards
    WHERE set_name IN ${sql(DROPDOWN_SETS)} AND status <> 'sold'
      AND card_number <> ALL(${STAY_STANDALONE})`)
    .map((r: any) => ({ ...r, id: Number(r.id) }));

  const cards = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.set_name}||${r.card_number}`;
    if (!cards.has(k)) cards.set(k, []);
    cards.get(k)!.push(r);
  }
  console.log(`${cards.size} distinct cards across ${rows.length} rows (APPLY=${APPLY})\n`);

  const tok = await browseToken();
  const thin: string[] = [];
  let done = 0;

  for (const [, group] of cards) {
    const c = group[0];
    const prices = await comps(tok, c);
    await sleep(120);
    if (prices.length < MIN_COMPS) {
      thin.push(`  ${String(c.card_number).padEnd(9)} ${c.player.padEnd(30)} only ${prices.length} comp(s)  q="${buildQuery(c)}"`);
      continue;
    }
    // 35th percentile to actually move, floored at half the median so a single
    // junk listing cannot drag the ask down.
    const med = pct(prices, 0.5);
    const price = Math.max(tidy(pct(prices, 0.35) * 100), Math.round(med * 0.5));
    const note = `${prices.length} active comps: low $${Math.min(...prices).toFixed(2)} / med $${med.toFixed(2)} / high $${Math.max(...prices).toFixed(2)} (eBay Browse, raw only, graded excluded)`;
    const olds = group.map((g: any) => (g.ask == null ? '--' : `$${(g.ask / 100).toFixed(2)}`)).join('/');
    console.log(`  ${String(c.card_number).padEnd(9)} ${c.player.padEnd(30)} qty ${group.length}  ${olds.padStart(12)} -> $${(price / 100).toFixed(2)}  (${prices.length} comps, med $${med.toFixed(2)})`);
    if (APPLY) {
      await sql`UPDATE baseball_cards
        SET asking_price_cents = ${price},
            status = CASE WHEN status IN ('photographed','needs_photos') THEN 'priced' ELSE status END,
            comp_note = ${note}, updated_at = now()
        WHERE id = ANY(${group.map((g: any) => g.id)})`;
    }
    done++;
  }

  console.log(`\n${done} cards priced${thin.length ? `, ${thin.length} too thin for a percentile:` : ''}`);
  if (thin.length) { console.log(thin.join('\n')); console.log('  -> these keep whatever price they had; set them by hand.'); }
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
