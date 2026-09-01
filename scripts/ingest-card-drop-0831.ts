/**
 * Ingest the 2026-08-31 Chrome drop: 114 cards read as IMG_2456-2696.
 *
 *   npx tsx scripts/ingest-card-drop-0831.ts           # dry run
 *   npx tsx scripts/ingest-card-drop-0831.ts --apply
 *
 * PARITY: front = back - 1 everywhere EXCEPT Nolan McLean, whose front is 2508
 * and back is 2510 because IMG_2509 does not exist. Michael caught that one
 * himself ("Nolan Mclean is 2508 (front) and 2510 (back) and it's base") and it
 * is exactly the gap-flips-parity trap the card-intake skill warns about. The
 * checks below assert every photo is claimed once and none is orphaned, which
 * is what surfaces a second one if it ever happens.
 *
 * The 114th card is a Whatnot freebie that arrived in the mail rather than in
 * the drop, a second #274 Murakami Refractor, photographed as 2695/2696.
 *
 * Prices come from data/chrome_drop_0831_comps.json and _base_comps.json, which
 * were re-run after Michael caught the auto-and-serial contamination. Cards
 * whose comp rests on fewer than four live asks are inserted with NO price and
 * a note saying so, rather than carrying a single seller's opinion into the
 * vault the way the Sapphire rows did.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const BUCKET = 'ebay-listings';
const PUB = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const DIR = 'eBay_assets/card drop';
const RIP = 'From the 2026-08-31 Topps Chrome drop.';
const THIN = 4;

/** card_number prefix decides set_name. Test PTP-/BTP- before P-. */
function setNameFor(num: string): string {
  const C = '2026 Topps Chrome';
  if (/^91CB-/i.test(num)) return `${C} (1991 Topps Baseball insert)`;
  if (/^PTP-/i.test(num)) return `${C} (Past to Present insert)`;
  if (/^BTP-/i.test(num)) return `${C} (Big Ticket Players insert)`;
  if (/^RVA-|^RVH-/i.test(num)) return `${C} (Chrome Rivals insert)`;
  if (/^WC-/i.test(num)) return `${C} (Wrecking Crew insert)`;
  if (/^FS-/i.test(num)) return `${C} (Future Stars insert)`;
  if (/^SN-/i.test(num)) return `${C} (Static Noise insert)`;
  if (/^DM-/i.test(num)) return `${C} (Diamond Moments insert)`;
  if (/^P-/i.test(num)) return `${C} (Perspectives insert)`;
  if (/^[A-Z]+-/i.test(num)) throw new Error(`unknown insert prefix in card_number "${num}" - look it up on the checklist, do not guess`);
  return C;
}

const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Card = { back: number; front: number; num: string; player: string; team: string; parallel: string };

async function main() {
  const rows = readFileSync('data/chrome_drop_0831.tsv', 'utf8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('back\t'))
    .map((l) => l.split('\t'));

  const cards: Card[] = rows.map((r) => {
    const back = Number(r[0]);
    // the single parity exception, asserted rather than assumed
    const front = back === 2510 ? 2508 : back - 1;
    return { back, front, num: r[1], player: r[2], team: r[3], parallel: r[4] };
  });

  // --- photo integrity -----------------------------------------------------
  const missing: string[] = [];
  const claimed = new Map<number, string>();
  for (const c of cards) for (const n of [c.front, c.back]) {
    if (!existsSync(`${DIR}/IMG_${n}.JPEG`)) missing.push(`IMG_${n} (${c.player})`);
    if (claimed.has(n)) { console.error(`IMG_${n} claimed by ${claimed.get(n)} and ${c.player}`); process.exit(1); }
    claimed.set(n, c.player);
  }
  if (missing.length) { console.error('MISSING PHOTOS: ' + missing.join(', ')); process.exit(1); }
  const orphan: number[] = [];
  for (let n = 2456; n <= 2696; n++) if (existsSync(`${DIR}/IMG_${n}.JPEG`) && !claimed.has(n)) orphan.push(n);
  if (orphan.length) { console.error(`photos in range not claimed: ${orphan.join(', ')}`); process.exit(1); }
  console.log(`${claimed.size} photos claimed by ${cards.length} cards, none double-claimed, none orphaned`);

  // --- prices --------------------------------------------------------------
  const comps: any[] = JSON.parse(readFileSync('data/chrome_drop_0831_comps.json', 'utf8'));
  const base: any[] = JSON.parse(readFileSync('data/chrome_drop_0831_base_comps.json', 'utf8'));
  const px = new Map<string, any>();
  for (const c of comps) px.set(`${c.num}|${c.par}`, c);
  for (const c of base) px.set(`${c.num}|base`, c);

  // --- duplicates already in the vault -------------------------------------
  const existing: any = await sql`
    SELECT id, player, card_number, parallel, set_name, status FROM baseball_cards
    WHERE card_number = ANY(${cards.map((c) => c.num)})`;
  const dupKey = new Set(existing.map((e: any) => `${e.card_number}|${e.set_name}|${e.parallel}`));
  const dupes = cards.filter((c) => dupKey.has(`${c.num}|${setNameFor(c.num)}|${c.parallel}`));
  if (dupes.length) {
    console.log(`\n${dupes.length} match a row already in the vault (same number, set and parallel).`);
    console.log('These go in as second physical copies. Check them against the team bags:');
    for (const d of dupes) console.log(`  #${d.num} ${d.player} ${d.parallel}  (IMG_${d.front}/${d.back})`);
  }

  // --- plan ----------------------------------------------------------------
  let priced = 0, unpriced = 0;
  const plan = cards.map((c) => {
    const comp = px.get(`${c.num}|${c.parallel}`);
    const thin = !comp || comp.med == null || comp.n_comps < THIN;
    if (thin) unpriced++; else priced++;
    const note = [
      RIP,
      c.team ? `Team: ${c.team}.` : '',
      thin
        ? `NO PRICE SET: comp rests on ${comp?.n_comps ?? 0} live asks, under the ${THIN} needed for a median to mean anything. Price by hand.`
        : '',
    ].filter(Boolean).join(' ');
    return {
      ...c,
      set_name: setNameFor(c.num),
      ask: thin ? null : Math.round(comp.med * 100),
      comp_note: comp && comp.med != null
        ? `${comp.n_comps} active comps: low $${comp.lo?.toFixed(2)} / med $${comp.med.toFixed(2)} / high $${comp.hi?.toFixed(2)} (eBay Browse 2026-08-31)`
        : null,
      note,
    };
  });

  const bySet = new Map<string, number>();
  for (const p of plan) bySet.set(p.set_name, (bySet.get(p.set_name) || 0) + 1);
  console.log('\nby set:');
  for (const [k, v] of [...bySet].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log(`\n${priced} priced from comps, ${unpriced} left unpriced (thin comps)`);
  const total = plan.reduce((a, p) => a + (p.ask ?? 0), 0);
  console.log(`asking value of the priced rows: $${(total / 100).toFixed(2)}`);

  if (!APPLY) { console.log('\ndry run, nothing written'); await sql.end(); return; }

  // --- upload photos -------------------------------------------------------
  let up = 0;
  for (const c of cards) for (const n of [c.front, c.back]) {
    const name = `bbcard_drop_${n}.jpg`;
    const { error } = await sb.storage.from(BUCKET).upload(name, readFileSync(`${DIR}/IMG_${n}.JPEG`),
      { contentType: 'image/jpeg', upsert: true });
    if (error) { console.error(`upload ${name}: ${error.message}`); process.exit(1); }
    up++;
  }
  console.log(`uploaded ${up} photos`);
  // spot-check that the URLs actually resolve before any row points at them
  for (const n of [cards[0].front, cards[Math.floor(cards.length / 2)].back, cards[cards.length - 1].back]) {
    const r = await fetch(`${PUB}bbcard_drop_${n}.jpg`, { headers: { Range: 'bytes=0-99' } });
    if (r.status >= 400) { console.error(`URL check failed for ${n}: ${r.status}`); process.exit(1); }
  }
  console.log('URL spot-checks pass');

  // --- insert --------------------------------------------------------------
  let n = 0;
  for (const p of plan) {
    const photos = [`${PUB}bbcard_drop_${p.front}.jpg`, `${PUB}bbcard_drop_${p.back}.jpg`];
    await sql`
      INSERT INTO baseball_cards (user_id, player, set_name, year, card_number, parallel, sport,
                                  status, for_sale, asking_price_cents, comp_note, photo_urls, notes)
      VALUES (${UID}, ${p.player}, ${p.set_name}, 2026, ${p.num}, ${p.parallel}, 'Baseball',
              'photographed', false, ${p.ask}, ${p.comp_note}, ${JSON.stringify(photos)}::jsonb, ${p.note})`;
    n++;
  }
  console.log(`inserted ${n} rows`);

  // --- collision check, always ---------------------------------------------
  const clash: any = await sql`
    SELECT set_name, card_number, string_agg(DISTINCT player, ' | ') players
    FROM baseball_cards
    WHERE card_number IS NOT NULL AND card_number <> 'UNKNOWN'
    GROUP BY 1,2 HAVING count(DISTINCT player) > 1`;
  if (clash.length) {
    console.log('\nCARD NUMBER COLLISIONS - two players share a number, one is a misread:');
    for (const c of clash) console.log(`  ${c.set_name} #${c.card_number}: ${c.players}`);
  } else console.log('\nno card-number collisions');
  await sql.end();
}
main().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
