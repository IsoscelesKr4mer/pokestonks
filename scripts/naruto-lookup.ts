/**
 * Look up Naruto card codes against the narutodb checklist.
 *   npx tsx scripts/naruto-lookup.ts NREA02-MR-001L4 NREA02-UR-005L3 ...
 *   npx tsx scripts/naruto-lookup.ts --top NREA02        # what carries the set
 */
import { listCardsInSet, listAllPrices, resolve, priceConfidence } from './lib/narutodb';
const money = (c: number | null | undefined) => (c == null ? '   --  ' : `$${(c / 100).toFixed(2)}`.padStart(8));
const FLAG: Record<string, string> = { ok: '', weak: ' (1 obs)', placeholder: ' PLACEHOLDER', none: ' no price' };
(async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--top') {
    const setId = args[1] ?? 'NREA02';
    const [cards, prices] = await Promise.all([listCardsInSet(setId), listAllPrices()]);
    const pm = new Map(prices.map((p) => [p.card_number.toUpperCase(), p]));
    const rows = cards.map((c) => ({ c, p: pm.get(c.card_number.toUpperCase()) }))
      .filter((r) => r.p?.price_last_cents)
      .sort((a, b) => (b.p!.price_last_cents ?? 0) - (a.p!.price_last_cents ?? 0));
    console.log(`${setId}: ${cards.length} cards, top 18 by narutodb price\n`);
    for (const r of rows.slice(0, 18))
      console.log(`${money(r.p!.price_last_cents)}  ${r.c.card_number.padEnd(18)} ${String(r.c.character_name ?? '').padEnd(22)} ${r.p!.source}${FLAG[priceConfidence(r.p)]}`);
    return;
  }
  const out = await resolve('NREA02', args);
  for (const r of out) {
    if (!r.card) { console.log(`${r.input.padEnd(20)} NOT IN CHECKLIST${r.note ? '  ' + r.note : ''}`); continue; }
    console.log(`${r.card.card_number.padEnd(20)} ${String(r.card.rarity_code).padEnd(4)} ${String(r.card.character_name ?? '').padEnd(22)} ${money(r.price?.price_last_cents)}${FLAG[r.confidence]}${r.note ? '  ' + r.note : ''}`);
  }
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
