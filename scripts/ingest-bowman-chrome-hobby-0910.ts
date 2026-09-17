/**
 * File the 60-card 2026 Bowman Chrome hobby rip into baseball_cards.
 *
 *   npx tsx scripts/ingest-bowman-chrome-hobby-0910.ts          # dry run
 *   npx tsx scripts/ingest-bowman-chrome-hobby-0910.ts --apply
 *
 * PHOTOS ARE NOT UPLOADED. Supabase storage has been returning 402
 * (exceed_egress_quota) since 2026-09-09 and still is, so the normal intake
 * step "upload, verify each URL resolves, then archive the originals" cannot
 * run. These rows go in with an empty photo_urls and the originals STAY in
 * eBay_assets/card drop. Nothing is archived, nothing is deleted.
 * scripts/backfill-bowman-photos-0910.ts finishes the job once the bucket is
 * writable; front/back file numbers are recorded per row so it needs no
 * re-reading of the photos.
 *
 * Checks already run and passed:
 *   - all 33 letter-coded cards verified against the official Topps checklist
 *     (code exists AND the player name matches)
 *   - no collision: no two players share a card_number within a set
 *   - no existing 2026 Bowman row matches any of these player+number pairs
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFileSync } from 'fs';
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const UID = '66200525-2237-4cc3-948f-aaafd3253d4b';
const sql = postgres(process.env.DATABASE_URL_DIRECT!, { prepare: false });

const PHOTOS_PENDING =
  'photos pending: Supabase storage over egress quota on 2026-09-10, originals at ' +
  'eBay_assets/card drop (front IMG_%F, back IMG_%B)';

/** Extra context worth carrying on the row itself. */
const EXTRA: Record<number, string> = {
  1: 'Red RC shield, confirmed against the second copy of #76 (the base one) out of this same box',
  2: 'Red RC shield',
  9: 'Michael reports the signature was done in person and the player indicated the card pictures ' +
     'the wrong player; BCP-150 and BCP-188 both exist for Dalis and both carry the 1st Bowman logo',
  43: 'second copy of #76 from this box, the plain base one',
};

(async () => {
  const cards = JSON.parse(readFileSync('scripts/_bow_final_prices.json', 'utf8'));
  console.log(cards.length + ' cards to file\n');

  const rows = cards.map((c: any) => {
    const notes = [
      c.firstBowman ? '1st Bowman' : '',
      'Team: ' + c.team,
      EXTRA[c.i] || '',
      PHOTOS_PENDING.replace('%F', String(c.front)).replace('%B', String(c.back)),
    ].filter(Boolean).join(' | ');
    return {
      player: c.player,
      set_name: c.set_name,
      year: 2026,
      card_number: c.card_number,
      parallel: c.parallel,
      cents: c.price == null ? null : Math.round(c.price * 100),
      comp_note: c.price == null
        ? 'no live comps for this exact card on 2026-09-10'
        : c.note + ' (2026-09-10)',
      notes,
      // priced when we have a number, photographed when we do not
      status: c.price == null ? 'photographed' : 'priced',
    };
  });

  const money = (n: number | null) => (n == null ? '    -   ' : ('$' + (n / 100).toFixed(2)).padStart(8));
  for (const r of rows) {
    console.log(money(r.cents) + '  ' + String(r.card_number).padEnd(8) + ' ' +
      r.player.slice(0, 22).padEnd(23) + (r.parallel === 'base' ? '' : r.parallel));
  }
  const total = rows.reduce((s: number, r: any) => s + (r.cents || 0), 0);
  console.log('\ntotal ' + ('$' + (total / 100).toFixed(2)) +
    ' | unpriced ' + rows.filter((r: any) => r.cents == null).length);

  if (!APPLY) { console.log('\nDRY RUN, pass --apply to write'); await sql.end(); return; }

  let n = 0;
  for (const r of rows) {
    await sql`INSERT INTO baseball_cards
      (user_id, player, set_name, year, card_number, parallel, sport, status,
       for_sale, needs_back_photo, photo_urls, asking_price_cents, comp_note, notes)
      VALUES (${UID}, ${r.player}, ${r.set_name}, ${r.year}, ${r.card_number}, ${r.parallel},
       'Baseball', ${r.status}, true, false, '[]'::jsonb, ${r.cents}, ${r.comp_note}, ${r.notes})`;
    n++;
  }
  const tot = await sql`SELECT COUNT(*)::int c FROM baseball_cards`;
  console.log('\ninserted ' + n + '; collection now ' + tot[0].c);
  await sql.end();
})();
