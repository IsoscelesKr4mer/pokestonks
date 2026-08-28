/**
 * Turn the codes read off the photos into an inventory with narutodb values.
 *
 * `DUR` in the TSV is how the diamond parallel was transcribed; narutodb spells
 * it with the actual glyph, so it is mapped back before lookup.
 *
 * Prices are narutodb's. Where the source is `fixed` the number is a
 * placeholder, not a comp, and the report says so rather than summing it as if
 * it were real money.
 */
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { listCardsInSet, listAllPrices, priceConfidence } from './lib/narutodb';
config({ path: '.env.local' });

const TSV = 'data/naruto_codes_wip.tsv';

(async () => {
  const lines = readFileSync(TSV, 'utf8').trim().split(/\r?\n/).slice(1);
  const codes: string[] = [];
  for (const l of lines) {
    const [, code] = l.split('\t');
    if (!code || code === '?') continue;
    codes.push(code.replace('-DUR-', '-◇UR-'));
  }

  const [cards, prices] = await Promise.all([listCardsInSet('NREA02'), listAllPrices()]);
  const byNum = new Map(cards.map((c) => [c.card_number.toUpperCase(), c]));
  const priceBy = new Map(prices.map((p) => [p.card_number.toUpperCase(), p]));

  const counts = new Map<string, number>();
  const unknown: string[] = [];
  for (const c of codes) {
    const k = c.toUpperCase();
    if (!byNum.has(k)) { unknown.push(c); continue; }
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const ORDER = ['CR', 'AR', 'MR', '◇UR', 'UR', 'SSR', 'SR', 'R'];
  const rows = [...counts.entries()].map(([k, n]) => {
    const card = byNum.get(k)!;
    const p = priceBy.get(k);
    return { k, n, card, p, conf: priceConfidence(p), cents: p?.price_last_cents ?? 0 };
  });

  console.log(`${codes.length} cards read, ${counts.size} distinct, ${unknown.length} not in checklist\n`);
  if (unknown.length) console.log(`NOT IN CHECKLIST: ${unknown.join(', ')}\n`);

  let real = 0, placeholder = 0;
  for (const tier of ORDER) {
    const sub = rows.filter((r) => r.card.rarity_code === tier).sort((a, b) => b.cents - a.cents);
    if (!sub.length) { console.log(`${tier.padEnd(5)} none`); continue; }
    const copies = sub.reduce((a, r) => a + r.n, 0);
    const val = sub.reduce((a, r) => a + r.cents * r.n, 0);
    const isPh = sub[0].conf === 'placeholder';
    if (isPh) placeholder += val; else real += val;
    console.log(`\n${tier}  ${sub.length} distinct / ${copies} copies  = $${(val / 100).toFixed(2)}${isPh ? '  (placeholder pricing)' : ''}`);
    for (const r of sub.slice(0, 8))
      console.log(`   ${String(r.n)}x  ${r.k.padEnd(18)} ${String(r.card.character_name ?? '').padEnd(20)} $${(r.cents / 100).toFixed(2)}${r.conf === 'placeholder' ? ' ph' : ''}`);
    if (sub.length > 8) console.log(`   ... and ${sub.length - 8} more`);
  }

  console.log(`\nvalued at narutodb: $${(real / 100).toFixed(2)} on real comps, $${(placeholder / 100).toFixed(2)} more from placeholder-priced bulk`);
  console.log(`cost basis: 6 boxes x $11.05 = $66.30`);
})().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
